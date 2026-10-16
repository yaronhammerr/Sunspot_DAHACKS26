/** Repeatable public-data import. Run with Node 22+: node scripts/import-viewpoints.mjs.
 * --curated-only skips Overpass; --refresh-photos re-fetches Commons attribution.
 * All photo assets remain remote: this script downloads metadata, never media.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const destination = fileURLToPath(new URL('../data/catalog.json', import.meta.url));
const counties = ['San Francisco', 'San Mateo', 'Santa Clara', 'Alameda', 'Contra Costa', 'Marin', 'Sonoma', 'Napa', 'Solano'];
const seeds = [
  ['battery-spencer', 'Battery Spencer', 37.8277, -122.4815, 'Marin', 'Look across the Golden Gate Bridge toward San Francisco from this historic headlands overlook.', ['bridges','ocean','skyline'], 'https://www.nps.gov/places/000/battery-spencer-overlook.htm', 'Battery Spencer Golden Gate Bridge'],
  ['twin-peaks', 'Twin Peaks', 37.7544, -122.4477, 'San Francisco', 'The summit trails offer a sweeping, 360-degree perspective above San Francisco. Expect wind and fog.', ['skyline','hills','ocean'], 'https://www.sfrecpark.org/facilities/facility/details/Twin-Peaks-384', 'Twin Peaks San Francisco panorama', [[0,360]]],
  ['muir-beach-overlook', 'Muir Beach Overlook', 37.8636, -122.5868, 'Marin', 'A dramatic coastal staircase leads to an ocean overlook above rocky cliffs. Bring a windbreaker.', ['ocean','hills'], 'https://www.nps.gov/places/000/muir-beach-overlook.htm', 'Muir Beach Overlook'],
  ['mount-tamalpais', 'Mount Tamalpais — East Peak', 37.9235, -122.5779, 'Marin', 'Enjoy Bay Area and Pacific vistas from the upper mountain and the Verna Dunshee Trail.', ['ocean','hills','greenery','skyline'], 'https://www.parks.ca.gov/?page_id=471', 'Mount Tamalpais East Peak view'],
  ['lands-end', 'Lands End Lookout', 37.7800, -122.5033, 'San Francisco', 'Pacific coastline, rocky headlands and the historic Sutro Baths landscape meet at the western edge of the city.', ['ocean','greenery'], 'https://www.nps.gov/goga/planyourvisit/landsend.htm', 'Lands End San Francisco ocean'],
  ['grandview-park', 'Grandview Park', 37.7563, -122.4719, 'San Francisco', 'A small hilltop above the Sunset District, with city and coastal scenery. Stay on paths to protect the fragile habitat.', ['ocean','skyline','hills'], 'https://www.sfrecpark.org/Facilities/Facility/Details/Grand-View-Park-338', 'Grandview Park San Francisco view'],
  ['bernal-heights', 'Bernal Heights Hill', 37.7431, -122.4146, 'San Francisco', 'An open hilltop in the city with skyline views and a network of established paths.', ['skyline','hills','greenery'], 'https://www.sfrecpark.org/1401/Explore-Our-Open-Spaces', 'Bernal Heights San Francisco skyline'],
  ['point-reyes-lighthouse', 'Point Reyes Lighthouse Observation Deck', 37.99645, -123.02099, 'Marin', 'An observation deck high above the Pacific near the Point Reyes Lighthouse. Conditions can be very windy.', ['ocean','hills'], 'https://www.nps.gov/places/point-reyes-picnic-area-lighthouse-observation-deck.htm', 'Point Reyes Lighthouse view'],
  ['windy-hill', 'Windy Hill Summit', 37.3644, -122.2373, 'San Mateo', 'The summit gives a 360-degree panorama from San Francisco Bay to the Pacific Ocean.', ['ocean','hills','greenery'], 'https://www.openspace.org/preserves/windy-hill', 'Windy Hill Open Space Preserve view', [[0,360]]],
  ['mori-point', 'Mori Point', 37.6105, -122.4983, 'San Mateo', 'Coastal bluffs above Pacifica with ocean views and restored habitat. Use designated paths.', ['ocean','hills','greenery'], 'https://www.nps.gov/goga/planyourvisit/moripoint.htm', 'Mori Point Pacifica'],
  ['mount-umunhum', 'Mount Umunhum Summit', 37.1606, -121.8986, 'Santa Clara', 'A restored mountain summit with panoramic views, interpretive displays and an accessible summit pathway.', ['hills','skyline','greenery','ocean'], 'https://www.openspace.org/stories/seven-breathtaking-views', 'Mount Umunhum summit view', [[0,360]]],
  ['hunters-point', 'Hunters Point — Fremont Older', 37.2885, -122.0637, 'Santa Clara', 'An exposed hilltop in Fremont Older Preserve overlooking the Santa Clara Valley.', ['hills','skyline','greenery'], 'https://www.openspace.org/preserves/fremont-older-preserve', 'Fremont Older Hunters Point view'],
  ['mount-diablo', 'Mount Diablo Summit', 37.8816, -121.9142, 'Contra Costa', 'The summit can offer far-reaching views in every direction when the air is clear.', ['hills','greenery'], 'https://www.parks.ca.gov/?page_id=517', 'Mount Diablo summit panorama', [[0,360]]],
  ['inspiration-point', 'Inspiration Point — Tilden', 37.9056, -122.2442, 'Contra Costa', 'A scenic starting point in the Berkeley hills, with rolling grasslands and views along Nimitz Way.', ['hills','greenery'], 'https://www.ebparks.org/parks/tilden', 'Tilden Inspiration Point view'],
  ['mission-peak', 'Mission Peak Summit', 37.5125, -121.8806, 'Alameda', 'A demanding summit outing rewarded with views of the South Bay and surrounding mountain ranges. Check park hours before visiting.', ['hills','skyline','greenery'], 'https://www.ebparks.org/parks/mission-peak', 'Mission Peak summit view'],
  ['coyote-hills', 'Coyote Hills — Bay View', 37.5521, -122.0927, 'Alameda', 'Low grassy hills beside the bay and marshlands, with broad water and East Bay views.', ['hills','greenery','bridges'], 'https://www.ebparks.org/parks/coyote-hills', 'Coyote Hills Regional Park view'],
  ['hawk-hill', 'Hawk Hill', 37.8268, -122.4995, 'Marin', 'A Marin Headlands hilltop with coastal and Golden Gate scenery, also known for migrating raptors.', ['bridges','ocean','hills'], 'https://www.nps.gov/goga/planyourvisit/marin-headlands-scenic-vistas.htm', 'Hawk Hill Golden Gate view'],
  ['gunsight-rock', 'Gunsight Rock Overlook', 38.4870, -122.5670, 'Sonoma', 'A rocky overlook reached by the Hood Mountain trail network. Check current trails and closures before setting out.', ['hills','greenery'], 'https://parks.sonomacounty.ca.gov/Microsites/Regional%20Parks/Documents/Visit/Maps/Hood-Mountain-Park-Map.pdf', 'Gunsight Rock Sonoma view'],
  ['westwood-hills', 'Westwood Hills — Summit Vista', 38.3046, -122.3308, 'Napa', 'Oak woodland and meadow trails climb toward views over Napa. The park is open sunrise to sunset.', ['hills','greenery'], 'https://www.cityofnapa.org/DocumentCenter/View/9994/Westwood-Hills-Trail-Map', 'Westwood Hills Napa'],
  ['lynch-canyon', 'Lynch Canyon — Ridge View', 38.1750, -122.2350, 'Solano', 'Rolling grassland ridges and oak groves in a jointly managed open space. Confirm opening days before visiting.', ['hills','greenery'], 'https://www.solanocounty.gov/government/resource-management/solano-county-parks/lynch-canyon-open-space', 'Lynch Canyon view'],
];

function clean(value = '') { return String(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
const unsuitable = /Milk Maids|Tremella|Stereum|Sperm Whale|Fresnel lens|bulletin|Grandview Park from UCSF|Western.gull|First.beach.sunset|Beehives|Diablo.Panoramic.From.Newhall|Umunhum.aerial.view|radar.tower.on.Mount.Umunhum/i;
const exactPhotoTitles = {
  'windy-hill': 'File:Mount Diablo from Windy Hill.JPG',
  'mount-umunhum': 'File:Mount Umunhum - West from Mount Umunhum Rd.jpg',
};
const photoQueries = {
  'windy-hill': 'intitle:"Windy Hill" panorama California',
  'mount-umunhum': '"Mount Umunhum" view',
  'mount-diablo': 'intitle:"Mount Diablo" panorama',
  'gunsight-rock': '"Gunsight Rock"',
  'westwood-hills': '"Westwood Hills" Napa',
  'lynch-canyon': '"Lynch Canyon"',
};
async function json(url, options = {}) {
  // curl honors the desktop host's proxy configuration, unlike Node's default fetch.
  const { stdout } = await run('curl', ['--fail', '--silent', '--show-error', '--max-time', '35', String(url)], {maxBuffer: 30 * 1024 * 1024});
  return JSON.parse(stdout);
}
async function photos(query, exactTitle, location) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  const parameters=exactTitle ? {titles:exactTitle} : {generator:'search',gsrsearch:`${query} filetype:bitmap`,gsrnamespace:'6',gsrlimit:'10'};
  Object.entries({action:'query',format:'json',...parameters,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1200'}).forEach(([k,v])=>url.searchParams.set(k,v));
  const data = await json(url);
  return Object.values(data.query?.pages || {}).sort((a,b)=>a.index-b.index).flatMap(page=>{
    const info=page.imageinfo?.[0], meta=info?.extmetadata;
    const license=clean(meta?.LicenseShortName?.value), author=clean(meta?.Artist?.value);
    if (!info || !author || unsuitable.test(page.title) || !/CC BY|CC0|Public domain/i.test(license) || /NC|ND/i.test(license)) return [];
    const photoLat=Number(meta?.GPSLatitude?.value),photoLng=Number(meta?.GPSLongitude?.value);
    if(location && Number.isFinite(photoLat) && Number.isFinite(photoLng) && distance(location,{lat:photoLat,lng:photoLng})>6000)return [];
    return [{url: (info.thumburl || info.url).split('?')[0], author, license, sourceUrl:info.descriptionurl, caption:clean(meta.ObjectName?.value || page.title.replace(/^File:/,''))}];
  }).slice(0,2);
}

function distance(a,b) { const x=(a.lat-b.lat)*111320,y=(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180);return Math.hypot(x,y); }
function inferTags(tags) {
  const text=Object.values(tags).join(' ').toLowerCase();
  const result=[];
  if(/ocean|coast|pacific|beach|sea cliff/.test(text))result.push('ocean');
  if(/bridge|golden gate/.test(text))result.push('bridges');
  if(/city|skyline|downtown|san francisco/.test(text))result.push('skyline');
  if(/hill|mount|peak|ridge|summit/.test(text))result.push('hills');
  if(/forest|wood|tree|park|preserve|garden/.test(text))result.push('greenery');
  return [...new Set(result)];
}
async function osmImport() {
  const names=counties.map(c=>c==='San Francisco'?'San Francisco':`${c} County`).join('|');
  const query=`[out:json][timeout:90];area["ISO3166-2"="US-CA"]["admin_level"="4"]->.ca;rel(area.ca)["admin_level"="6"]["name"~"^(${names})$"];map_to_area->.counties;foreach.counties->.county(.county out tags;nwr(area.county)["tourism"="viewpoint"];out center tags;);`;
  const errors=[];
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter']) {
    try {
      const url=new URL(endpoint);url.searchParams.set('data',query);
      const response=await json(url);if(response.remark)throw new Error(response.remark);
      let county='';const imported=[];
      for(const el of response.elements || []) {
        if(el.type==='area'){county=(el.tags?.name || '').replace(/ County$/,'');continue;}
        const lat=el.lat ?? el.center?.lat,lng=el.lon ?? el.center?.lon;
        if(!counties.includes(county) || !Number.isFinite(lat) || !Number.isFinite(lng))continue;
        const tags=el.tags || {},name=tags.name || tags['name:en'] || `${county} viewpoint`;
        if(tags.access==='private' || tags.access==='no')continue;
        const view={id:`osm-${el.type}-${el.id}`,name,lat,lng,county,description:tags.description || 'A community-mapped viewpoint. Access and viewing direction have not been independently confirmed.',tags:inferTags(tags),featured:null,sourceUrl:`https://www.openstreetmap.org/${el.type}/${el.id}`,photos:[]};
        if(!imported.some(v=>v.id===view.id || (v.name===view.name && distance(v,view)<40)))imported.push(view);
      }
      if(!imported.length)throw new Error('No Bay Area viewpoints returned');
      return {viewpoints:imported,endpoint};
    }catch(error){errors.push(`${endpoint}: ${error.message}`);console.warn(errors.at(-1));}
  }
  throw new Error(errors.join('; '));
}

let previous;
try{previous=JSON.parse(await readFile(destination,'utf8'));}catch{}
let viewpoints=[],importError=null,endpoint=null;
if(!process.argv.includes('--curated-only')) {
  try{const result=await osmImport();viewpoints=result.viewpoints;endpoint=result.endpoint;}
  catch(error){importError=error.message;viewpoints=(previous?.viewpoints || []).filter(v=>v.id.startsWith('osm-'));}
} else importError='Overpass import was not completed in this environment. Curated official-source collection shown; no complete-coverage claim.';
let order=0;
for(const [id,name,lat,lng,county,description,tags,sourceUrl,query,directions] of seeds) {
  const seed={id,name,lat,lng,county,description,tags,featured:order++,sourceUrl,photos:[],...(directions?{directions}: {})};
  const old=previous?.viewpoints?.find(v=>v.id===id);
  const retained=(old?.photos || []).filter(p=>!unsuitable.test(`${p.caption} ${p.url}`));
  if(retained.length && !process.argv.includes('--refresh-photos'))seed.photos=retained;
  else if(id!=='gunsight-rock')try{seed.photos=await photos(photoQueries[id] || query,exactPhotoTitles[id],seed);}catch(error){console.warn(`Photos for ${name}: ${error.message}`);}
  const match=viewpoints.findIndex(v=>distance(v,seed)<80 && (v.name.toLowerCase().includes(name.toLowerCase().split(' — ')[0]) || seed.name.toLowerCase().includes(v.name.toLowerCase())));
  if(match>=0){seed.osmSourceUrl=viewpoints[match].sourceUrl;viewpoints[match]=seed;}else viewpoints.push(seed);
  console.log(`${name}: ${seed.photos.length} attributed photos`);
}
viewpoints.sort((a,b)=>(a.featured ?? 9999)-(b.featured ?? 9999) || a.name.localeCompare(b.name));
const result={importedAt:new Date().toISOString(),counties,sources:[{name:'OpenStreetMap contributors · ODbL',url:'https://www.openstreetmap.org/copyright'},{name:'Wikimedia Commons · individual photo licenses',url:'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia'},...seeds.map(s=>({name:s[1],url:s[7]}))],viewpoints,importStatus:{osmImported:viewpoints.filter(v=>v.id.startsWith('osm-')||v.osmSourceUrl).length,curatedCount:seeds.length,endpoint,complete:!importError,...(importError?{note:importError}:{})}};
await writeFile(destination,JSON.stringify(result,null,2)+'\n');
console.log(`Wrote ${viewpoints.length} viewpoints; ${viewpoints.filter(v=>v.photos.length).length} with Commons images. OSM import ${result.importStatus.complete?'complete':'unavailable'}.`);
