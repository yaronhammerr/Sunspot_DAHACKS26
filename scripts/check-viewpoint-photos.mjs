import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { imageDimensions, isPublishablePhoto } from './photo-policy.mjs';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('data/catalog.json', root)));
const assets = new Map();
for (const place of catalog.viewpoints) {
  if (!place.photos.length) throw new Error(`${place.name} has no preview photo`);
  for (const photo of place.photos) {
    if (!isPublishablePhoto(photo)) throw new Error(`${place.name} has an unqualified preview`);
    assets.set(photo.url, photo);
  }
}
const checkBytes = (photo, bytes) => {
  if (bytes.length !== photo.bytes || createHash('sha256').update(bytes).digest('hex') !== photo.sha256) throw new Error(`${photo.url}: content failed integrity check`);
  const { width, height } = imageDimensions(bytes);
  if (width !== photo.width || height !== photo.height) throw new Error(`${photo.url}: actual resolution differs`);
};
for (const photo of assets.values()) checkBytes(photo, await readFile(new URL('public' + photo.url, root)));
const originArg = process.argv.find(arg => arg.startsWith('--origin='));
if (originArg) {
  const origin = new URL(originArg.slice('--origin='.length));
  const pending = [...assets.values()];
  await Promise.all(Array.from({length: 4}, async () => {
    for (let photo; (photo = pending.pop());) {
      const response = await fetch(new URL(photo.url, origin));
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`${photo.url}: HTTP ${response.status} or invalid image response`);
      checkBytes(photo, Buffer.from(await response.arrayBuffer()));
    }
  }));
}
console.log(`Verified ${catalog.viewpoints.length} photo-backed viewpoints and ${assets.size} unique high-resolution assets${originArg ? ', including live HTTP delivery' : ''}.`);
