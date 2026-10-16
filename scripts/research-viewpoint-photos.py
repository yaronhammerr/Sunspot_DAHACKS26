#!/usr/bin/env python3
"""Discover attributable Commons photo candidates for every viewpoint.
Results are candidates only: a person must verify the subject before publication.
Standard library + curl; resumes from JSON cache; two concurrent requests.
"""
import argparse, concurrent.futures, hashlib, html, json, math, pathlib, re, subprocess, threading, time, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'work/photo-research'
API = 'https://commons.wikimedia.org/w/api.php'
AGENT = 'SunspotPhotoResearch/1.0 (https://github.com/yaronhammerr/Sunspot_DAHACKS26)'
META = 'Artist|LicenseShortName|LicenseUrl|ImageDescription|ObjectName|GPSLatitude|GPSLongitude|Categories|License|UsageTerms|AttributionRequired|Restrictions'
ALIASES = {
 'borel-hill':'"Borel Hill"', 'monte-bello-vista':'"Monte Bello" "California"', 'long-ridge-loop':'"Long Ridge" "California"',
 'skyline-ridge-lakes':'"Horseshoe Lake" "Skyline Ridge"', 'coal-creek-vista':'"Clouds Rest" "Coal Creek"',
 'picchetti-reservoir-view':'"Picchetti"', 'el-sereno-ridge':'"El Sereno" "preserve"', 'pulgas-ridge-view':'"Pulgas Ridge"',
 'purisima-ridge':'"Purisima Creek"', 'rancho-high-meadow':'"Rancho San Antonio" view', 'sierra-vista-overlook':'"Sierra Vista" "Santa Clara"',
 'coyote-valley-arrowhead':'"Coyote Valley" preserve', 'bald-mountain-sierra':'"Bald Mountain" "Sierra Azul"',
 'presidio-tunnel-tops':'"Presidio Tunnel Tops"', 'presidio-inspiration-point':'"Inspiration Point" "Presidio"',
 'presidio-immigrant-point':'"Immigrant Point"', 'presidio-pacific-overlook':'"Pacific Overlook"', 'presidio-golden-gate-overlook':'"Golden Gate Overlook"',
 'presidio-battery-east':'"Battery East"', 'chimney-rock':'"Chimney Rock" "Point Reyes"', 'slacker-ridge':'"Slacker" "Marin"',
 'hill-88':'"Hill 88"', 'kirby-cove':'"Kirby Cove"', 'point-bonita':'"Point Bonita"', 'devils-slide':'"Devils Slide" "California"',
 'san-bruno-summit':'"San Bruno Mountain"', 'las-trampas-rocky':'"Rocky Ridge" "Las Trampas"', 'briones-ridge':'"Briones" panorama',
 'sibley-round-top':'"Sibley" "Round Top"', 'black-diamond-ridges':'"Black Diamond Mines"', 'round-valley-hills':'"Round Valley" "Contra Costa"',
 'castle-rock-goat':'"Goat Rock" "Castle Rock"', 'angel-island-livermore':'"Mount Livermore"', 'sugarloaf-bald':'"Bald Mountain" "Sugarloaf"',
 'jack-london-vistas':'"Jack London" "Sonoma"', 'big-basin-ocean-view':'"Ocean View" "Big Basin"', 'glacier-point':'"Glacier Point"',
 'sentinel-dome':'"Sentinel Dome"', 'taft-point':'"Taft Point"', 'tunnel-view':'"Tunnel View"', 'lassen-peak':'"Lassen Peak" summit',
 'bumpass-hell':'"Bumpass Hell"', 'castle-crags-vista':'"Castle Crags" vista', 'emerald-bay-overlook':'"Emerald Bay" overlook',
 'point-lobos-headlands':'"Point Lobos"', 'mendocino-headlands':'"Mendocino Headlands"', 'sue-meg-headlands':'"Patricks Point"',
 'pigeon-point':'"Pigeon Point"', 'del-valle-shore':'"Del Valle" lake', 'albany-bay-trail':'"Albany" "waterfront"',
 'brushy-peak-loop':'"Brushy Peak"', 'carquinez-ridge':'"Carquinez" "ridge"', 'las-trampas-circuit':'"Las Trampas"',
 'roberts-ridge-loop':'"Redwood Peak"', 'vargas-plateau':'"Vargas Plateau"', 'lake-chabot-ridges':'"Lake Chabot"',
 'pleasanton-ridge':'"Pleasanton Ridge"', 'tilden-meadows':'"Tilden" "Meadows"', 'wildcat-canyon-ridge':'"Wildcat Canyon"',
 'gunsight-rock':'"Gunsight Rock"', 'westwood-hills':'"Westwood Hills" "Napa"', 'lynch-canyon':'"Lynch Canyon"',
 'hunters-point':'"Hunters Point" "Fremont Older"', 'inspiration-point':'"Inspiration Point" "Tilden"',
 'mount-umunhum':'"Mount Umunhum" summit', 'mount-diablo':'"Mount Diablo" summit', 'mount-tamalpais':'"Mount Tamalpais" "East Peak"',
 'windy-hill':'"Windy Hill" "California"', 'coyote-hills':'"Coyote Hills"',
}
lock = threading.Lock()
api_slots = threading.BoundedSemaphore(2)
last_request = 0.0

