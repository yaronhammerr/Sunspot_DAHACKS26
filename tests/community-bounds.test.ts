import test from "node:test";
import assert from "node:assert/strict";
import { communityApi } from "../lib/community";

const endpoint = "https://sunspot.example/api/community/twin-peaks";
const ids = new Set(["twin-peaks"]);
function database() {
  let writes = 0;
  const db = { prepare() { return { bind() { return { async run() { writes++; return { meta: { changes: 1 } }; } }; } }; } } as unknown as D1Database;
  return { db, writes: () => writes };
}
function streamRequest(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let canceled = false, consumed = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const value = chunks[consumed++];
      if (value) controller.enqueue(value); else controller.close();
    },
    cancel() { canceled = true; },
  });
  const request = new Request(endpoint, { method: "POST", body, duplex: "half", headers: { "Content-Type": "application/json", ...headers } } as RequestInit);
  return { request, canceled: () => canceled, consumed: () => consumed };
}
const bytes = (value: string) => new TextEncoder().encode(value);

test("oversized chunked community bodies stop reading and never write to D1", async () => {
  const { db, writes } = database();
  const body = streamRequest(Array.from({ length: 20 }, () => bytes("x".repeat(1000))));
  const result = await communityApi(body.request, "twin-peaks", ids, db);
  assert.equal(result.status, 413);
  assert.equal(body.canceled(), true);
  assert.ok(body.consumed() < 20, "The remaining request is canceled rather than buffered");
  assert.equal(writes(), 0);
});

test("declared oversized community bodies are rejected before they are buffered", async () => {
  const { db, writes } = database();
  const body = streamRequest([bytes("x".repeat(100_000))], { "Content-Length": "100000" });
  const result = await communityApi(body.request, "twin-peaks", ids, db);
  assert.equal(result.status, 413);
  assert.equal(body.canceled(), true);
  assert.equal(writes(), 0);
});

test("the community body limit counts UTF-8 bytes rather than JavaScript characters", async () => {
  const { db, writes } = database();
  const json = JSON.stringify({ displayName: "Walker", body: "Nice view.", padding: "☀".repeat(2100) });
  assert.ok(json.length < 6000 && bytes(json).length > 6000);
  const result = await communityApi(streamRequest([bytes(json)]).request, "twin-peaks", ids, db);
  assert.equal(result.status, 413);
  assert.equal(writes(), 0);
});

test("bounded streaming preserves Unicode characters split between chunks", async () => {
  const { db, writes } = database();
  const encoded = bytes(JSON.stringify({ displayName: "Walker", body: "Great view 🌄" }));
  const chunks = Array.from(encoded, n => Uint8Array.of(n));
  const result = await communityApi(streamRequest(chunks).request, "twin-peaks", ids, db);
  assert.equal(result.status, 201);
  assert.equal((await result.json() as { comment: { body: string } }).comment.body, "Great view 🌄");
  assert.equal(writes(), 1);
});

test("malformed bounded JSON still returns an actionable validation response", async () => {
  const { db, writes } = database();
  const result = await communityApi(streamRequest([bytes("{")]).request, "twin-peaks", ids, db);
  assert.equal(result.status, 400);
  assert.equal(writes(), 0);
});
