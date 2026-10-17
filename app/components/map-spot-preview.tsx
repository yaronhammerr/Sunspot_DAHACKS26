"use client";
import { useEffect, useRef } from "react";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import type * as Leaflet from "leaflet";
import type { Viewpoint } from "../../lib/types";
import type { MapLocation } from "../../lib/map-experience";
import { distanceMiles, sceneryLabel } from "../../lib/discovery";
import { mapPreviewPlacement } from "../../lib/map-preview";
import { mapSunLayout } from "../../lib/sun-preview";
import { sunPosition } from "../../lib/solar";
import { usePresence } from "./use-motion";
import ViewPhoto from "./view-photo";
import InlineTip from "./inline-tip";

export default function MapSpotPreview({ map, viewpoint, sunViewpoint, time, location, pinned, onEnter, onLeave, onClose, onOpen }: {
  map: Leaflet.Map | null; viewpoint: Viewpoint | null; location: MapLocation | null; pinned: boolean;
  sunViewpoint: Viewpoint | null; time: number;
  onEnter: () => void; onLeave: (id: string) => void; onClose: () => void; onOpen: (viewpoint: Viewpoint) => void;
}) {
  const last = useRef<Viewpoint | null>(null), anchor = useRef<HTMLDivElement>(null);
  if (viewpoint) last.current = viewpoint;
  const presence = usePresence(!!viewpoint, 140), place = viewpoint ?? last.current;
  useEffect(() => {
    if (!map || !place || !presence.present) return;
    const element = anchor.current;
    if (!element) return;
    let frame = 0;
    const position = () => {
      frame = 0;
      const point = map.latLngToContainerPoint([place.lat, place.lng]), size = map.getSize();
      const card = element.firstElementChild as HTMLElement;
      const body = card.firstElementChild as HTMLElement;
      const pill = map.getContainer().querySelector<HTMLElement>(".sun-direction-pill");
      const sunOrigin = sunViewpoint ? map.latLngToContainerPoint([sunViewpoint.lat, sunViewpoint.lng]) : null;
      const avoid = sunViewpoint && sunOrigin ? mapSunLayout(sunOrigin, sunPosition(sunViewpoint, time).bearing, size.x, size.y, pill?.offsetWidth || 205, pill?.offsetHeight || 32).avoid : undefined;
      const p = mapPreviewPlacement(point.x, point.y, size.x, size.y, card.offsetWidth, body.scrollHeight + 2, avoid);
      element.style.setProperty("--preview-max-height", `${Math.max(1, p.maxHeight - 2)}px`);
      element.style.left = `${p.x}px`; element.style.top = `${p.y}px`;
      element.style.setProperty("--pin-tip", `${p.tip}px`);
      element.dataset.below = String(p.below); element.style.visibility = p.visible ? "visible" : "hidden";
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
    const observer = new ResizeObserver(schedule); observer.observe(element.firstElementChild!);
    const pill = map.getContainer().querySelector(".sun-direction-pill"); if (pill) observer.observe(pill);
    map.on("move zoom resize viewreset", schedule); position();
    return () => { map.off("move zoom resize viewreset", schedule); cancelAnimationFrame(frame); observer.disconnect(); };
  }, [map, place, presence.present, sunViewpoint, time]);
  if (!presence.present || !place) return null;
  return <div ref={anchor} className="map-spot-preview-anchor" style={{ visibility: "hidden" }} onPointerEnter={onEnter} onPointerLeave={() => onLeave(place.id)}
    onFocus={onEnter} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onLeave(place.id); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <section key={place.id} className="map-spot-preview" data-motion={presence.state} data-pinned={pinned} aria-label={`Map preview of ${place.name}`} inert={!viewpoint}>
      <div className="map-preview-body">
      <button className="map-preview-open" onClick={() => onOpen(place)} aria-label={`Open full overview of ${place.name}`}>
        <ViewPhoto photo={place.photos[0]} name={place.name} eager />
        <span className="map-preview-copy"><span className="spot-scenery">{place.tags.slice(0, 2).map(sceneryLabel).join(" · ") || "A new perspective"}</span><strong>{place.name}</strong><span className="map-preview-distance"><MapPin size={11} />{location ? `${distanceMiles(location, place).toFixed(1)} mi away · straight-line` : place.county.replace(/ County$/, "")}</span><span className="spot-overview">Take a look <ArrowUpRight size={13} /></span></span>
      </button>
      <InlineTip id="map-preview">Tap a dot to keep its preview. Tap it again or × to return. Take a look opens full details.</InlineTip>
      </div>
      <button className="map-preview-close" aria-label="Close map preview" onClick={onClose}><X size={13} /></button>
    </section>
  </div>;
}