def clean(value):
 return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', str(value or '')))).strip()

def api(params):
 global last_request
 key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
 dest = CACHE / 'api' / (key + '.json')
 if dest.exists(): return json.loads(dest.read_text())
 url = API + '?' + urllib.parse.urlencode(dict(action='query', format='json', maxlag='5', **params))
 for attempt in range(3):
  with lock:
   time.sleep(max(0, .25 - (time.monotonic() - last_request)))
   last_request = time.monotonic()
  with api_slots:
   result = subprocess.run(['curl','-fLsS','--max-time','35','-A',AGENT,url],capture_output=True,text=True)
  try:
   if result.returncode: raise RuntimeError(result.stderr[:180])
   data = json.loads(result.stdout)
   if data.get('error'): raise RuntimeError(str(data['error']))
   dest.parent.mkdir(parents=True,exist_ok=True); dest.write_text(json.dumps(data))
   return data
  except Exception:
   if attempt == 2: raise
   time.sleep(2 * (attempt + 1))

def parse(data, method, query):
 out=[]
 for page in data.get('query',{}).get('pages',{}).values():
  info = (page.get('imageinfo') or [{}])[0]; meta=info.get('extmetadata',{})
  if not info.get('url'): continue
  vals={k:clean(v.get('value')) for k,v in meta.items()}
  width,height=info.get('width',0),info.get('height',0)
  license=vals.get('LicenseShortName',''); author=vals.get('Artist','')
  allowed=bool(re.search(r'CC BY|CC0|Public domain',license,re.I)) and not re.search(r'\bNC\b|\bND\b',license,re.I)
  quality=((max(width,height)>=1600 and min(width,height)>=900) or (width>=1920 and height>=400 and width/height>=3)) and info.get('mime') in ['image/jpeg','image/png','image/webp']
  out.append(dict(pageId=page.get('pageid'),title=page['title'],sourceUrl=info['descriptionurl'],originalUrl=info['url'].split('?')[0],previewUrl=info.get('thumburl',info['url']).split('?')[0],width=width,height=height,bytes=info.get('size'),mime=info.get('mime'),author=author,license=license,licenseUrl=vals.get('LicenseUrl'),description=vals.get('ImageDescription',''),categories=vals.get('Categories',''),gpsLat=vals.get('GPSLatitude'),gpsLng=vals.get('GPSLongitude'),qualified=bool(quality and allowed and author),discovery=method,query=query))
 return out

def search_name(v):
 if v['id'] in ALIASES: return ALIASES[v['id']]
 name=v['name'].split(', 916 ')[0]
 # Search the named destination, keeping county/state context for ambiguous names.
 name=re.sub(r'\s*[—–].*$', '', name)
 generic=bool(re.fullmatch(r'(vista( point)?|view( ?point)?|overlook( point)?|summit|lookout( point)?|ocean view|sunset( point)?|turnout|bench|observation deck|ranch view|high viewpoint|low viewpoint|cityc|top of the world)',name,re.I))
 return '"' + name.replace('"','').replace('’',"'") + '"' + (' '+v['county']+' California' if generic else '')

