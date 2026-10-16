import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Serve the already-built worker as a public asset. Vite's module/worker
// transforms inject its HMR client into this distribution in development;
// that client cannot establish a browser hot-reload connection from a worker.
// Keep the worker paired with the installed MapLibre version in both modes.
/** @param {string | URL} [destination] */
export function copyMapWorker(destination = new URL("../public/vendor/", import.meta.url)) {
  const directory = destination instanceof URL ? fileURLToPath(destination) : destination;
  const worker = new URL(import.meta.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"));
  const files = [
    [worker, "maplibre-gl-worker.mjs"],
    [new URL("maplibre-gl-worker.mjs.map", worker), "maplibre-gl-worker.mjs.map"],
    [new URL("../LICENSE.txt", worker), "maplibre-gl.LICENSE.txt"],
  ];
  return files.map(([source, filename]) => {
    const target = resolve(directory, filename);
    const contents = readFileSync(source);
    let current;
    try { current = readFileSync(target); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!current?.equals(contents)) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    return target;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) copyMapWorker();
