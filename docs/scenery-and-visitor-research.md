# Scenery and visitor research — October 17, 2026

The published catalog grew from 510 to **516 viewpoints**, including **75 profiles researched from agency sources**. Every published spot retains a reviewed local preview photo and a recorded scenery decision. This is source research, not field verification, a current-access guarantee or a promise of visibility in fog.

## Scenery correction

Reviewed all 510 existing published places against their place descriptions, approved photo subjects, source context and, where needed, actual preview images. Revised labels on 461 records, including previously unclassified mapped spots. All six new places were separately checked against agency pages and decoded photos. The checked-in record is [viewpoint-scenery.json](../data/viewpoint-scenery.json).

| Filter | Meaning | Published matches |
| --- | --- | ---: |
| Ocean | Coastal beach, bluff or headland with a substantial Pacific view | 90 |
| Bay & harbor | Substantial tidal bay, estuary, harbor or strait view | 83 |
| Lakes & rivers | Lakes, reservoirs, rivers, creeks and waterfalls | 109 |
| Skyline | Visible city buildings or urban panorama | 82 |
| Bridges | An actual bridge is a substantial visible subject | 62 |
| Hills | Hill, mountain, ridge or canyon landscape | 271 |
| Greenery | Woodland, vegetation, meadow, garden or wetland habitat | 162 |

Counts overlap because a viewpoint can show several subjects. Six views do not have a supported match in these categories: two zoo viewpoints, Mesquite Flat Sand Dunes, Devil’s Golf Course, Devils Homestead Overlook and the SFO Outdoor Terrace. They stay available in All views without invented tags.

Borel Hill, Windy Hill, Mount Umunhum, Mount Tamalpais, Twin Peaks and Grandview Park no longer match Ocean merely because a distant ocean view is possible. Golden Gate/Bay viewpoints use Bay & harbor. Emerald Bay at Lake Tahoe uses Lakes & rivers; Natural Bridges does not acquire a bridge tag from a rock arch; Skyline Ridge does not acquire an urban skyline tag from its name. Dry Fossil Falls and geothermal pools do not match the freshwater filter.

Category filtering occurs before preference ranking and local recommendations. Empty matches stay empty. Active category explanations take precedence over other saved scenery preferences, so an Ocean card explains its ocean match. Map preview IDs are cleared on a category change.

`scripts/scenery-policy.mjs` validates each review, per-tag evidence, date and fingerprint of the place name, coordinates, description, location source and preview source URLs/content hashes. A new place or changed reviewed context blocks the catalog build until its scenery is reviewed. No raw OSM name inference is retained. Historical OSM tags remain in the discovery snapshot for provenance.

## Visitor data added

Six new destinations have agency-source profiles, reviewed high-resolution photos and explicit coordinate provenance:

| Destination | Main source | Important detail |
| --- | --- | --- |
| Fitzgerald Marine Reserve — Coastal Bluff | [San Mateo County](https://www.smcgov.org/parks/fitzgerald-marine-reserve) and [county guide](https://www.smcgov.org/media/157493/download?inline=) | Tide-dependent access, slippery rocks, protected wildlife; dog access is limited to Dardenelle Trail |
| Pillar Point Bluff — Pacific View | [San Mateo County](https://www.smcgov.org/parks/pillar-point-bluff) | Small Airport Street lot, ADA restroom, dirt trails and unstable bluff edges |
| Montara State Beach — Pacific Shore | [California State Parks](https://www.parks.ca.gov/?page_id=532) | 8 am–sunset, leashed dogs, no drinking water, no beach fires or drones |
| Gray Whale Cove — Bluff and Beach | [California State Parks](https://www.parks.ca.gov/?page_id=528) | Parking east of Highway 1; hazardous crossing, steep stairs and no dogs on the beach |
| Francis Beach — Half Moon Bay | [California State Parks](https://www.parks.ca.gov/?page_id=531) | Day-use fee, beach wheelchair, facilities; dogs allowed on the Coastside Trail but not the beach |
| Pacifica State Beach — Linda Mar | [California State Parks](https://www.parks.ca.gov/?page_id=524), [City of Pacifica](https://www.cityofpacifica.org/departments/parks-beaches-recreation/parks-and-beaches-locations-maps-safety-guides/pacifica-state-beach) | Conflicting published hours remain visibly conflicting rather than asserting one closing time |

Pins use agency map destinations where supplied, or explicitly cited geotagged place/photo references for the two county coastal locations. These are approximate place references, not surveyed trailheads. Public approach details and limitations remain in the full guide.

Updated **18 existing profiles**, filling **76 previously unknown visitor facts**, revising 22 existing fact values and reviewing 106 field/route entries in total. Changes include the following:

- [NPS operating hours](https://www.nps.gov/goga/planyourvisit/hours.htm) for Muir Beach Overlook, Lands End and Kirby Cove. Beach-specific dog/fire rules are not copied to Muir Beach Overlook.
- [Mori Point](https://www.nps.gov/goga/planyourvisit/moripoint.htm) parking, accessible features, facilities and bluff cautions.
- [Fort Funston](https://www.nps.gov/goga/planyourvisit/fortfunston.htm) paved-loop accessibility distinguished from steep beach access; the generic Observation Deck has a recognizable place name.
- [Russian Ridge](https://www.openspace.org/preserves/russian-ridge), [Fremont Older](https://www.openspace.org/preserves/fremont-older) and [Windy Hill](https://www.openspace.org/preserves/windy-hill) access, terrain, seasonal/parking details and route distinctions. The approximate one-mile Anniversary return loop stays estimated and is excluded from reported-distance hike matching.
- [Point Reyes Lighthouse](https://www.nps.gov/pore/planyourvisit/lighthouse.htm) upper-deck hours, the sourced 0.45-mile one-way approach, accessible parking/path and 313-step lighthouse descent. Stair closures are distinct from the upper viewing deck.
- [Chimney Rock](https://www.nps.gov/pore/planyourvisit/chimney_rock.htm) parking, facilities, lack of water, cliff restrictions, dog rules and drone restrictions.
- [Manzanita Lake](https://www.nps.gov/thingstodo/walkmanzanitalake.htm) 1.7-mile loop, estimated steps, narrow/rooted surfaces, accessible picnic viewing alternative and snow/pet restrictions for its existing viewpoints.
- [Bumpass Hell](https://www.nps.gov/thingstodo/hikebumpasshell.htm) limited parking, trailhead toilets, narrow/steep sections, snow closure and boardwalk rules. The source’s conflicting 200/300-foot descent figures are retained as a conflict and never presented as cumulative climbing gain.

No full-route mileage was invented for the new beach viewpoints. Half Moon Bay’s published three-mile corridor is a network/segment description, excluded from complete-hike matching. Steps remain estimates at 1,900–2,600 per mile; unknown climbing gain remains unknown. Source dates and individual fact citations are retained. The full change log is [enrichment-2026-10-17.json](../data/research/enrichment-2026-10-17.json).

## Verification

All 121 tests, type checking and the production build passed. The photo integrity check covered 516 published places and 474 unique local images. Safari accessibility checks confirmed the Ocean filter, no unrelated fallback for an Ocean + Borel Hill search, and the new Gray Whale Cove overview. All six new coastal places have complete terrain horizon profiles, using fresh USGS observer samples and the existing regional terrain grid. These checks do not replace field verification or establish current access and weather conditions.
