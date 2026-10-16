"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, ChevronLeft, ChevronRight, Map as MapIcon, MapPin, Navigation, X } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import ViewPhoto from "./view-photo";
import ViewpointName from "./viewpoint-name";
import VisitDetails from "./visit-details";
import { useAnimatedViewpoint } from "./use-motion";

type Props = {
  viewpoint: Viewpoint; visible?: boolean; onClose: () => void;
  previous?: Viewpoint; next?: Viewpoint; position?: string;
  onNavigate?: (viewpoint: Viewpoint) => void;
};
export default function ViewpointDetail({ viewpoint, visible = true, onClose, previous, next, position, onNavigate }: Props) {
  const { displayed, phase } = useAnimatedViewpoint(viewpoint);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [settledId, setSettledId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Viewpoint | null>(null), [active, setActive] = useState(0);
  const place = loaded?.id === displayed.id ? loaded : displayed;
  const dialog = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null), carousel = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null), onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    close.current?.focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key === "Tab") {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? [])].filter(item => item.getClientRects().length && !item.closest("[inert]"));
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (!dialog.current?.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [visible]);
  useEffect(() => {
    const controller = new AbortController(); setDetailError(null); setActive(0);
    // Each new spot starts at its overview; keep the dialog and navigation focused.
    if (backdrop.current) backdrop.current.scrollTop = 0;
    if (carousel.current) carousel.current.scrollLeft = 0;
    fetch(`/api/viewpoints/${encodeURIComponent(displayed.id)}`, { cache: "no-cache", signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<{ viewpoint?: Viewpoint }> : Promise.reject(new Error("Details unavailable")))
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data?.viewpoint || data.viewpoint.id !== displayed.id) throw new Error("Details unavailable");
        setLoaded(data.viewpoint); setSettledId(displayed.id);
      })
      .catch(() => { if (!controller.signal.aborted) { setDetailError(displayed.id); setSettledId(displayed.id); } });
    return () => controller.abort();
  }, [displayed.id]);
  const photos = place.photos;
  const photoIndex = Math.min(active, Math.max(0, photos.length - 1));
  const go = (index: number) => carousel.current?.scrollTo({ left: index * carousel.current.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  return <div className="modal-backdrop" ref={backdrop} data-motion={visible ? "enter" : "exit"} inert={!visible} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="detail-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="detail-title" aria-hidden={!visible}>
      <button ref={close} className="close-dialog icon-button" onClick={onClose} aria-label="Close viewpoint details"><X size={20} /></button>
      {onNavigate && <nav className="detail-spot-navigation" aria-label="Switch viewpoint"><button disabled={!previous} onClick={() => previous && onNavigate(previous)} aria-label={previous ? `Previous viewpoint: ${previous.name}` : "Previous viewpoint"}><ChevronLeft size={16} /><span>Previous spot</span></button><span aria-live="polite">{position}</span><button disabled={!next} onClick={() => next && onNavigate(next)} aria-label={next ? `Next viewpoint: ${next.name}` : "Next viewpoint"}><span>Next spot</span><ChevronRight size={16} /></button></nav>}
      <div className="detail-place-content" key={place.id} data-motion={phase}>
        <header className="detail-overview-header"><div className="eyebrow orange"><MapPin size={14} />{place.county.replace(/ County$/, "")} County · {place.region === "bay-area" ? "Bay Area" : "Northern California"}</div><h2 id="detail-title">{place.name}</h2><nav className="detail-map-actions" aria-label="Open this viewpoint in a map"><a className="google-maps-button" href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`} target="_blank" rel="noopener noreferrer"><Navigation size={17} /><span>Open in Google Maps</span><ArrowUpRight size={16} /></a><a className="apple-maps-button" href={`https://maps.apple.com/place?coordinate=${place.lat},${place.lng}&name=${encodeURIComponent(place.name)}`} target="_blank" rel="noopener noreferrer"><MapIcon size={17} /><span>Open in Apple Maps</span><ArrowUpRight size={16} /></a></nav></header>
        <div className="detail-gallery"><div className="photo-carousel" ref={carousel} onScroll={e => { const el = e.currentTarget; if (el.clientWidth) setActive(Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth)))); }} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); go(Math.max(0, Math.min(photos.length - 1, photoIndex + (e.key === "ArrowRight" ? 1 : -1)))); } }} tabIndex={0} aria-label="Viewpoint photos; swipe to see more">{photos.length ? photos.map((p, i) => <ViewPhoto key={`${p.url}-${i}`} photo={p} name={place.name} className="detail-photo" eager />) : <ViewPhoto name={place.name} className="detail-photo" />}</div>{photos.length > 1 && <><button className="gallery-prev icon-button" onClick={() => go(Math.max(0, photoIndex - 1))} disabled={photoIndex === 0} aria-label="Previous photo"><ChevronLeft size={22} /></button><button className="gallery-next icon-button" onClick={() => go(Math.min(photos.length - 1, photoIndex + 1))} disabled={photoIndex === photos.length - 1} aria-label="Next photo"><ChevronRight size={22} /></button><span className="gallery-count"><Camera size={13} />{photoIndex + 1} / {photos.length}</span></>}</div>
        <div className="detail-body"><div className="detail-tags">{place.tags.map(t => <span key={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>)}</div><p className="detail-description">{place.description}</p><ViewpointName context={place.nameContext} />{place.visit ? <VisitDetails profile={place.visit} /> : <p className="detail-loading" role="status">{detailError === place.id ? "Trip-planning details couldn’t load. Check the location source before visiting." : settledId === place.id ? "Trip-planning details aren’t available yet. Check the location source before visiting." : "Loading trip-planning details…"}</p>}<div className="detail-coordinates">{place.lat.toFixed(5)}° N, {Math.abs(place.lng).toFixed(5)}° W<a href={place.sourceUrl} target="_blank" rel="noreferrer">View location source <ArrowUpRight size={12} /></a></div>{photos.length > 0 && <div className="photo-credits"><h3><Camera size={14} /> Behind the view</h3>{photos.length > 1 && <div className="gallery-thumbnails">{photos.map((p, i) => <button key={`${p.url}-${i}`} onClick={() => go(i)} className={photoIndex === i ? "active" : ""} aria-label={`See photo ${i + 1}`} aria-pressed={photoIndex === i}><ViewPhoto photo={p} name={place.name} /></button>)}</div>}<p>{photos[photoIndex]?.caption && <>{photos[photoIndex].caption}<br /></>}Photo by {photos[photoIndex]?.author} · {photos[photoIndex]?.license} <a href={photos[photoIndex]?.sourceUrl} target="_blank" rel="noreferrer">Original & license <ArrowUpRight size={11} /></a></p></div>}</div>
      </div>
    </div>
  </div>;
}
