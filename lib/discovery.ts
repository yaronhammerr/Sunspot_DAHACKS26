import type { Viewpoint } from "./types";
export const SCENERY = ["ocean", "bay", "water", "skyline", "bridges", "hills", "greenery"] as const;
export const SCENERY_LABELS: Record<string, string> = { ocean: "Ocean", bay: "Bay & harbor", water: "Lakes & rivers", skyline: "Skyline", bridges: "Bridges", hills: "Hills", greenery: "Greenery" };
export const sceneryLabel = (tag: string) => SCENERY_LABELS[tag] ?? tag;
/** Category chips are hard filters, even when preferences rank other scenery. */
export function filterScenery(viewpoints: Viewpoint[], scenery: string) {
  return scenery ? viewpoints.filter(viewpoint => viewpoint.tags.includes(scenery)) : viewpoints;
}
export function distanceMiles(a: {lat:number;lng:number}, b:{lat:number;lng:number}) {
  const rad = Math.PI/180;
  const dlat=(b.lat-a.lat)*rad, dlon=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 3958.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function recommend(all: Viewpoint[], saved: string[], preferences: string[], location?: {lat:number;lng:number}|null) {
  const savedSet=new Set(saved);
  const learned=new Set(all.filter(v=>savedSet.has(v.id)).flatMap(v=>v.tags));
  const score=(v:Viewpoint)=>v.tags.reduce((s,t)=>s+(preferences.includes(t)?2:0)+(learned.has(t)?1:0),0);
  return all.filter(v=>!savedSet.has(v.id)).sort((a,b)=>score(b)-score(a)
    || (location ? distanceMiles(location,a)-distanceMiles(location,b) : 0)
    || (a.featured??99999)-(b.featured??99999) || a.name.localeCompare(b.name));
}
export function recommendationReason(v:Viewpoint, all:Viewpoint[], saved:string[], prefs:string[]) {
  const explicit=v.tags.find(t=>prefs.includes(t));
  if(explicit) return `Picked for your love of ${explicit}`;
  const learned=new Set(all.filter(x=>saved.includes(x.id)).flatMap(x=>x.tags));
  const tag=v.tags.find(t=>learned.has(t));
  if(tag)return `Because you saved ${tag} viewpoints`;
  return v.featured!==null?"A Bay Area favorite, sourced for you":"A new perspective to explore";
}
