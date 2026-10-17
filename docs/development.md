# Development and data reference

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` contains persistent community comments and independent ratings
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Sunspot phone app

Sunspot is a progressive web app (PWA). First launch loads the map behind one optional sheet containing location access and three skippable preference questions: scenery, nearby radius, and sorting priority. **Explore now** is always available, including while locating. Preferences stay in local storage; coordinates stay in session memory. Returning users go directly to Discover. Use Preferences in the bottom navigation to change your choices. Small dismissible tips explain map previews and sun symbols at those controls; the full tutorial opens from Help.

Distance limits use straight-line miles (10, 25, or 50). They apply only with an active location. Scenery preferences rank matches rather than excluding other views. The current collection covers the Bay Area and the wider northern regional extract, including parts of Central and Eastern California; an empty nearby search offers expanded discovery.

Each recommendation shows one reason derived from its actual scenery match, proximity, active scenery filter, or featured status. These reasons do not imply walking effort or weather influenced Discover ranking. Hikes separately matches sourced routes to a walking budget. Viewpoint overviews lead with the photo, name and map links, then the description and a practical snapshot of route effort, published hours and a sourced access note. Missing details stay explicitly unconfirmed. A concise light summary follows; date/time controls, technical forecasts and the full visit guide expand on request.

Scenery chips are strict filters. **Ocean** means a coastal ocean view, **Bay & harbor** covers tidal bays/harbors/straits, and **Lakes & rivers** covers inland water and waterfalls. A possible distant Pacific sightline does not make an inland summit an Ocean recommendation. City skylines, actual bridges, hills and vegetation are reviewed separately. Names such as Skyline Ridge, Natural Bridges, Emerald Bay and Fossil Falls are not keyword classification rules. All 516 published viewpoints have recorded scenery reviews; six unsupported category matches remain in All views only. See [scenery and visitor research](scenery-and-visitor-research.md).

Use **Install app** in Discover, or the browser's install menu. On iPhone, open in Safari and choose **Share → Add to Home Screen**. Installation and location require HTTPS on a deployed host; localhost works for desktop development. A phone cannot reach a computer's `127.0.0.1` address. The app has a standalone manifest, home-screen icons, safe-area spacing, and an offline reconnect screen. Live viewpoints, images, and maps require a connection.

Location recovery: device lookup first accepts a recent coarse fix, then retries unavailable/timed-out requests with fresh high-accuracy positioning (20-second timeout). Permission denial is not retried automatically. A watchdog releases the UI if a browser never calls back. Errors distinguish blocked permission, unavailable positioning, timeout, unsupported browser, and insecure connection. **Choose a city instead** works without device permission or an external geocoding service; results clearly use approximate city-center distances. Manually choosing a city takes precedence over pending device callbacks.

## Viewpoint research and data pipeline

Navigation and viewpoint changes use short fade/slide transitions, with a roughly half-second camera pan that preserves the current zoom. The map stays mounted while changing tabs or editing preferences. Reduced-motion preferences disable these animations. Previous/Next spot controls in the overview switch between the current search results.

The basemap uses [OpenFreeMap](https://openfreemap.org/quick_start/) vector tiles through MapLibre GL, retaining Leaflet's markers and controls. Labels and roads render at the device's native pixel density. Cream, sage and muted water colors match Sunspot. Before dev/build, `scripts/copy-map-worker.mjs` copies the installed MapLibre worker, sourcemap and BSD license to `public/vendor/`. The worker loads unchanged with a version query; passing it through Vite's module-worker transform injects a browser HMR client and causes runtime errors. Attribution remains visible. A failed vector load or unavailable WebGL falls back to OpenStreetMap raster tiles without resetting pins or the camera. Hovering a map dot opens a compact photo preview and its sun direction. Clicking pins the preview, centers the dot in the usable map area, and zooms in slightly; Take a look opens the full overview. Click the selected dot again, empty map space, the card’s close button, or Escape to dismiss it and restore the map center and zoom from before selection. Switching between pins retains that original return view.

Vite's optional terminal console relay is disabled because its error forwarding can recursively reject while the HMR socket reconnects. Browser console diagnostics and the browser error overlay remain available.

The catalog now separates agency-reviewed visitor profiles from community-mapped locations. Neither a mapped pin nor a reviewed page guarantees current public access. Hours are source text with research dates, never a live “open now” claim. Unknown facts stay null; conflicting source statements are labeled rather than silently resolved.

Data files:

- `data/curated-viewpoints.json`: manually reviewed destinations, route definitions, visitor facts and fact-level citations.
- `data/mapped-viewpoints.json`: filtered public OpenStreetMap snapshot, original IDs/tags, extract date and scope. Private/no-access records are excluded where those tags are present. Untagged access stays unconfirmed.
- `data/research/sources.json`: official-page titles, publishers, retrieval times and content fingerprints. Raw copyrighted pages and large downloads stay in ignored `work/viewpoint-research/`.
- `data/research/coverage.json`: county-by-county counts, field completeness, duplicate merges and collection phases. Coverage remains explicitly incomplete.
- `data/research/queue.json`: remaining fields to research, sorted with the nine Bay Area counties first, then the rest of Northern California. Southern California is the next queued phase.
- `data/catalog.json`: generated app catalog. The list API omits detailed profiles; the detail endpoint supplies the full visitor information.
- `data/viewpoint-names.json`: researched display names for previously unnamed published points, with original names, source links, nearby-feature evidence and the mapping snapshot date. Most are descriptive trail/park/landscape labels; they are not claimed as official viewpoint names. The overview makes that distinction and links to the naming sources. Names are applied after deduplication and never move coordinates or alter access facts. A later actual OSM name takes precedence over an older descriptive label.
- `data/viewpoint-scenery.json`: per-place scenery decisions, definitions, source links, review dates and fingerprints of the reviewed place/photo context. Missing or changed reviews block `data:build`; raw name keywords never assign scenery. Unclassified places receive no category tags.
- `data/research/enrichment-2026-10-17.json`: review log for six added coastal destinations and 18 existing profiles, including preserved conflicts and remaining unknowns. The catalog now has 75 agency-source profiles and 516 photo-backed viewpoints.

Run `npm run data:build` after editing reviewed data or replacing the mapped snapshot. This rebuilds deterministically without updating evidence dates. `npm run data:check-sources` reports fetch failures and changed page hashes into ignored `work/viewpoint-research/source-health.json`. Fetching a page is not equivalent to re-reviewing all its facts; dates are only updated after reading and reconciling evidence. The original seed importer refuses to overwrite the researched schema.

To collect or refresh the regional discovery snapshot, use the standard-library collector (Python 3 and `curl`). It retrieves only the POI index from Geofabrik’s archive with HTTP ranges, verifies ZIP integrity, and hydrates discovered viewpoint nodes from the public OSM API in 150-node batches, with two workers and a pause between requests. Only selected location tags are retained; contributor identities are discarded. Use a separate cache directory for each region and collection date:

```sh
python3 scripts/collect-regional-viewpoints.py \
  --region norcal \
  --cache work/viewpoint-research/norcal-new-date \
  --output data/mapped-viewpoints.json
