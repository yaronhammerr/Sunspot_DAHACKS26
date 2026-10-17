export type CommunityComment = { id: string; displayName: string; body: string; createdAt: number; mine: boolean };
export type Community = { comments: CommunityComment[]; average: number | null; ratingCount: number; myRating: number | null };
const COOKIE = "sunspot_visitor";
const visitorPattern = /^[a-f0-9-]{36}$/i;
const MAX_REQUEST_BYTES = 6000;
async function boundedBody(request: Request): Promise<string | null> {
  const body = request.body;
  if (!body) return "";
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_REQUEST_BYTES) {
    await body.cancel();
    return null;
  }
  const reader = body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}
export function validateComment(value: unknown): { displayName: string; body: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.body !== "string") return null;
  const body = v.body.trim();
  if (body.length < 1 || body.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)) return null;
  return { displayName: "Visitor", body };
}
export async function communityApi(request: Request, viewpointId: string, validIds: ReadonlySet<string>, db: D1Database | undefined, now = Date.now()): Promise<Response> {
  if (!validIds.has(viewpointId)) return json({ error: "Viewpoint not found." }, 404);
  if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  if (!db) return json({ error: "Community reviews are temporarily unavailable." }, 503);
  const url = new URL(request.url), origin = request.headers.get("Origin");
  if (request.method !== "GET" && ((origin && origin !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site")) return json({ error: "Please submit from Sunspot." }, 403);
  const existing = request.headers.get("Cookie")?.split(";").map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const visitor = existing && visitorPattern.test(existing) ? existing : crypto.randomUUID();
  const cookie = existing === visitor ? undefined : `${COOKIE}=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`;
  try {
    if (request.method === "GET") {
      const results = await db.batch([
        db.prepare("SELECT id, display_name AS displayName, body, created_at AS createdAt, visitor_id = ? AS mine FROM viewpoint_comments WHERE viewpoint_id = ? ORDER BY created_at DESC, id DESC LIMIT 100").bind(visitor, viewpointId),
        db.prepare("SELECT AVG(stars) AS average, COUNT(*) AS ratingCount FROM viewpoint_ratings WHERE viewpoint_id = ?").bind(viewpointId),
        db.prepare("SELECT stars FROM viewpoint_ratings WHERE viewpoint_id = ? AND visitor_id = ?").bind(viewpointId, visitor),
      ]);
      const summary = results[1].results[0] as { average: number | null; ratingCount: number };
      return json({ comments: (results[0].results as (Omit<CommunityComment, "mine"> & { mine: number })[]).map(row => ({ ...row, mine: !!row.mine })), ...summary, myRating: (results[2].results as { stars: number }[])[0]?.stars ?? null }, 200, cookie);
    }
    if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "Send a JSON request." }, 415, cookie);
    const text = await boundedBody(request);
    if (text === null) return json({ error: "Your message is too long." }, 413, cookie);
    let value: unknown;
    try { value = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400, cookie); }
    const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (request.method === "POST") {
      const comment = validateComment(value);
      if (!comment) return json({ error: "Write a comment of 1–1,000 characters." }, 400, cookie);
      const id = crypto.randomUUID();
      const result = await db.prepare("INSERT INTO viewpoint_comments (id, viewpoint_id, visitor_id, display_name, body, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM viewpoint_comments WHERE visitor_id = ? AND created_at > ?) < 3").bind(id, viewpointId, visitor, comment.displayName, comment.body, now, visitor, now - 60_000).run();
      if (!result.meta.changes) return json({ error: "Please wait a minute before adding another comment." }, 429, cookie);
      return json({ comment: { id, ...comment, createdAt: now, mine: true } }, 201, cookie);
    }
    if (request.method === "PUT") {
      const stars = input.stars;
      if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) return json({ error: "Choose 1 to 5 stars." }, 400, cookie);
      await db.prepare("INSERT INTO viewpoint_ratings (viewpoint_id, visitor_id, stars, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(viewpoint_id, visitor_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at").bind(viewpointId, visitor, stars, now).run();
      return json({ stars }, 200, cookie);
    }
    if (input.kind === "rating") {
      await db.prepare("DELETE FROM viewpoint_ratings WHERE viewpoint_id = ? AND visitor_id = ?").bind(viewpointId, visitor).run();
      return json({ deleted: true }, 200, cookie);
    }
    if (typeof input.commentId !== "string" || !visitorPattern.test(input.commentId)) return json({ error: "Choose a valid comment." }, 400, cookie);
    const result = await db.prepare("DELETE FROM viewpoint_comments WHERE id = ? AND viewpoint_id = ? AND visitor_id = ?").bind(input.commentId, viewpointId, visitor).run();
    return result.meta.changes ? json({ deleted: true }, 200, cookie) : json({ error: "Comment not found or belongs to another visitor." }, 404, cookie);
  } catch { return json({ error: "Community reviews couldn’t load. Please try again." }, 503, cookie); }
}
