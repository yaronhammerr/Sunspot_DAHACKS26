"use client";
import { useEffect, useState } from "react";
import { Mountain, Camera } from "lucide-react";
import type { Photo } from "../../lib/types";
export default function ViewPhoto({ photo, name, className = "", eager = false }: { photo?: Photo; name: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo?.url]);
  return <div className={`view-photo ${className} ${!photo || failed ? "photo-placeholder" : ""}`}>{photo && !failed ? <img src={photo.url} alt={photo.caption || `View from ${name}`} loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} /> : <><div className="placeholder-landscape"><Mountain size={70} strokeWidth={0.8} /></div><span><Camera size={15} />A view waiting to be discovered</span></>}</div>;
}