def run_view(v, mode):
 dest=CACHE/'views'/f"{v['id']}.json"
 prior=json.loads(dest.read_text()) if dest.exists() else dict(id=v['id'],name=v['name'],lat=v['lat'],lng=v['lng'],county=v['county'],candidates=[],searches=[])
 tasks=[]
 if mode in ['geo','all'] and not any(q['method']=='coordinates' for q in prior['searches']):
  tasks.append(('coordinates', f"{v['lat']}|{v['lng']}",dict(generator='geosearch',ggscoord=f"{v['lat']}|{v['lng']}",ggsradius='150',ggsnamespace='6',ggslimit='12')))
 if mode in ['names','all'] and not v['name'].startswith('Unnamed mapped') and not any(q['method']=='name' and q['query']==search_name(v) for q in prior['searches']):
  q=search_name(v)
  tasks.append(('name',q,dict(generator='search',gsrsearch=q+' filetype:bitmap',gsrnamespace='6',gsrlimit='10')))
 for method,q,params in tasks:
  try:
   data=api(dict(**params,prop='imageinfo',iiprop='url|size|mime|extmetadata',iiurlwidth='1920',iiextmetadatafilter=META))
   prior['candidates']+=parse(data,method,q)
   prior['searches'].append(dict(method=method,query=q,status='searched',returned=len(data.get('query',{}).get('pages',{}))))
  except Exception as e:
   prior.setdefault('errors',[]).append(dict(method=method,query=q,error=str(e)))
 # Deduplicate but retain all discovery methods for review.
 unique={}
 for c in prior['candidates']:
  key=c['sourceUrl']
  if key in unique:
   methods=set(unique[key].get('discoveries',[unique[key]['discovery']]))|{c['discovery']}; unique[key]['discoveries']=sorted(methods)
  else: unique[key]=c
 prior['candidates']=list(unique.values())
 prior['checkedAt']='2026-10-16'
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(prior,ensure_ascii=False,indent=2)+'\n')
 return prior


def metres(a,b):
 return math.hypot((a['lat']-b['lat'])*111320,(a['lng']-b['lng'])*111320*math.cos(a['lat']*math.pi/180))

def load_inventory():
 """Build the discovery inventory using the same deduplication as the app.
 Node is already a project prerequisite; no unpublished work files are needed.
 """
 source_files=[ROOT/'data/curated-viewpoints.json',ROOT/'data/mapped-viewpoints.json']
 fingerprint=hashlib.sha256(b''.join(p.read_bytes() for p in source_files)).hexdigest()
 dest=CACHE/'inventory.json'
 old=json.loads(dest.read_text()) if dest.exists() else {}
 if old.get('sourceFingerprint')==fingerprint:return old['viewpoints']
 code="""import { readFileSync } from 'node:fs';
import { assemble } from './scripts/assemble-catalog.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
process.stdout.write(JSON.stringify(assemble(read('data/curated-viewpoints.json'), read('data/mapped-viewpoints.json'))));"""
 result=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,capture_output=True,text=True,check=True)
 inventory=json.loads(result.stdout)['viewpoints']
 dest.write_text(json.dumps(dict(sourceFingerprint=fingerprint,viewpoints=inventory),ensure_ascii=False)+'\n')
 return inventory