npm run data:build
npm test
npm run typecheck
```

`--offline` rebuilds from an existing matching cache without network access. `--supplement` can retain previously collected mapped ways (the current snapshot supplements the regional node index with mapped features from a San Francisco PBF extract). The region flag also supports `socal` for the next phase; that phase has not been collected yet. `scripts/extract-osm-viewpoints.py` remains available for local PBF files and requires a temporary Python environment with `osmium`.

The boundary input is the [county GeoJSON distributed by Plotly](https://github.com/plotly/datasets/blob/master/geojson-counties-fips.json), derived from U.S. Census geography. Collection uses polygon containment rather than nearest-city guessing, retaining California points only. Simplified boundaries can omit borderline/coastal points. The regional scope follows [Geofabrik’s northern extract](https://download.geofabrik.de/north-america/us/california/norcal.html), including parts of Central and Eastern California. The discovery index contains mapped viewpoint points, not every overlook, summit or scenic trail; relations and newly mapped points after the index snapshot can be absent. Metadata can be stale or wrong. Primary-source research is still required before treating access, rules or an approach as confirmed.

A route stores its named start and whether mileage is one-way, round-trip, a loop, a network total, or an unresolved basis. Preserve-wide trail mileage is not substituted for a viewpoint hike. Summit elevation and cumulative climbing gain are different fields. Walking-step estimates use **1,900–2,600 steps per mile**, rounded to hundreds; this is a planning assumption, not a measurement or fitness guarantee. No steps are estimated for an undefined route or ambiguous distance basis. Actual reported staircase counts have their own field. Accessible parking, an accessible short segment and accessibility of a whole hike are recorded separately.

OpenStreetMap-derived records are attributed to **© OpenStreetMap contributors** and provided under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); retain attribution and the original record links. Photos retain their individual Commons credits/licenses. Agency prose is summarized into factual planning notes with links; the source articles and maps are not redistributed in the repository. Review changing fees, hours, permits, closures, fire restrictions and transport schedules before each trip.

Some original approximate pins were reconciled with named mapped destinations during research; `data/research/coordinate-corrections.json` records the old and new coordinates and source. For guidebook itineraries the app links to published trailhead coordinates separately from the viewpoint location.

### Required viewpoint previews

The app catalog publishes **only viewpoints with a reviewed photo**. Source discovery inventories retain unpublished candidates for research, but they are excluded from the map, recommendations, search and detail API until a qualified preview is approved. `data:build` applies this rule on every rebuild, so a later regional import cannot silently reintroduce photo-less spots.

- `data/viewpoint-photos.json` is the publication manifest: image credit, individual license/source links, source dimensions, actual delivered dimensions, review date, subject-match notes, file size and SHA-256.
- `public/viewpoints/photos/` contains the actual JPEG, PNG or WebP previews, served with the app instead of depending on remote photo servers.
- Every preview must decode successfully and have at least **1,600 pixels on the long edge and 900 on the short edge**, with the source meeting the same minimum. Wide panoramas may instead use at least **1,920 × 400 pixels** and are displayed in full in the overview; portraits also preserve their full frame. Small images are excluded; images are never enlarged to meet the threshold. Delivered previews are capped at 16 million pixels and 12 MB to avoid excessive phone memory use and downloads.
- Photos are selected for the named viewpoint or the view at its mapped location. Coordinates and descriptive source metadata guide discovery; a subject review is required before publication. Nearby wildlife, signs, diagrams and unrelated landscape photos do not qualify.
- `data/research/photo-exclusions.json` records candidates excluded from publication. Exclusion means no suitable preview was verified in this research pass; it does not claim that no photo exists anywhere.

The repeatable discovery command is `python3 scripts/research-viewpoint-photos.py --mode all`, with resumable API responses and per-viewpoint search logs under ignored `work/photo-research/`. `--mode bulk-geo` groups coordinate queries while preserving each viewpoint's 150-metre search radius; it narrows fully covered batches when the service's result limit is reached. Run `scripts/finalize-photo-research.py` after discovery to reconcile coordinate metadata and write `data/research/photo-audit.json`, including incomplete searches. Prepare contact sheets with `scripts/prepare-photo-review.py --pending-only` and explicitly record approved selections with `scripts/publish-viewpoint-photos.py --approve <indices> --publish`; those two tools use Pillow for image decoding and contact-sheet review. Review indices refer to the current contact sheets. The publisher copies source pixels without upscaling or altering the photo. Run `npm run data:build`, `npm test`, and `npm run typecheck` after publishing the manifest. `npm run data:check-photos -- --origin=http://127.0.0.1:5173` also verifies every delivered asset's HTTP response, hash and actual dimensions. Tests verify the no-photo exclusion rule in both API routes.

