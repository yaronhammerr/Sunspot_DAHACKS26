import { getPosition, getTimes } from "suncalc";

export const PACIFIC = "America/Los_Angeles";
export const HOUR = 3_600_000;
export type Point = { lat: number; lng: number };
const pacificFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const parts = (time: number) => Object.fromEntries(pacificFormatter.formatToParts(time).map(p => [p.type, p.value]));
export function pacificDate(time: number) { const p = parts(time); return `${p.year}-${p.month}-${p.day}`; }
export function pacificInput(time: number) { const p = parts(time); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
export function pacificOffset(time: number) { const p = parts(time); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(time / 1000) * 1000) / 60_000; }
// Find actual UTC instants, including DST gaps/folds. A repeated local time selects
// its first occurrence; the elapsed-time slider can reach either occurrence.
export function fromPacific(input: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const wall = Date.parse(`${input}:00Z`);
  for (const offset of [-7, -8]) { const t = wall - offset * HOUR; if (Number.isFinite(t) && pacificInput(t) === input) return t; }
  return null;
}
export function nextPacificDate(date: string, days = 1) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 24 * HOUR).toISOString().slice(0, 10); }
export function formatTime(time: number | null) { return time === null ? "Unavailable" : new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, hour: "numeric", minute: "2-digit" }).format(time); }
export function formatDate(time: number) { return new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, weekday: "short", month: "short", day: "numeric" }).format(time); }
export function compass(bearing: number) { return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(((bearing % 360 + 360) % 360) / 22.5) % 16]; }
export function sunPosition(point: Point, time: number) {
  const p = getPosition(new Date(time), point.lat, point.lng);
  // Installed SunCalc 2.1.1: degrees, true north clockwise, altitude already
  // refracted. Do not use the radians/south-based conversion from SunCalc 1.x.
  return { bearing: (p.azimuth % 360 + 360) % 360, elevation: p.altitude };
}
function calculateDay(point: Point, date: string) {
  const noon = fromPacific(`${date}T12:00`)!;
  const t = getTimes(new Date(noon), point.lat, point.lng, 0, pacificOffset(noon));
  const ms = (d: Date | null) => d && Number.isFinite(+d) ? +d : null;
  const sunset = ms(t.sunset);
  return { date, sunrise: ms(t.sunrise), sunset, dawn: ms(t.dawn), dusk: ms(t.dusk), goldenStart: ms(t.goldenHour), goldenEnd: sunset, sunsetBearing: sunset === null ? null : sunPosition(point, sunset).bearing, noon: +t.solarNoon };
}
const days = new Map<string, ReturnType<typeof calculateDay>>();
export function solarDay(point: Point, selected: number) {
  const date = pacificDate(selected), key = `${point.lat},${point.lng}:${date}`;
  let day = days.get(key);
  if (!day) { day = calculateDay(point, date); if (days.size >= 4096) days.clear(); days.set(key, day); }
  return day;
}
export function sunPhase(point: Point, time: number): "above" | "twilight" | "night" {
  const d = solarDay(point, time);
  if (d.sunrise !== null && d.sunset !== null && time >= d.sunrise && time < d.sunset) return "above";
  if (d.dawn !== null && d.dusk !== null && time >= d.dawn && time <= d.dusk) return "twilight";
  return "night";
}
export function destination(point: Point, bearing: number, meters: number): Point {
  const r = Math.PI / 180, d = meters / 6371000, a = point.lat * r, b = bearing * r;
  const lat = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(b));
  const lng = point.lng * r + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(lat));
  return { lat: lat / r, lng: lng / r };
}
