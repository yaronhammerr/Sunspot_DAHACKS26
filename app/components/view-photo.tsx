"use client";
import { useEffect, useRef, useState } from "react";
import { Mountain, Camera } from "lucide-react";
import type { Photo } from "../../lib/types";
export default function ViewPhoto({ photo, name, className = "", eager = false }: { photo?: Photo; name: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false), img = useRef<HTMLImageElement>(null);
  useEffect(() => { setFailed(false); setLoaded(!!img.current?.complete && img.current.naturalWidth > 0); }, [photo?.url]);
  return <div className={`view-photo ${className} ${!photo || failed ? "photo-placeholder" : ""}`}>{photo && !failed ? <img ref={img} data-loaded={loaded} onLoad={() => setLoaded(true)} src={photo.url} alt={photo.caption || `View from ${name}`} width={photo.width} height={photo.height} style={className.includes("detail-photo") && photo.displayFit ? { objectFit: photo.displayFit } : undefined} decoding="async" loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} /> : <><div className="placeholder-landscape"><Mountain size={70} strokeWidth={0.8} /></div><span><Camera size={15} />A view waiting to be discovered</span></>}</div>;
}