Google Maps preview photos are an allowed future source, but no Google Places API key is configured in this checkout. The supported [Place Photos service](https://developers.google.com/maps/documentation/places/web-service/place-photos) requires that key, fresh photo-resource retrieval, and author attribution; its photo names expire and cannot be cached. Google-hosted previews therefore need a separate live integration, rather than being copied into this Commons/local-asset manifest.

A short skippable tutorial explains navigation and sun symbols. The photo-first viewpoint overview softens its hero image as you scroll, and the planner offers themed date, hour, minute and AM/PM dropdowns with Apply time. Smooth panel and viewpoint transitions can be selected under Preferences → Transitions; Use device follows the device’s reduced-motion preference.

Sun, sunset, terrain and regional cloud forecasts are documented in [docs/sun-and-forecast.md](sun-and-forecast.md), including real coverage, free-provider limits, cache scope, uncertainty, attribution and reproducible USGS preparation.


### Hikes and community notes

The Hikes tab accepts a maximum walking budget in miles or estimated steps, applies current scenery/distance filters, and sorts by straight-line distance from the chosen area or device location. Only sourced loop and round-trip routes qualify; unknown lengths, networks, and one-way routes are excluded rather than inventing a full outing. There are currently 26 qualifying viewpoint-route records; several Manzanita Lake viewpoints share the same sourced loop. Step estimates use 1,900–2,600 steps per mile, with the upper estimate used for matching. A trailhead distance is used when sourced start coordinates exist; otherwise the card labels distance to the viewpoint. Terrain, access and route sources remain in each overview.

Date, hour, minute and AM/PM menus contain only available minute combinations through the next 48 hours (or the shorter returned forecast window). Past dates/times and daylight-saving gaps are absent. Changing a date, period or hour reconciles the other fields to an available combination.

The map now uses cloud shading only. Solar direction symbols and the sunset/terrain summaries remain. Discover is shorter and its X switches directly to Map.

Community notes and independent 1–5-star ratings persist in Cloudflare D1, declared as `DB` in `.openai/hosting.json`. Apply `drizzle/0000_community_reviews.sql` once to a fresh local database using the local D1 command above; the current demo database has already been initialized. Deployments must apply the same migration to their production binding. No production database was modified here.

Visitors are anonymous: an HttpOnly, SameSite cookie associates their rating and comment ownership with this browser. Rating again updates that vote; visitors can remove their rating or delete their own notes. Clearing cookies loses that ownership. Comments are public plain text (1–1,000 characters), labeled Visitor without asking for a name; HTML is rendered as text. The API validates viewpoint IDs, rejects cross-origin writes and oversized bodies, and limits comments to three per browser per minute. These are visitor reports, not verified conditions or access guarantees. No seeded ratings/comments are used.


Map startup now resynchronizes the vector canvas after interrupted opening flights, layout changes, and asynchronous style loading. Hovering a map pin previews its photo and sun direction without moving the camera; leaving restores any pinned preview. Clicking the pin retains the small card through the animated camera movement. The sun label is a compact dark direction pill with altitude and terrain/night state, replacing the white rectangle. Bearings remain relative to true north; the symbol represents direction rather than the sun’s geographic location. Keyboard focus on recommendation cards also previews the sun.

Successful device coordinates are reused in session memory. Location options show an enabled status instead of asking again, and Hikes location options do not start another request. If permission is already granted but the provider has no position, controls offer a retry instead of asking to enable location. Clearing location explicitly clears the session fix.
