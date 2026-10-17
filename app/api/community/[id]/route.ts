import { env } from "cloudflare:workers";
import catalog from "../../../../data/catalog.json";
import { communityApi } from "../../../../lib/community";

const ids = new Set(catalog.viewpoints.map(v => v.id));
async function handle(request: Request) {
  let id: string;
  try { id = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? ""); }
  catch { return Response.json({ error: "Invalid viewpoint." }, { status: 400 }); }
  return communityApi(request, id, ids, env.DB);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
