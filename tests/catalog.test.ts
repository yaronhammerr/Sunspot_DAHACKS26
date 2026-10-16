import test from "node:test";
import assert from "node:assert/strict";
import data from "../data/catalog.json";
import { handleApi } from "../lib/server";

test("real catalog has unique locations across nine counties and credited photos", () => {
  assert.equal(data.counties.length, 9);
  assert.equal(new Set(data.viewpoints.map(v=>v.id)).size,data.viewpoints.length);
  assert.ok(data.viewpoints.length>=20);
  assert.ok(Number.isFinite(Date.parse(data.importedAt)));
  for(const v of data.viewpoints) {
    assert.ok(v.lat>36&&v.lat<40&&v.lng>-124&&v.lng<-120,`${v.name}: Bay Area coordinates`);
    assert.ok(data.counties.includes(v.county));
    assert.ok(v.sourceUrl.startsWith("https://"));
    for(const p of v.photos) {
      assert.ok(p.author&&p.license&&p.sourceUrl&&p.url);
      assert.ok(p.url.startsWith("https://"));
    }
  }
  assert.equal(new Set(data.viewpoints.map(v=>v.county)).size,9);
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
