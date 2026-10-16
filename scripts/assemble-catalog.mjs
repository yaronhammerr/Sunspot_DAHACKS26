/** Rebuild app catalog from reviewed profiles and the checked-in OSM snapshot.
 * This does not refresh evidence dates or turn missing metadata into facts.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { applyPhotoPolicy, imageDimensions, PHOTO_POLICY } from './photo-policy.mjs';
import { applyViewpointNames } from './viewpoint-names.mjs';
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
export const unknown = (note = 'Not researched. Confirm with the land manager before visiting.') => ({ value: null, status: 'unknown', sourceIds: [], checkedAt: null, note });
const distance = (a,b) => Math.hypot((a.lat-b.lat)*111320,(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180));
const words = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['the','view','overlook','point','vista','scenic','area','summit','park','regional','preserve','mapped','unnamed','mount','mountain','hill','ridge','lookout','battery','san','county'].includes(w));
export function samePlace(a,b) {
  if(a.county!==b.county || distance(a,b)>150 || /^Unnamed mapped overlook/.test(a.name) || /^Unnamed mapped overlook/.test(b.name))return false;
  if(a.coordinateSourceUrl === b.sourceUrl)return true;
  const aw=words(a.name),bw=words(b.name);
  const shorter=aw.length<=bw.length?aw:bw,longer=aw.length<=bw.length?bw:aw;
  return shorter.length>0 && shorter.every(w=>longer.includes(w));
}
function scenery(tags) {
  const text=[tags.name,tags.description].filter(Boolean).join(' ').toLowerCase();const out=[];
  if(/ocean|coast|pacific|beach|sea cliff/.test(text))out.push('ocean');
  if(/bridge|golden gate/.test(text))out.push('bridges');
  if(/skyline|downtown/.test(text))out.push('skyline');
  if(/hill|mount|peak|ridge|summit/.test(text))out.push('hills');
  if(/forest|wood|tree|park|preserve|garden/.test(text))out.push('greenery');
  return out;
}
export function mappedViewpoint(row, snapshot) {
  const t=row.tags, source={id:row.id,title:'OpenStreetMap community mapping',url:row.sourceUrl,publisher:'OpenStreetMap contributors',retrievedAt:snapshot.retrievedAt,kind:'community'};
  const fact=(value,note='Community-mapped metadata; not independently confirmed by the land manager.')=>({value,status:'reported',sourceIds:[source.id],checkedAt:snapshot.retrievedAt,note});
  const visit={reviewStatus:'community-mapped',reviewedAt:null,...Object.fromEntries(['manager','hours','fees','parking','elevationFeet','terrain','accessibility','facilities','seasonalAccess','cautions'].map(k=>[k,unknown()])),rules:Object.fromEntries(['dogs','bicycles','drones','fires','camping','other'].map(k=>[k,unknown()])),routes:[],sources:[source],alertsUrl:row.sourceUrl,mapUrl:null,coordinateNote:row.osmType==='way'?'Approximate center of a community-mapped feature; not a surveyed trailhead.':'Community-mapped location. Public access and safe approach have not been independently confirmed.'};
  if(t.operator)visit.manager=fact(t.operator);
  if(t.opening_hours)visit.hours=fact(t.opening_hours,'Raw OpenStreetMap opening_hours syntax. Not parsed into live open/closed status; verify signs and official hours.');
  if(t.fee || t.charge)visit.fees=fact([t.fee&&`Mapped fee: ${t.fee}`,t.charge&&`Mapped charge: ${t.charge}`].filter(Boolean).join('; '));
  if(t.surface || t.incline || t.sac_scale)visit.terrain=fact([t.surface&&`Surface: ${t.surface}`,t.incline&&`Incline: ${t.incline}`,t.sac_scale&&`OSM hiking scale: ${t.sac_scale}`].filter(Boolean).join('; '));
  if(t.wheelchair || t['wheelchair:description'])visit.accessibility=fact([t.wheelchair&&`Mapped wheelchair access: ${t.wheelchair}`,t['wheelchair:description']].filter(Boolean).join('; '));
  if(t.dog)visit.rules.dogs=fact(`Mapped dog access: ${t.dog}`);
  if(t.bicycle)visit.rules.bicycles=fact(`Mapped bicycle access: ${t.bicycle}`);
  if(t.access || t.foot)visit.rules.other=fact([t.access&&`Mapped access: ${t.access}`,t.foot&&`Mapped pedestrian access: ${t.foot}`].filter(Boolean).join('; '));
  if(t.seasonal)visit.seasonalAccess=fact(`Mapped seasonal access: ${t.seasonal}`);
  if(t.ele && /^-?\d+(\.\d+)?\s*(m|ft|feet)?$/.test(t.ele)) { const feet=/ft|feet/.test(t.ele);visit.elevationFeet=fact(Math.round(parseFloat(t.ele)*(feet?1:3.28084)),`Mapped point elevation (${t.ele}${feet?'':' metres'}), converted to feet. This is not route elevation gain.`); }
  const facilities=['toilets','drinking_water','bench','shelter','parking'].filter(k=>t[k]).map(k=>`${k.replaceAll('_',' ')}: ${t[k]}`);if(facilities.length)visit.facilities=fact(facilities.join('; '));
  return {id:row.id,name:row.name,lat:row.lat,lng:row.lng,county:row.county,region:row.region,description:'A community-mapped viewpoint. Confirm public access, safe routes and current conditions with the land manager before visiting.',tags:scenery(t),featured:null,sourceUrl:row.sourceUrl,photos:[],visit};
}
export function assemble(curated,snapshot) {
  const result=structuredClone(curated),merges=[];
  for(const row of snapshot.viewpoints) {
    if(['private','no'].includes(row.tags.access)||row.tags.foot==='no')continue;
    const match=result.find(v=>samePlace(v,row));
    if(match){merges.push({keptId:match.id,mappedId:row.id,sourceUrl:row.sourceUrl});continue;}
    result.push(mappedViewpoint(row,snapshot));
  }
  return {viewpoints:result,merges};
}
const core=['hours','fees','terrain','accessibility','facilities','parking'];
export function coverageFor(viewpoints) {
  const counts={};
  for(const v of viewpoints){const key=v.county;counts[key]??={county:key,region:v.region,total:0,officialProfiles:0,communityMapped:0,routes:0,withDistance:0,withElevationGain:0,...Object.fromEntries(core.map(k=>[k,0]))};const c=counts[key],p=v.visit;c.total++;c.officialProfiles+=p.reviewStatus==='official-source-reviewed'?1:0;c.communityMapped+=p.reviewStatus==='community-mapped'?1:0;c.routes+=p.routes.length;c.withDistance+=p.routes.some(r=>r.distanceMiles.value!==null)?1:0;c.withElevationGain+=p.routes.some(r=>r.elevationGainFeet.value!==null)?1:0;for(const k of core)c[k]+=p[k].value!==null?1:0;}
  return Object.values(counts).sort((a,b)=>(a.region==='bay-area'?0:1)-(b.region==='bay-area'?0:1)||a.county.localeCompare(b.county));
}
async function main(){
  const curated=await read('data/curated-viewpoints.json');
  const snapshot=await read('data/mapped-viewpoints.json');
  const {viewpoints:inventory,merges}=assemble(curated,snapshot);
  const photoManifest=await read('data/viewpoint-photos.json');
  const {viewpoints:photoBacked,excluded}=applyPhotoPolicy(inventory,photoManifest);
  const names=await read('data/viewpoint-names.json');
  const viewpoints=applyViewpointNames(photoBacked,names);
  if(!viewpoints.length)throw new Error('No viewpoints have verified preview photos. Review the photo manifest before building.');
  for(const photo of viewpoints.flatMap(v=>v.photos)) {
    const file=await readFile(new URL('public'+photo.url,root));
    if(createHash('sha256').update(file).digest('hex')!==photo.sha256 || file.length!==photo.bytes)throw new Error(`Photo asset failed integrity check: ${photo.url}`);
    const dimensions=imageDimensions(file);
    if(dimensions.width!==photo.width || dimensions.height!==photo.height)throw new Error(`Photo dimensions do not match verified pixels: ${photo.url}`);
  }
  const counties=coverageFor(viewpoints);
  const coverage={total:viewpoints.length,officialProfiles:viewpoints.filter(v=>v.visit.reviewStatus==='official-source-reviewed').length,communityMapped:viewpoints.filter(v=>v.visit.reviewStatus==='community-mapped').length,routeCount:viewpoints.reduce((n,v)=>n+v.visit.routes.length,0),photoVerified:viewpoints.length,discoveryInventory:inventory.length,excludedWithoutPhoto:excluded.length,complete:false,note:'Only viewpoints with reviewed, high-resolution preview photos are published. Discovery records without a verified photo are excluded from the app. Official-source profiles and community-mapped locations are distinguished. Missing visitor details remain unknown. Check agency alerts and signs before travel.'};
  const evidenceDates=viewpoints.flatMap(v=>v.visit.sources.map(s=>s.retrievedAt));
  const result={schemaVersion:3,importedAt:[snapshot.retrievedAt,...evidenceDates,photoManifest.checkedAt].sort().at(-1),counties:counties.map(c=>c.county),sources:[{name:'OpenStreetMap contributors · ODbL',url:'https://www.openstreetmap.org/copyright'},{name:'Geofabrik Northern California extract',url:snapshot.extractUrl},{name:'Official park sources, per fact in viewpoint details',url:'https://www.nps.gov/'},{name:'Wikimedia Commons · individual photo licenses',url:'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia'}],coverage,viewpoints,importStatus:{complete:false,scope:snapshot.scope,dataTimestamp:snapshot.dataTimestamp,mergedDuplicates:merges.length,photoCheckedAt:photoManifest.checkedAt,photoPolicy:PHOTO_POLICY}};
  const queue=viewpoints.map(v=>({id:v.id,name:v.name,county:v.county,region:v.region,priority:v.region==='bay-area'?1:2,status:v.visit.reviewStatus,sourceUrl:v.sourceUrl,missing:[...core.filter(k=>v.visit[k].value===null),...(!v.visit.routes.some(r=>r.distanceMiles.value!==null)?['route-distance']:[]),...(!v.visit.routes.some(r=>r.elevationGainFeet.value!==null)?['route-elevation-gain']:[]),...Object.entries(v.visit.rules).filter(([,f])=>f.value===null).map(([k])=>`rule:${k}`)]})).sort((a,b)=>a.priority-b.priority||b.missing.length-a.missing.length||a.name.localeCompare(b.name));
  await mkdir(new URL('data/research/',root),{recursive:true});
  await writeFile(new URL('data/catalog.json',root),JSON.stringify({...result,viewpoints:undefined},null,2).slice(0,-2)+',\n  "viewpoints": [\n'+viewpoints.map(v=>'    '+JSON.stringify(v)).join(',\n')+'\n  ]\n}\n');
  await writeFile(new URL('data/research/coverage.json',root),JSON.stringify({asOf:result.importedAt,coverage,counties,duplicateMerges:merges,phases:[{region:'bay-area',status:'active',goal:'Review and enrich the nine-county inventory; clear missing high-value visitor fields.'},{region:'northern-california',status:'active-discovery',goal:'Review mapped inventory and add official route profiles after Bay Area priorities.'},{region:'southern-california',status:'queued',goal:'Next phase after Northern California enrichment; not yet collected.'}]},null,2)+'\n');
  await writeFile(new URL('data/research/queue.json',root),JSON.stringify(queue,null,2)+'\n');
  await writeFile(new URL('data/research/photo-exclusions.json',root),JSON.stringify({checkedAt:photoManifest.checkedAt,inventory:inventory.length,published:viewpoints.length,excludedCount:excluded.length,policy:PHOTO_POLICY,excluded},null,2)+'\n');
  console.log(JSON.stringify({coverage,countyCount:counties.length,bayArea:viewpoints.filter(v=>v.region==='bay-area').length,merges:merges.length},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