def bulk_geo(inventory):
 pending=[]
 for v in inventory:
  dest=CACHE/'views'/f"{v['id']}.json"
  old=json.loads(dest.read_text()) if dest.exists() else {}
  if not any(q['method']=='coordinates' for q in old.get('searches',[])):pending.append(v)
 count=0;clusters=0
 while pending:
  centre=pending[0];clusters+=1
  try:
   data=api(dict(list='geosearch',gscoord=f"{centre['lat']}|{centre['lng']}",gsradius='10000',gsnamespace='6',gslimit='500'))
   images=data.get('query',{}).get('geosearch',[])
   # If a dense-area query hits the API cap, only use its fully covered inner
   # disk. Remaining viewpoints get another query, never an empty-result guess.
   covered=10000 if len(images)<500 else max(151,images[-1]['dist']-1)
   members=[v for v in pending if metres(v,centre)<=max(0,covered-150)]
   if not members:members=[centre]
   matches={v['id']:[p for p in images if metres(v,dict(lat=p['lat'],lng=p['lon']))<=150] for v in members}
   ids=sorted({p['pageid'] for ps in matches.values() for p in ps})
   pages={}
   for off in range(0,len(ids),50):
    batch=api(dict(pageids='|'.join(map(str,ids[off:off+50])),prop='imageinfo',iiprop='url|size|mime|extmetadata',iiurlwidth='1920',iiextmetadatafilter=META))
    pages.update(batch.get('query',{}).get('pages',{}))
   for v in members:
    dest=CACHE/'views'/f"{v['id']}.json"
    old=json.loads(dest.read_text()) if dest.exists() else dict(id=v['id'],name=v['name'],lat=v['lat'],lng=v['lng'],county=v['county'],candidates=[],searches=[])
    chosen={str(p['pageid']):pages[str(p['pageid'])] for p in matches[v['id']] if str(p['pageid']) in pages}
    old['candidates']+=parse(dict(query=dict(pages=chosen)),'coordinates',f"{v['lat']}|{v['lng']} (150 m; covered spatial batch)")
    old['searches'].append(dict(method='coordinates',query=f"{v['lat']}|{v['lng']}",radiusMeters=150,status='searched',returned=len(chosen),batchCentre=dict(lat=centre['lat'],lng=centre['lng']),batchCoveredRadiusMeters=round(covered)))
    old['checkedAt']='2026-10-16'
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(old,indent=2,ensure_ascii=False)+'\n')
   member_ids={v['id'] for v in members};pending=[v for v in pending if v['id'] not in member_ids];count+=len(members)
   progress=dict(mode='spatial-batches',completed=len(inventory)-len(pending),total=len(inventory),remaining=len(pending),clusters=clusters,last=centre['name'])
   (CACHE/'progress.json').write_text(json.dumps(progress,indent=2)+'\n')
   if clusters%10==0 or not pending:print(json.dumps(progress),flush=True)
  except Exception as e:
   print(json.dumps(dict(error=str(e),name=centre['name'])),flush=True)
   # A failed query remains unsearched and will be retried on the next run.
   pending=pending[1:]

def main():
 p=argparse.ArgumentParser();p.add_argument('--mode',choices=['geo','names','all','bulk-geo'],default='all');p.add_argument('--limit',type=int);p.add_argument('--workers',type=int,default=2,choices=[1,2]);args=p.parse_args()
 CACHE.mkdir(parents=True,exist_ok=True)
 inventory=load_inventory()
 inventory=sorted(inventory,key=lambda v:(v['region']!='bay-area',v.get('visit',{}).get('reviewStatus')!='official-source-reviewed',v['name'].startswith('Unnamed mapped'),v['name']))
 if args.mode=='names': inventory=[v for v in inventory if not v['name'].startswith('Unnamed mapped')]
 if args.limit: inventory=inventory[:args.limit]
 if args.mode=='bulk-geo':bulk_geo(inventory);return
 done=with_photos=errors=candidates=0;start=time.monotonic()
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
  for r in pool.map(lambda v:run_view(v,args.mode),inventory):
   done+=1;qual=sum(c['qualified'] for c in r['candidates']);with_photos+=bool(qual);candidates+=qual;errors+=len(r.get('errors',[]))
   progress=dict(mode=args.mode,completed=done,total=len(inventory),withCandidates=with_photos,qualifiedCandidates=candidates,errors=errors,elapsedSeconds=round(time.monotonic()-start),last=r['name'])
   (CACHE/('progress-'+args.mode+'.json')).write_text(json.dumps(progress,indent=2)+'\n')
   if done%25==0 or done==len(inventory):print(json.dumps(progress),flush=True)

if __name__=='__main__':main()
