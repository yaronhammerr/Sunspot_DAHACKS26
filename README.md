# Sunspot

Sunspot helps you find a new viewpoint and plan the visit without piecing together lots of searches. Explore nearby scenery, preview the view, choose a walk within your effort budget, and check the light and available visitor information before going.

Built for De Anza Hacks 2026 around **Modern Life** and **Nature Life**: make an outdoor break easier to plan and help people explore unfamiliar places with more context.

## What it does

- **Discover viewpoints:** a map with photo previews, search, scenery filters, optional location and saved preferences.
- **Plan for the light:** sun direction, sunset and golden hour, regional cloud forecasts, and estimates of when terrain may hide the sun.
- **Find a walk:** set a maximum distance in miles or estimated steps to find matching sourced loops and round trips.
- **Prepare for a visit:** read available parking, hours, terrain, facilities and local rules, with source links and unknown details clearly marked.
- **Get directions and share experience:** open Google Maps or Apple Maps, leave an anonymous comment, or rate a viewpoint separately.

Sunspot is an installable Progressive Web App (PWA), usable in a desktop or phone browser.

## Run it locally

You need **Node.js 22.13 or newer** and **pnpm** (the version is recorded in `package.json`). See [pnpm installation](https://pnpm.io/installation) if needed.

```sh
git clone https://github.com/yaronhammerr/Sunspot_DAHACKS26.git
cd Sunspot_DAHACKS26
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:5173**. Use the address printed in the terminal if that port is already occupied. Keep the terminal running while using the local app. No cloud account or API key is needed for local discovery and planning; maps and weather need an internet connection.

### Enable comments and ratings on a fresh checkout

Community contributions use a local Cloudflare D1 database. Build once to generate its configuration, then apply the schema **once to a new local database**:

```sh
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_community_reviews.sql
```

Then run `pnpm dev`. Database contents stay in ignored `.wrangler/state`; they are not included in Git. An existing initialized demo database does not need this schema applied again.

## How to use it

1. Choose a city or optionally allow device location. The initial preferences and tutorial can be skipped.
2. Use **Discover** and the scenery filters to find a view. Hover over a map dot for a preview; click to pin it and move closer. Open **Take a look** for the full overview.
3. Use the date and time controls to plan within the next **48 hours**. The sun icon and orange arrow show the direction to face; the purple dashed line shows sunset direction.
4. Open **Hikes** to choose a miles or steps budget. Read the viewpoint's practical details and agency updates before travelling, then use a maps button for directions.
5. Use **Preferences** to change your choices or transitions. On a supported phone, use the browser's install or **Add to Home Screen** option.

Click a selected map dot again, its preview's **X**, or press **Escape** to dismiss the preview and return to the previous map view.

## Hosting and production

You only need to host Sunspot publicly if you want others to access it without running it on their own computer. Pushing this repository to GitHub does not deploy a live app.

The current server build targets **Cloudflare Workers**, with a **D1 binding named `DB`** for comments and ratings. For your own deployment:

1. Configure a Worker and a real D1 database. The database ID in `vite.config.ts` is a local placeholder; it must be configured for your own deployment.
2. Run `pnpm build`. The generated Worker configuration is `dist/server/wrangler.json`, with client assets in `dist/client`.
3. Apply `drizzle/0000_community_reviews.sql` once to the new production database using your deployment's configuration, then deploy the Worker and its assets. See the [Cloudflare D1 setup guide](https://developers.cloudflare.com/d1/get-started/) and [Wrangler deployment configuration](https://developers.cloudflare.com/workers/wrangler/configuration/). Existing Sites deployments can use the Sites workflow described in the development reference.
4. Serve over **HTTPS** for device location and installation. Localhost is supported for local development.

`pnpm start` previews the built Worker locally; it does not publish it. This is a server application, so a static GitHub Pages upload alone will not run its APIs. Commercial use also needs an appropriate weather-service arrangement; the current [Open-Meteo free endpoint](https://open-meteo.com/en/pricing) is for non-commercial use.

## Current scope and limits

The catalog contains **516 viewpoints** across the Bay Area and Northern California, all with reviewed preview photos. **75 profiles** include agency-source visitor research; remaining records are community-mapped, and even researched profiles can contain unknown facts. Southern California expansion is planned.

Weather is regional and hourly. Cloud shapes are illustrative. Terrain screening is incomplete and excludes trees and buildings. These estimates do not guarantee a visible sunset or confirm that a site is open. Photos are previews, not live conditions. Distances away are straight-line estimates; walking steps are estimates. Full offline maps and guides are not implemented.

## Development and sources

```sh
pnpm test
pnpm typecheck
pnpm build
```

Built with React, TypeScript, Vinext/Vite, Leaflet, MapLibre, SunCalc and Cloudflare D1. The catalog, photos and prepared terrain profiles are checked in, so you do not need to rerun the data collection to try the app.

- [Development and data workflows](docs/development.md)
- [Sun, forecast and terrain methodology](docs/sun-and-forecast.md)
- [Scenery and visitor research](docs/scenery-and-visitor-research.md)

Keep map and data attribution when reusing the project: OpenStreetMap contributors (ODbL), OpenFreeMap/OpenMapTiles, individual photo authors and licenses, USGS, and Open-Meteo/NOAA. Photo credits and agency sources are available in each viewpoint's overview and the data manifests.
