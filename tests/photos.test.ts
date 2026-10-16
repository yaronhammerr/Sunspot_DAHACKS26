import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import catalog from "../data/catalog.json";
import exclusions from "../data/research/photo-exclusions.json";
import { handleApi } from "../lib/server";
import { applyPhotoPolicy, imageDimensions, isPublishablePhoto, hasPhotoResolution, PHOTO_POLICY } from "../scripts/photo-policy.mjs";

test("every published viewpoint has a reviewed, real high-resolution local image", async () => {
  const checked = new Set<string>();
  for (const v of catalog.viewpoints) {
    assert.ok(v.photos.length > 0, v.name);
    for (const raw of v.photos) {
      const p = raw as unknown as { url: string; width: number; height: number; sha256: string; bytes: number };
      assert.ok(isPublishablePhoto(raw), `${v.name}: photo policy`);
      if (checked.has(p.url)) continue;
      checked.add(p.url);
      const file = await readFile(new URL(`../public${p.url}`, import.meta.url));
      assert.equal(createHash("sha256").update(file).digest("hex"), p.sha256, p.url);
      assert.equal(file.length, p.bytes);
      assert.deepEqual(imageDimensions(file), { width: p.width, height: p.height });
      assert.ok(hasPhotoResolution(p.width, p.height));
      assert.ok(p.width * p.height <= PHOTO_POLICY.maxPixels);
    }
  }
});

test("publication rejects unreviewed, undersized and broken metadata, including old remote seed photos", () => {
  const photo = catalog.viewpoints[0].photos[0];
  assert.ok(isPublishablePhoto(photo));
  for (const change of [{ width: 400 }, { height: 300 }, { sourceWidth: 800 }, { verification: null }, { url: "https://example.com/image.jpg" }, { sha256: "missing" }, { author: "" }, { license: "CC BY-NC 4.0" }]) {
    assert.equal(isPublishablePhoto({ ...photo, ...change }), false, JSON.stringify(change));
  }
  const input = [{ id: "keep", photos: [] }, { id: "drop", photos: [photo] }];
  const result = applyPhotoPolicy(input, { checkedAt: "2026-10-16", viewpoints: { keep: { photos: [photo] } } });
  assert.deepEqual(result.viewpoints.map(v => v.id), ["keep"]);
  assert.deepEqual(result.excluded.map(v => v.id), ["drop"]);
  assert.deepEqual(input[0].photos, []);
});

test("portrait and panorama previews keep enough native pixels and preserve the full frame", () => {
  assert.equal(hasPhotoResolution(900, 1600), true);
  assert.equal(hasPhotoResolution(2400, 500), true);
  assert.equal(hasPhotoResolution(1024, 768), false);
  assert.equal(hasPhotoResolution(2400, 300), false);
  const base = catalog.viewpoints[0].photos[0];
  const panorama = { ...base, width: 2400, height: 500, sourceWidth: 4800, sourceHeight: 1000, displayFit: "contain" };
  assert.equal(isPublishablePhoto(panorama), true);
  assert.equal(isPublishablePhoto({ ...panorama, displayFit: undefined }), false);
  assert.equal(isPublishablePhoto({ ...panorama, sourceWidth: 1200 }), false);
});

test("photo-less research entries stay out of both public API routes", async () => {
  const publishedIds = new Set(catalog.viewpoints.map(v => v.id));
  const list = await handleApi(new Request("https://sunspot.example/api/viewpoints")).json() as { viewpoints: { id: string }[] };
  const listedIds = new Set(list.viewpoints.map(v => v.id));
  assert.equal(exclusions.inventory, catalog.viewpoints.length + exclusions.excluded.length);
  for (const entry of exclusions.excluded) {
    assert.equal(publishedIds.has(entry.id), false, entry.name);
    assert.equal(listedIds.has(entry.id), false, entry.name);
    assert.equal(handleApi(new Request(`https://sunspot.example/api/viewpoints/${encodeURIComponent(entry.id)}`)).status, 404, entry.name);
  }
});
