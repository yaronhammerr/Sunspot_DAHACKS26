import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { communityApi, validateComment, type Community } from "../lib/community";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_community_reviews.sql", import.meta.url), "utf8"));
  const db = {
    prepare(sql: string) {
      let args: (string | number)[] = [];
      const statement = {
        bind(...values: (string | number)[]) { args = values; return statement; },
        async all() { return { results: sqlite.prepare(sql).all(...args), success: true }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) }, success: true }; },
      };
      return statement;
    },
    async batch(statements: { all: () => Promise<unknown> }[]) { return Promise.all(statements.map(s => s.all())); },
  } as unknown as D1Database;
  return { db, close: () => sqlite.close() };
}
const ids = new Set(["twin-peaks"]), now = 1_800_000_000_000;
function request(method: string, cookie?: string, body?: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/community/twin-peaks", { method, headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
test("community comments persist, are shared, escaped as data, and only their browser can delete", async () => {
  const store = database();
  try {
    const first = await communityApi(request("GET"), "twin-peaks", ids, store.db, now), cookie = first.headers.get("Set-Cookie")!.split(";")[0];
    assert.match(first.headers.get("Set-Cookie")!, /HttpOnly; SameSite=Lax/);
    const posted = await communityApi(request("POST", cookie, { body: "<script>plain text</script>" }), "twin-peaks", ids, store.db, now);
    assert.equal(posted.status, 201);
    const id = (await posted.json() as { comment: { id: string } }).comment.id;
    const own = await (await communityApi(request("GET", cookie), "twin-peaks", ids, store.db, now)).json() as Community;
    assert.equal(own.comments[0].mine, true);
    assert.equal(own.comments[0].displayName, "Visitor");
    assert.equal(own.comments[0].body, "<script>plain text</script>");
    assert.equal("visitorId" in own.comments[0], false);
    const other = await communityApi(request("GET"), "twin-peaks", ids, store.db, now), otherCookie = other.headers.get("Set-Cookie")!.split(";")[0];
    assert.equal((await other.json() as Community).comments[0].mine, false);
    assert.equal((await communityApi(request("DELETE", otherCookie, { commentId: id }), "twin-peaks", ids, store.db, now)).status, 404);
    assert.equal((await communityApi(request("DELETE", cookie, { commentId: id }), "twin-peaks", ids, store.db, now)).status, 200);
  } finally { store.close(); }
});
test("ratings are independent of comments and update a single browser vote", async () => {
  const store = database();
  try {
    const first = await communityApi(request("GET"), "twin-peaks", ids, store.db, now), cookie = first.headers.get("Set-Cookie")!.split(";")[0];
    assert.equal((await communityApi(request("PUT", cookie, { stars: 5 }), "twin-peaks", ids, store.db, now)).status, 200);
    assert.equal((await communityApi(request("PUT", cookie, { stars: 3 }), "twin-peaks", ids, store.db, now)).status, 200);
    const data = await (await communityApi(request("GET", cookie), "twin-peaks", ids, store.db, now)).json() as Community;
    assert.deepEqual([data.average, data.ratingCount, data.myRating, data.comments.length], [3, 1, 3, 0]);
    assert.equal((await communityApi(request("DELETE", cookie, { kind: "rating" }), "twin-peaks", ids, store.db, now)).status, 200);
    const cleared = await (await communityApi(request("GET", cookie), "twin-peaks", ids, store.db, now)).json() as Community;
    assert.deepEqual([cleared.average, cleared.ratingCount, cleared.myRating], [null, 0, null]);
    assert.equal((await communityApi(request("PUT", cookie, { stars: 6 }), "twin-peaks", ids, store.db, now)).status, 400);
  } finally { store.close(); }
});
test("community rejects invalid, cross-site, oversized and rapid submissions", async () => {
  const store = database();
  try {
    const first = await communityApi(request("GET"), "twin-peaks", ids, store.db, now), cookie = first.headers.get("Set-Cookie")!.split(";")[0];
    assert.equal(validateComment({ body: " " }), null);
    assert.deepEqual(validateComment({ body: "A useful trail note" }), { displayName: "Visitor", body: "A useful trail note" });
    assert.deepEqual(validateComment({ displayName: "A spoofed name", body: "test" }), { displayName: "Visitor", body: "test" });
    assert.equal((await communityApi(request("POST", cookie, { displayName: "x", body: "y" }, "https://elsewhere.test"), "twin-peaks", ids, store.db, now)).status, 403);
    assert.equal((await communityApi(request("POST", cookie, { displayName: "x", body: "x".repeat(6001) }), "twin-peaks", ids, store.db, now)).status, 413);
    for (let i = 0; i < 3; i++) assert.equal((await communityApi(request("POST", cookie, { displayName: "x", body: "y" }), "twin-peaks", ids, store.db, now)).status, 201);
    assert.equal((await communityApi(request("POST", cookie, { displayName: "x", body: "y" }), "twin-peaks", ids, store.db, now)).status, 429);
    assert.equal((await communityApi(request("GET"), "missing", ids, store.db, now)).status, 404);
    assert.equal((await communityApi(request("GET"), "twin-peaks", ids, undefined, now)).status, 503);
  } finally { store.close(); }
});
