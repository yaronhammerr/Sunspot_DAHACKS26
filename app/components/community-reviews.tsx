"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { MessageCircle, Star, Trash2 } from "lucide-react";
import type { Community } from "../../lib/community";

export default function CommunityReviews({ viewpointId }: { viewpointId: string }) {
  const id = useId(), [data, setData] = useState<Community | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [body, setBody] = useState(""), [notice, setNotice] = useState("");
  const endpoint = `/api/community/${encodeURIComponent(viewpointId)}`;
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal, cache: "no-store" });
    const value = await response.json() as Community & { error?: string };
    if (!response.ok) throw new Error(value.error ?? "Community reviews couldn’t load.");
    if (!signal?.aborted) setData(value as Community);
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(""); setNotice("");
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [load]);
  const write = async (method: "POST" | "PUT" | "DELETE", value: unknown) => {
    if (busy || !data) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t save. Please try again.");
      if (method === "POST") setBody("");
      await load(); setNotice(method === "POST" ? "Comment added." : method === "PUT" ? "Your rating is saved." : "Removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t save. Please try again."); }
    finally { setBusy(false); }
  };
  return <section className="community-reviews" aria-labelledby={`${id}-title`}><header><div className="eyebrow orange"><MessageCircle size={13} />FROM THE TRAIL</div><h3 id={`${id}-title`}>What’s it like out there?</h3><p>Rate the view, leave a trail note, or both.</p></header>
    <div className="community-rating"><div><b>{data?.average !== null && data?.average !== undefined ? data.average.toFixed(1) : "—"}<Star size={15} /></b><span>{data ? `${data.ratingCount} ${data.ratingCount === 1 ? "rating" : "ratings"}` : "Loading…"}</span></div><fieldset disabled={busy || !data}><legend>Your rating</legend><div className="rating-stars">{[1, 2, 3, 4, 5].map(stars => <button key={stars} aria-label={`Rate ${stars} ${stars === 1 ? "star" : "stars"}`} aria-pressed={data?.myRating === stars} data-filled={stars <= (data?.myRating ?? 0)} onClick={() => void write("PUT", { stars })}><Star size={23} /></button>)}</div>{data?.myRating !== null && data?.myRating !== undefined && <button className="clear-rating" onClick={() => void write("DELETE", { kind: "rating" })}>Remove my rating</button>}</fieldset></div>
    <p className="community-note">Ratings are from visitors, not verified inspections. One rating per browser; selecting again updates it.</p>
    <form className="comment-form" onSubmit={e => { e.preventDefault(); void write("POST", { body }); }}><label htmlFor={`${id}-comment`}>Leave a comment<textarea id={`${id}-comment`} maxLength={1000} rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="How was the trail, access, or view?" required disabled={busy || !data} /></label><div><span>Public · {body.length}/1,000</span><button type="submit" disabled={busy || !data || !body.trim()}>{busy ? "Saving…" : "Post comment"}</button></div></form>
    {error && <div className="community-error" role="alert"><p>{error}</p>{!data && <button onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Try again</button>}</div>}{notice && <p className="community-notice" role="status">{notice}</p>}
    <div className="community-comments">{data?.comments.length === 0 && <p className="community-empty">No trail notes yet. Be the first to share one.</p>}{data?.comments.map(comment => <article key={comment.id}><div><strong>{comment.mine ? "You" : comment.displayName}</strong><time dateTime={new Date(comment.createdAt).toISOString()}>{new Date(comment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>{comment.mine && <button aria-label="Delete your comment" disabled={busy} onClick={() => void write("DELETE", { commentId: comment.id })}><Trash2 size={13} /></button>}</div><p>{comment.body}</p></article>)}</div>
  </section>;
}
