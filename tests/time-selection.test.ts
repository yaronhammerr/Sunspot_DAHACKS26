import test from "node:test";
import assert from "node:assert/strict";
import { fromPacific, HOUR, pacificInput } from "../lib/solar";
import { availableDates, availableTimes, nearestAvailableTime, selectDateAndTime, timeBounds } from "../lib/time-selection";

test("separate date changes preserve the time and clamp to the forecast window", () => {
  const now = fromPacific("2026-10-16T15:00")!, end = now + 48 * HOUR;
  const dates = availableDates(now, end);
  assert.deepEqual(dates.map(d => d.value), ["2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.match(dates[0].label, /^Today/); assert.match(dates[1].label, /^Tomorrow/);
  const changed = selectDateAndTime("2026-10-17", "18:30", now, now, end, true);
  assert.equal(pacificInput(changed.time!), "2026-10-17T18:30");
  assert.equal(selectDateAndTime("2026-10-18", "18:30", now, now, end, true).time, end);
  assert.equal(selectDateAndTime("2026-10-16", "10:00", now, now, end, true).time, now);
  assert.ok(selectDateAndTime("2026-10-19", "12:00", now, now, end).error);
  assert.ok(selectDateAndTime("2026-10-16", "14:59", now, now, end).error);
  assert.deepEqual(timeBounds("2026-10-16", now, end), { min: "15:00", max: "23:59" });
  assert.deepEqual(timeBounds("2026-10-18", now, end), { min: "00:00", max: "15:00" });
});
test("separate controls reject DST gaps and select valid repeated-hour instants", () => {
  const spring = fromPacific("2026-03-07T12:00")!;
  assert.ok(selectDateAndTime("2026-03-08", "02:30", spring, spring, spring + 48 * HOUR).error);
  const first = fromPacific("2026-11-01T01:30")!, second = first + HOUR, end = second + 48 * HOUR;
  const later = selectDateAndTime("2026-11-01", "01:45", second, second, end);
  assert.equal(later.time, first + HOUR + 15 * 60_000);
  assert.equal(selectDateAndTime("2026-11-01", "01:30", second, second, end).time, second);
  assert.equal(timeBounds("2026-11-01", second, end).min, "00:00");
});
test("invalid clock input is distinct from a daylight saving gap and cannot throw", () => {
  const now = fromPacific("2026-10-16T15:00")!, end = now + 48 * HOUR;
  for (const clock of ["", "1:30", "12:0", "24:00", "23:60", "12:30:00", "NaN"]) {
    const result = selectDateAndTime("2026-10-17", clock, now, now, end);
    assert.equal(result.time, undefined);
    assert.match(result.error!, /valid time of day/);
  }
  assert.equal(selectDateAndTime("2026-10-17", "12:30", NaN, now, end).time, fromPacific("2026-10-17T12:30"));
  for (const [start, finish] of [[NaN, end], [now, Infinity], [end, now]]) {
    assert.deepEqual(availableDates(start, finish), []);
    assert.ok(selectDateAndTime("2026-10-17", "12:30", now, start, finish).error);
  }
});
test("date clamping cannot cross midnight or leave a short forecast window", () => {
  const midnight = fromPacific("2026-10-17T00:00")!, now = midnight - 30_000;
  const lastSeconds = selectDateAndTime("2026-10-16", "12:00", now, now, now + 48 * HOUR, true);
  assert.equal(lastSeconds.time, undefined);
  assert.ok(lastSeconds.error);
  const shortStart = fromPacific("2026-10-17T12:00")! + 30_000;
  assert.ok(selectDateAndTime("2026-10-17", "12:00", shortStart, shortStart, shortStart + 10_000, true).error);
  const end = fromPacific("2026-10-17T12:03")! + 30_000;
  const clamped = selectDateAndTime("2026-10-17", "13:00", shortStart, shortStart, end, true);
  assert.equal(pacificInput(clamped.time!), "2026-10-17T12:03");
  assert.ok(clamped.time! >= shortStart && clamped.time! <= end);
});
test("a stale repeated-hour selection can resolve to the occurrence inside the forecast window", () => {
  const first = fromPacific("2026-11-01T01:30")!, second = first + HOUR;
  const now = fromPacific("2026-11-01T00:30")!, end = first + 20 * 60_000;
  assert.equal(selectDateAndTime("2026-11-01", "01:30", second, now, end).time, first);
  assert.equal(selectDateAndTime("2026-11-01", "01:30", first, second - 10 * 60_000, second + HOUR).time, second);
  assert.ok(selectDateAndTime("2026-11-01", "01:30", second, second + 1, second + HOUR).error);
});
test("the 48-hour date list crosses calendar and spring daylight saving boundaries", () => {
  const spring = fromPacific("2026-03-07T23:30")!;
  assert.deepEqual(availableDates(spring, spring + 48 * HOUR).map(d => d.value), ["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  assert.equal(selectDateAndTime("2026-03-10", "00:30", spring, spring, spring + 48 * HOUR).time, spring + 48 * HOUR);
  assert.ok(selectDateAndTime("2026-03-10", "00:31", spring, spring, spring + 48 * HOUR).error);
  const yearEnd = fromPacific("2026-12-31T23:30")!;
  assert.deepEqual(availableDates(yearEnd, yearEnd + 48 * HOUR).map(d => d.value), ["2026-12-31", "2027-01-01", "2027-01-02"]);
});
test("picker choices contain only whole minutes inside the shorter forecast or hard 48-hour limit", () => {
  const now = fromPacific("2026-10-16T15:45")! + 30_000;
  const full = availableTimes(now, now + 72 * HOUR);
  assert.equal(full[0].time, fromPacific("2026-10-16T15:46"));
  assert.equal(full.at(-1)!.time, fromPacific("2026-10-18T15:45"));
  assert.ok(full.every(option => option.time >= now && option.time <= now + 48 * HOUR));
  assert.ok(selectDateAndTime("2026-10-18", "15:46", now, now, now + 72 * HOUR).error);
  const end = fromPacific("2026-10-16T16:03")! + 30_000, short = availableTimes(now, end);
  assert.equal(short.length, 18);
  assert.deepEqual([...new Set(short.map(option => option.period))], ["PM"]);
  assert.deepEqual(short.filter(option => option.hour === "4").map(option => option.minute), ["00", "01", "02", "03"]);
  assert.ok(short.every(option => option.time <= end));
});
test("a date without a selectable whole minute disappears and live Now rounds forward", () => {
  const now = fromPacific("2026-10-16T23:59")! + 30_000, end = now + 48 * HOUR;
  const dates = availableDates(now, end), options = availableTimes(now, end);
  assert.equal(dates[0].value, "2026-10-17");
  assert.match(dates[0].label, /^Tomorrow/);
  const nearest = nearestAvailableTime(options, { date: "2026-10-16", hour: "11", minute: "59", period: "PM" }, now)!;
  assert.equal(pacificInput(nearest.time), "2026-10-17T00:00");
  assert.deepEqual(availableTimes(now, now + 10_000), []);
  assert.deepEqual(availableDates(now, now + 10_000), []);
});
test("dependent time choices reconcile to a valid date, hour, period and minute", () => {
  const now = fromPacific("2026-10-16T15:45")! + 30_000, end = fromPacific("2026-10-17T08:12")!;
  const options = availableTimes(now, end);
  const today = nearestAvailableTime(options, { date: "2026-10-16", hour: "3", minute: "10", period: "PM" }, now)!;
  assert.equal(pacificInput(today.time), "2026-10-16T15:46");
  const tomorrow = nearestAvailableTime(options, { ...today, date: "2026-10-17" }, today.time)!;
  assert.equal(pacificInput(tomorrow.time), "2026-10-17T08:12");
  const hour = nearestAvailableTime(options, { ...tomorrow, hour: "7" }, tomorrow.time)!;
  assert.equal(pacificInput(hour.time), "2026-10-17T07:12");
  for (const choice of [today, tomorrow, hour]) {
    assert.ok(options.some(option => option.time === choice.time));
    assert.equal(selectDateAndTime(choice.date, pacificInput(choice.time).slice(11), choice.time, now, end).time, choice.time);
  }
});
test("valid picker slots omit spring gaps and retain both available fall-back occurrences", () => {
  const spring = fromPacific("2026-03-08T00:00")!, springOptions = availableTimes(spring, spring + 5 * HOUR);
  assert.ok(!springOptions.some(option => option.hour === "2" && option.period === "AM"));
  const folded = fromPacific("2026-11-01T01:30")!, foldOptions = availableTimes(folded, folded + 2 * HOUR);
  const repeated = foldOptions.filter(option => option.hour === "1" && option.minute === "45");
  assert.deepEqual(repeated.map(option => option.time), [folded + 15 * 60_000, folded + HOUR + 15 * 60_000]);
  const later = nearestAvailableTime(foldOptions, repeated[0], repeated[1].time)!;
  assert.equal(later.time, repeated[1].time);
  assert.equal(selectDateAndTime(later.date, "01:45", later.time, folded, folded + 2 * HOUR).time, later.time);
});
