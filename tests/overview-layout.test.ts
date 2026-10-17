import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Onboarding from "../app/components/onboarding";
import ViewpointDetail from "../app/components/viewpoint-detail";
import SunsetSummary from "../app/components/sunset-summary";
import VisitSnapshot from "../app/components/visit-snapshot";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import type { Viewpoint } from "../lib/types";
import { fromPacific } from "../lib/solar";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { viewpoints: Viewpoint[] };
const place = catalog.viewpoints.find(v => v.name === "Twin Peaks")!;
const now = fromPacific("2026-10-16T15:00")!;
test("setup presents all three optional questions together and exploration stays enabled while locating", () => {
  const html = renderToStaticMarkup(createElement(Onboarding, { initial: DEFAULT_PREFERENCES, editing: false, locationStatus: "", locating: true, hasLocation: false, locationFailed: false, onChooseLocation() {}, onLocate: async () => false, onComplete() {}, onCancel() {} }));
  assert.equal((html.match(/<fieldset/g) ?? []).length, 3);
  assert.match(html, /How far from your area/);
  assert.match(html, /Nearby radius in a straight line/);
  assert.match(html, /Set a walking budget in Hikes/);
  assert.match(html, /<button class="setup-explore">Explore now/);
  assert.match(html, /Skip all preferences/);
  assert.ok(!html.includes("Continue without location") && !html.includes("Question 1 of 3"));
});
test("setup with an existing location does not ask to enable it again", () => {
  const html = renderToStaticMarkup(createElement(Onboarding, { initial: DEFAULT_PREFERENCES, editing: true, locationStatus: "Device location enabled", locating: false, hasLocation: true, locationFailed: false, onChooseLocation() {}, onLocate: async () => true, onComplete() {}, onCancel() {} }));
  assert.ok(!html.includes("Use my location"));
  assert.match(html, /Save preferences/);
});
test("the overview places description and practical facts before sunlight and the expandable full guide", () => {
  const html = renderToStaticMarkup(createElement(ViewpointDetail, { viewpoint: place, onClose() {}, timeRevision: 0, selectedTime: now, now, forecast: null, terrain: null, onTimeSelect() {}, onNow() {} }));
  const description = html.indexOf(place.description), glance = html.indexOf("At a glance"), light = html.indexOf("Plan for the light"), guide = html.indexOf("Routes, access &amp; sources");
  assert.ok(description > 0 && description < glance && glance < light && light < guide);
  assert.ok(html.indexOf("Open in Google Maps") < description && html.indexOf("Open in Apple Maps") < description);
  assert.match(html, /<details class="visit-full-details">/);
  assert.match(html, /<details class="light-time-settings">/);
  assert.match(html, /<details class="light-details">/);
  assert.match(html, /Visitor notes &amp; ratings/);
});
test("the default light summary keeps uncertainty visible and technical readings inside a disclosure", () => {
  const html = renderToStaticMarkup(createElement(SunsetSummary, { place, selected: now, now, forecast: null, terrain: null }));
  const visible = html.slice(0, html.indexOf('<details class="light-details">'));
  assert.match(visible, /Face southwest/);
  assert.match(visible, /Weather unavailable/);
  assert.match(visible, /Terrain estimate unavailable or incomplete/);
  assert.match(visible, /not guaranteed/);
  assert.ok(!visible.includes("Instant direct radiation") && !visible.includes("USGS 3DEP"));
  const night = renderToStaticMarkup(createElement(SunsetSummary, { place, selected: fromPacific("2026-10-16T23:00")!, now, forecast: null, terrain: null }));
  assert.match(night.slice(0, night.indexOf('<details class="light-details">')), /Below the horizon/);
});
test("the practical summary marks unknown hours and route effort and retains conflicting access information", () => {
  const profile = structuredClone(place.visit!);
  profile.hours = { ...profile.hours, value: null, status: "unknown" };
  profile.routes = [];
  profile.cautions = { ...profile.cautions, value: "Gate access differs by entrance", status: "conflicting" };
  profile.seasonalAccess.value = null;
  const html = renderToStaticMarkup(createElement(VisitSnapshot, { profile }));
  assert.match(html, /Hours not confirmed/);
  assert.match(html, /Walking effort not confirmed/);
  assert.match(html, /Gate access differs by entrance/);
  assert.match(html, /Sources disagree/);
  assert.ok(!html.includes("Open now"));
});
