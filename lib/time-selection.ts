import { formatDate, fromPacific, HOUR, nextPacificDate, pacificDate, pacificInput, pacificOffset } from "./solar";

const MINUTE = 60_000;
export type TimeFields = { date: string; hour: string; minute: string; period: string };
export type TimeOption = TimeFields & { time: number };
function minuteWindow(now: number, end: number) {
  if (!Number.isFinite(now) || !Number.isFinite(end)) return null;
  const first = Math.ceil(now / MINUTE) * MINUTE, last = Math.floor(Math.min(end, now + 48 * HOUR) / MINUTE) * MINUTE;
  return first <= last ? { first, last } : null;
}
export function availableDates(now: number, end: number) {
  const window = minuteWindow(now, end);
  if (!window) return [];
  const today = pacificDate(now), tomorrow = nextPacificDate(today), last = pacificDate(window.last), dates: { value: string; label: string }[] = [];
  for (let date = pacificDate(window.first), i = 0; date <= last && i < 4; date = nextPacificDate(date), i++) {
    const label = formatDate(fromPacific(`${date}T12:00`)!);
    dates.push({ value: date, label: `${date === today ? "Today" : date === tomorrow ? "Tomorrow" : label.split(",")[0]} · ${label.slice(label.indexOf(",") + 2)}` });
  }
  return dates;
}
/** Enumerate real UTC minutes, so Pacific DST gaps vanish and folds stay valid.
 * Pacific offset changes occur on whole hours: only format the first minute of
 * each hour, instead of resolving thousands of wall-clock strings with Intl. */
export function availableTimes(now: number, end: number): TimeOption[] {
  const window = minuteWindow(now, end);
  if (!window) return [];
  const options: TimeOption[] = [];
  for (let time = window.first; time <= window.last;) {
    const wall = pacificInput(time), date = wall.slice(0, 10), hour24 = Number(wall.slice(11, 13)), minute = Number(wall.slice(14));
    const hour = String(hour24 % 12 || 12), period = hour24 >= 12 ? "PM" : "AM";
    for (let m = minute; m < 60 && time <= window.last; m++, time += MINUTE) options.push({ time, date, hour, minute: String(m).padStart(2, "0"), period });
  }
  return options;
}
/** Preserve the chosen date/period/hour where possible, then pick the closest
 * allowed minute. Every returned field combination is a real available instant. */
export function nearestAvailableTime(options: TimeOption[], desired: TimeFields, preferred: number): TimeOption | undefined {
  let candidates = options.filter(option => option.date === desired.date);
  if (!candidates.length) return options.reduce<TimeOption | undefined>((best, option) => !best || Math.abs(option.time - preferred) < Math.abs(best.time - preferred) ? option : best, undefined);
  const period = candidates.filter(option => option.period === desired.period);
  if (period.length) candidates = period;
  const hour = candidates.filter(option => option.hour === desired.hour);
  if (period.length && hour.length) candidates = hour;
  const minutes = (option: TimeFields) => (Number(option.hour) % 12 + (option.period === "PM" ? 12 : 0)) * 60 + Number(option.minute);
  const target = minutes(desired);
  return candidates.reduce((best, option) => {
    const distance = Math.abs(minutes(option) - target), previous = Math.abs(minutes(best) - target);
    return distance < previous || distance === previous && Math.abs(option.time - preferred) < Math.abs(best.time - preferred) ? option : best;
  });
}
export function timeBounds(date: string, now: number, end: number) {
  end = Math.min(end, now + 48 * HOUR);
  const midnight = fromPacific(`${date}T00:00`)!, noon = fromPacific(`${date}T12:00`)!;
  // A clock-only min/max cannot describe a repeated fall-back hour. Let the
  // UTC validator handle that day rather than disabling valid later instants.
  const repeats = pacificOffset(noon) < pacificOffset(midnight);
  return { min: !repeats && date === pacificDate(now) ? pacificInput(Math.ceil(now / 60_000) * 60_000).slice(11) : "00:00", max: !repeats && date === pacificDate(end) ? pacificInput(end).slice(11) : "23:59" };
}
export function selectDateAndTime(date: string, clock: string, selected: number, now: number, end: number, clampToDate = false): { time?: number; error?: string } {
  if (!Number.isFinite(now) || !Number.isFinite(end)) return { error: "Choose a time within the available forecast window." };
  end = Math.min(end, now + 48 * HOUR);
  if (!availableDates(now, end).some(d => d.value === date)) return { error: "Choose a date within the next 48 hours." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return { error: "Choose a valid time of day." };
  const wall = `${date}T${clock}`;
  let time = Number.isFinite(selected) && selected >= now && selected <= end && pacificInput(selected) === wall ? selected : fromPacific(wall);
  if (time === null) return { error: "That time is skipped by the daylight saving change. Choose another time." };
  if (time < now && pacificInput(time + HOUR) === wall && time + HOUR <= end) time += HOUR;
  if (clampToDate) {
    // Keep the selected calendar date, even when rounding now crosses midnight
    // or the remaining forecast window contains no selectable whole minute.
    const first = Math.max(Math.ceil(now / 60_000) * 60_000, fromPacific(`${date}T00:00`)!);
    const last = Math.min(Math.floor(end / 60_000) * 60_000, fromPacific(`${nextPacificDate(date)}T00:00`)! - 60_000);
    if (first > last) return { error: "Choose a time within the available forecast window." };
    return { time: Math.max(first, Math.min(last, time)) };
  }
  if (time < now || time > end) return { error: "Choose a time within the available forecast window." };
  return { time };
}
