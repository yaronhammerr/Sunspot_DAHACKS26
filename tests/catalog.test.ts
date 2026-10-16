import test from "node:test";
import assert from "node:assert/strict";
import data from "../data/catalog.json";
import { handleApi } from "../lib/server";

test("real catalog has unique locations across the Bay Area and Northern California and credited photos", () => {
  assert.ok(data.counties.length > 0);
  assert.equal(new Set(data.viewpoints.map(v=>v.id)).size,data.viewpoints.length);
  assert.ok(data.viewpoints.length > 0);
  assert.ok(Number.isFinite(Date.parse(data.importedAt)));
  for(const v of data.viewpoints) {
    assert.ok(v.lat>32&&v.lat<43&&v.lng>-125&&v.lng<-114,`${v.name}: California geographic bounds`);
    assert.ok(data.counties.includes(v.county));
    assert.ok(v.sourceUrl.startsWith("https://"));
    assert.ok(v.photos.length > 0, `${v.name}: every published spot needs a preview`);
    for(const p of v.photos) {
      assert.ok(p.author&&p.license&&p.sourceUrl&&p.url);
      assert.ok(p.url.startsWith("/viewpoints/photos/"));
    }
  }
  assert.equal(new Set(data.viewpoints.map(v=>v.county)).size,data.counties.length);
});

test("catalog API lists exact count and returns matching details",async()=>{
  const list=await handleApi(new Request("https://sunspot.example/api/viewpoints")).json() as {count:number};
  assert.equal(list.count,data.viewpoints.length);
  const first=data.viewpoints[0];
  const detail=await handleApi(new Request(`https://sunspot.example/api/viewpoints/${first.id}`)).json() as {viewpoint: {name:string}};
  assert.equal(detail.viewpoint.name,first.name);
});

test("invalid and unsupported routes do not pretend to succeed",()=>{
  assert.equal(handleApi(new Request("https://sunspot.example/api/viewpoints/not-a-real-place")).status,404);
  assert.equal(handleApi(new Request("https://sunspot.example/api/viewpoints/%ZZ")).status,400);
  assert.equal(handleApi(new Request("https://sunspot.example/api/viewpoints",{method:"POST"})).status,405);
  assert.equal(handleApi(new Request("https://sunspot.example/api/session")).status,404);
});


test("catalog list stays compact and detail endpoint retains sourced planning facts", async () => {
  const list = await handleApi(new Request("https://sunspot.example/api/viewpoints")).json() as { viewpoints: { visit?: unknown; researchStatus?: string }[] };
  assert.ok(list.viewpoints.every(v => !("visit" in v) && v.researchStatus));
  const detail = await handleApi(new Request("https://sunspot.example/api/viewpoints/mount-umunhum")).json() as { viewpoint: { visit: { routes: unknown[]; sources: unknown[] } } };
  assert.equal(detail.viewpoint.visit.routes.length, 2);
  assert.ok(detail.viewpoint.visit.sources.length > 0);
});
