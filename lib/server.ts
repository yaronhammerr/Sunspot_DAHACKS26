import catalogData from "../data/catalog.json";
import type { Catalog } from "./types";

const catalog = catalogData as Catalog;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}

export function handleApi(request: Request): Response {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (path === "/api/viewpoints") {
    return json({ viewpoints: catalog.viewpoints.map(({ visit, ...v }) => ({ ...v, researchStatus: visit?.reviewStatus })), coverage: catalog.coverage, count: catalog.viewpoints.length, importedAt: catalog.importedAt, counties: catalog.counties, sources: catalog.sources });
  }
  const match = /^\/api\/viewpoints\/([^/]+)$/.exec(path);
  if (match) {
    let id: string;
    try { id = decodeURIComponent(match[1]); }
    catch { return json({ error: "Invalid viewpoint ID." }, 400); }
    const viewpoint = catalog.viewpoints.find(item => item.id === id);
    return viewpoint ? json({ viewpoint }) : json({ error: "Viewpoint not found." }, 404);
  }
  return json({ error: "Endpoint not found." }, 404);
}
