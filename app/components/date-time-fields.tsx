"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { pacificDate, pacificInput } from "../../lib/solar";
import { availableDates, availableTimes, nearestAvailableTime, selectDateAndTime, type TimeFields } from "../../lib/time-selection";
import ThemedSelect from "./themed-select";

function fields(time: number): TimeFields {
  const clock = pacificInput(time).slice(11), hour = Number(clock.slice(0, 2));
  return { date: pacificDate(time), hour: String(hour % 12 || 12), minute: clock.slice(3), period: hour >= 12 ? "PM" : "AM" };
}

export default function DateTimeFields({ selected, now, end, revision, onSelect }: {
  selected: number; now: number; end: number; revision: number; onSelect: (time: number) => void;
}) {
  const id = useId(), [draft, setDraft] = useState<TimeFields | null>(null), [error, setError] = useState("");
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    // Expire past minutes even while the user leaves a picker open.
    const timer = window.setTimeout(() => setClockNow(Date.now()), 60_000 - Date.now() % 60_000 + 10);
    return () => window.clearTimeout(timer);
  }, [clockNow]);
  // Explicit Now/slider/shortcut selections reset pending edits. Live clock ticks
  // do not interrupt someone who is still choosing an hour or minute.
  useEffect(() => { setDraft(null); setError(""); }, [revision]);
  const current = Math.max(now, clockNow), first = Math.ceil(current / 60_000) * 60_000, last = Math.floor(Math.min(end, current + 48 * 3_600_000) / 60_000) * 60_000;
  const options = useMemo(() => availableTimes(first, last), [first, last]);
  const dates = useMemo(() => availableDates(current, last), [current, last]);
  const value = nearestAvailableTime(options, draft ?? fields(selected), selected), errorId = error ? `${id}-error` : undefined;
  const day = options.filter(option => option.date === value?.date), period = day.filter(option => option.period === value?.period), hour = period.filter(option => option.hour === value?.hour);
  const hours = [...new Set(period.map(option => option.hour))].sort((a, b) => Number(a) % 12 - Number(b) % 12).map(value => ({ value, label: value.padStart(2, "0") }));
  const minutes = [...new Set(hour.map(option => option.minute))].sort().map(value => ({ value, label: value }));
  const periods = [...new Set(day.map(option => option.period))].map(value => ({ value, label: value }));
  const change = (key: keyof TimeFields, next: string) => {
    if (!value) return;
    const valid = nearestAvailableTime(options, { ...value, [key]: next }, value.time);
    if (valid) setDraft(valid);
    setError("");
  };
  const refreshClock = () => {
    const latest = Date.now();
    setClockNow(previous => Math.ceil(previous / 60_000) === Math.ceil(latest / 60_000) ? previous : latest);
  };
  const apply = () => {
    if (!value) return;
    const hour = Number(value.hour) % 12 + (value.period === "PM" ? 12 : 0);
    const clock = `${String(hour).padStart(2, "0")}:${value.minute}`;
    const result = selectDateAndTime(value.date, clock, selected, Math.max(now, Date.now()), end);
    setError(result.error ?? "");
    if (result.time !== undefined) { onSelect(result.time); setDraft(null); }
  };
  if (!value) return <div className="date-time-fields"><p className="forecast-warning" role="status">No future minutes are available. Return to Now to continue.</p></div>;
  return <div className="date-time-fields" onPointerDownCapture={refreshClock} onKeyDownCapture={refreshClock}>
    <div className="date-time-row">
      <div className="date-field"><label htmlFor={`${id}-date`}><CalendarDays size={13} />Date</label><ThemedSelect id={`${id}-date`} label="Viewing date in Pacific Time" value={value.date} onChange={v => change("date", v)} options={dates} describedBy={errorId} invalid={!!error} /></div>
      <div className="time-field" role="group" aria-labelledby={`${id}-time-label`}>
        <span id={`${id}-time-label`}><Clock3 size={13} />Time</span>
        <div className="clock-pickers">
          <ThemedSelect label="Hour in Pacific Time" value={value.hour} onChange={v => change("hour", v)} options={hours} describedBy={errorId} />
          <span aria-hidden="true">:</span>
          <ThemedSelect label="Minute in Pacific Time" value={value.minute} onChange={v => change("minute", v)} options={minutes} describedBy={errorId} />
          <ThemedSelect label="AM or PM in Pacific Time" value={value.period} onChange={v => change("period", v)} options={periods} describedBy={errorId} />
        </div>
      </div>
    </div>
    <div className="date-time-footer"><span className="date-time-zone">Pacific Time</span><button className="apply-time" onClick={apply} disabled={!draft}>Apply time<ArrowRight size={13} /></button></div>
    {error && <p id={`${id}-error`} className="forecast-warning" role="alert">{error}</p>}
  </div>;
}
