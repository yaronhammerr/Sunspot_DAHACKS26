import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyMapWorker } from "../scripts/copy-map-worker.mjs";

test("the static map worker matches the installed release and contains no Vite client", () => {
  const directory = mkdtempSync(join(tmpdir(), "sunspot-map-worker-"));
  try {
    const [worker, sourceMap, license] = copyMapWorker(directory);
    const expected = readFileSync(new URL(import.meta.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs")));
    assert.deepEqual(readFileSync(worker), expected);
    assert.doesNotMatch(readFileSync(worker, "utf8"), /\/@vite\/client|worker_file|__vite__injectQuery/);
    assert.ok(readFileSync(license, "utf8").includes("Redistribution and use"));
    assert.equal(JSON.parse(readFileSync(sourceMap, "utf8")).file, "maplibre-gl-worker.mjs");
    const firstWrite = statSync(worker).mtimeMs;
    copyMapWorker(directory);
    assert.equal(statSync(worker).mtimeMs, firstWrite, "unchanged workers do not retrigger dev reloads");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
