"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, MapPin, Sparkles } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import type { MapLocation } from "../../lib/map-experience";
import { distanceMiles } from "../../lib/discovery";
import ViewPhoto from "./view-photo";

type Props = {
  viewpoints: Viewpoint[]; location: MapLocation | null; hidden: boolean;
  loading: boolean; error: string; matchingCount: number; hasFilters: boolean;
  onSelect: (v: Viewpoint) => void; onHighlight: (ids: string[]) => void;
  onActive: (id: string | null) => void; onReset: () => void; onRetry: () => void;
};
export default function RecommendedSpots({ viewpoints, location, hidden, loading, error, matchingCount, hasFilters, onSelect, onHighlight, onActive, onReset, onRetry }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  const [position, setPosition] = useState(0);
  const [canMove, setCanMove] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = dock.current, home = element?.closest<HTMLElement>(".map-home");
    if (!element || !home) return;
    const resize = new ResizeObserver(() => {
      if (element.offsetHeight) home.style.setProperty("--dock-height", `${element.offsetHeight}px`);
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const root = rail.current;
    setPosition(0); setCanMove({ previous: false, next: false });
    onActive(null);
    if (!root) { onHighlight([]); return; }
    root.scrollTo({ left: 0, behavior: "instant" });
    const cards = [...root.querySelectorAll<HTMLElement>("[data-spot-id]")];
    let highlighted = "", frame = 0;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const visible = cards.filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.width > 0 && Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left) >= rect.width / 2;
      });
      const ids = visible.map(card => card.dataset.spotId!);
      const signature = ids.join("|");
      if (signature !== highlighted) { highlighted = signature; onHighlight(ids); }
      const index = cards.indexOf(visible[0]);
      if (index >= 0) setPosition(index);
      // At desktop widths several cards are visible. Their first index never
      // reaches the final item, so use the rail's actual bounds for the arrows.
      setCanMove({ previous: root.scrollLeft > 1, next: root.scrollWidth - root.clientWidth - root.scrollLeft > 1 });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    cards.forEach(card => observer.observe(card));
    root.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => { cancelAnimationFrame(frame); root.removeEventListener("scroll", schedule); observer.disconnect(); };
  }, [viewpoints, loading, error, onHighlight, onActive]);
  const move = (direction: number) => {
    const root = rail.current; if (!root) return;
    root.scrollBy({ left: direction * (root.querySelector<HTMLElement>("[data-spot-id]")?.offsetWidth ?? 300) + direction * 12, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <section ref={dock} className="recommendation-dock" aria-labelledby="recommendation-title" data-hidden={hidden} aria-hidden={hidden} inert={hidden}>
    <div className="dock-heading"><div><span className="dock-eyebrow"><Sparkles size={12} /> A LITTLE FRESH PERSPECTIVE</span><h1 id="recommendation-title">{hasFilters ? "Your kind of view." : location ? "Good views, close by." : "Find your next escape."}</h1><p>{location ? "Nearby picks · distances in a straight line" : "Bay Area favorites · enable location for nearby picks"}</p></div><div className="rail-navigation"><span>{viewpoints.length ? `${position + 1} / ${viewpoints.length}` : ""}</span><button onClick={() => move(-1)} disabled={!canMove.previous} aria-label="Previous recommended spots"><ChevronLeft size={19} /></button><button onClick={() => move(1)} disabled={!canMove.next} aria-label="Next recommended spots"><ChevronRight size={19} /></button></div></div>
    {error ? <div className="dock-message" role="alert"><p>{error}</p><button onClick={onRetry}>Try again <ArrowRight size={14} /></button></div> : loading ? <div className="dock-message" role="status">Finding your next favorite view…</div> : !viewpoints.length ? <div className="dock-message"><p>No viewpoints match these filters. Try a wider area or another kind of scenery.</p><button onClick={onReset}>Reset filters <ArrowRight size={14} /></button></div> : <div className="recommendation-rail" ref={rail} aria-label="Recommended viewpoints; swipe to explore" onMouseLeave={() => onActive(null)}>{viewpoints.map((v, index) => <button className="spot-card" data-spot-id={v.id} key={v.id} onClick={() => onSelect(v)} onMouseEnter={() => onActive(v.id)} onFocus={() => onActive(v.id)} onBlur={() => onActive(null)} aria-label={`Overview of ${v.name}${location ? `, ${distanceMiles(location, v).toFixed(1)} miles away` : ""}`}>
      <div className="spot-card-image"><ViewPhoto photo={v.photos[0]} name={v.name} eager={index < 3} /><span className="spot-number">{String(index + 1).padStart(2, "0")}</span></div>
      <div className="spot-card-copy"><span className="spot-scenery">{v.tags.slice(0, 2).join(" · ") || "A new perspective"}</span><h2>{v.name}</h2><p><MapPin size={11} />{location ? `${distanceMiles(location, v).toFixed(1)} mi away` : v.county.replace(/ County$/, "")}</p><span className="spot-overview">Take a look <ArrowUpRight size={14} /></span></div>
    </button>)}</div>}
    <div className="dock-footer"><span><i /> Orange pins match the visible cards</span><span>{matchingCount.toLocaleString()} spots to explore</span></div>
  </section>;
}
