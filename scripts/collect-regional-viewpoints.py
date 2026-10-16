#!/usr/bin/env python3
"""Collect regional OSM viewpoint nodes efficiently, with full current tags.
Uses only Python's standard library and curl. Downloads the POI index from a
Geofabrik ZIP via HTTP ranges, then hydrates just those nodes in small batches.
Large archives and contributor identities are never written into app data.
"""
import argparse,concurrent.futures,datetime,hashlib,json,pathlib,re,struct,subprocess,time,zipfile
BAY={'San Francisco','San Mateo','Santa Clara','Alameda','Contra Costa','Marin','Sonoma','Napa','Solano'}
KEEP={'name','name:en','ele','opening_hours','access','foot','wheelchair','surface','smoothness','incline','operator','website','contact:website','fee','charge','description','direction','wikidata','dog','bicycle','lit','drinking_water','toilets','bench','shelter','parking','sac_scale','trail_visibility','wheelchair:description','seasonal'}
BOUNDARIES='https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json'
def download(url,path,extra=()):
 subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time','60',*extra,url,'-o',str(path)],check=True)
def ring_contains(ring,x,y):
 inside=False
 for i,a in enumerate(ring):
  b=ring[i-1]
  if(a[1]>y)!=(b[1]>y)and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
def make_county_lookup(path):
 shapes=[]
 for f in json.load(open(path))['features']:
  if str(f['properties'].get('STATE',f.get('id','')[:2]))!='06':continue
  g=f['geometry'];polys=g['coordinates']if g['type']=='MultiPolygon'else[g['coordinates']]
  xs=[p[0]for poly in polys for p in poly[0]];ys=[p[1]for poly in polys for p in poly[0]]
  shapes.append((f['properties']['NAME'],polys,(min(xs),min(ys),max(xs),max(ys))))
 def lookup(x,y):
  for name,polys,b in shapes:
   if b[0]<=x<=b[2]and b[1]<=y<=b[3]and any(ring_contains(poly[0],x,y)and not any(ring_contains(h,x,y)for h in poly[1:])for poly in polys):return name
  return None
 return lookup
def poi_ids(dbf):
 raw=dbf.read_bytes();count=struct.unpack_from('<I',raw,4)[0];header,length=struct.unpack_from('<HH',raw,8);fields=[];offset=1
 for pos in range(32,header-1,32):
  f=raw[pos:pos+32];name=f[:11].split(b'\0')[0].decode();n=f[16];fields.append((name,offset,n));offset+=n
 result=[]
 for i in range(count):
  r=raw[header+i*length:header+(i+1)*length]
  if r[:1]==b'*':continue
  v={k:r[a:a+n].decode('utf-8',errors='replace').strip()for k,a,n in fields}
  if v.get('fclass')=='viewpoint':result.append(v['osm_id'])
 return result

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--region',choices=['norcal','socal'],default='norcal');parser.add_argument('--cache',default='work/viewpoint-research');parser.add_argument('--output',default='data/mapped-viewpoints.json');parser.add_argument('--offline',action='store_true');parser.add_argument('--supplement',help='Optional earlier snapshot, retaining only IDs not in this region’s hydrated node list')
 args=parser.parse_args();root=pathlib.Path(args.cache);root.mkdir(parents=True,exist_ok=True);base=f'https://download.geofabrik.de/north-america/us/california/{args.region}-latest-free.shp.zip';dbf=root/'gis_osm_pois_free_1.dbf'
 if not dbf.exists():
  if args.offline:raise RuntimeError('Offline mode needs the cached POI DBF file')
  tail=root/'zip-tail.bin';headers=root/'zip-headers.txt';download(base,tail,['--range','-65536','--max-filesize','131072','-D',str(headers)])
  m=re.search(r'Content-Range: bytes (\d+)-(\d+)/(\d+)',headers.read_text(),re.I)
  if not m:raise RuntimeError('Server must support range downloads; refusing the full archive')
  start,end,size=map(int,m.groups());assert tail.stat().st_size==end-start+1
  archive=root/'regional-poi-sparse.zip'
  with archive.open('wb')as f:f.truncate(size);f.seek(start);f.write(tail.read_bytes())
  with zipfile.ZipFile(archive)as z:info=z.getinfo('gis_osm_pois_free_1.dbf')
  a=info.header_offset;b=a+30+len(info.filename.encode())+4096+info.compress_size-1;chunk=root/'poi-entry-range.bin';download(base,chunk,['--range',f'{a}-{b}'])
  if chunk.stat().st_size!=b-a+1:raise RuntimeError('Unexpected range response size')
  with archive.open('r+b')as f:f.seek(a);f.write(chunk.read_bytes())
  with zipfile.ZipFile(archive)as z:dbf.write_bytes(z.read(info.filename)) # CRC verified by zipfile.
 marker=root/'regional-index-source.json'
 if marker.exists():
  saved=json.load(open(marker))
  if saved['region']!=args.region:raise RuntimeError('Use a separate cache directory for each region and collection date')
 else:
  headers=root/'zip-headers.txt'
  if dbf.exists() and (not headers.exists() or f'/{args.region}-' not in headers.read_text()):raise RuntimeError('Cannot verify cached index region; use a fresh cache')
  marker.write_text(json.dumps({'region':args.region,'url':base,'sha256':hashlib.sha256(dbf.read_bytes()).hexdigest()},indent=2)+'\n')
 boundaries=root/'us-counties.geojson'
 if not boundaries.exists():
  if args.offline:raise RuntimeError('Offline mode needs cached county boundaries')
  download(BOUNDARIES,boundaries)
 ids=poi_ids(dbf);groups=[ids[i:i+150]for i in range(0,len(ids),150)]
 def hydrate(item):
  i,group=item;path=root/f'node-tags-{i}.json'
  if not path.exists():
   if args.offline:raise RuntimeError(f'Missing cached node batch {i}')
   download('https://api.openstreetmap.org/api/0.6/nodes.json?nodes='+','.join(group),path);time.sleep(1)
  result=json.load(open(path))['elements']
  if set(str(e['id'])for e in result)!=set(group):raise RuntimeError(f'Node batch {i} does not match index; use a new cache for a new region/date')
  return result,path.stat().st_mtime
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(hydrate,enumerate(groups)))
 lookup=make_county_lookup(boundaries);rows={};excluded={'restricted':0,'outsideCalifornia':0,'noLongerViewpoint':0};hydrated_ids={f'osm-node-{n}'for n in ids}
 if args.supplement:
  for row in json.load(open(args.supplement))['viewpoints']:
   if row['id']not in hydrated_ids:rows[row['id']]=row
 for elements,_ in results:
  for e in elements:
   raw=e.get('tags',{})
   if raw.get('tourism')!='viewpoint':excluded['noLongerViewpoint']+=1;continue
   t={k:v for k,v in raw.items()if k in KEEP}
   if t.get('access')in['private','no']or t.get('foot')=='no':excluded['restricted']+=1;continue
   c=lookup(e['lon'],e['lat'])
   if not c:excluded['outsideCalifornia']+=1;continue
   id=f"osm-node-{e['id']}";rows[id]={'id':id,'osmType':'node','osmId':e['id'],'osmUpdatedAt':e.get('timestamp'),'name':t.get('name')or t.get('name:en')or f"Unnamed mapped overlook — {c} ({e['id']})",'lat':e['lat'],'lng':e['lon'],'county':c,'region':'bay-area'if c in BAY else 'southern-california'if args.region=='socal'else'northern-california','tags':t,'sourceUrl':f"https://www.openstreetmap.org/node/{e['id']}"}
 timestamp=datetime.datetime.fromtimestamp(max(mtime for _,mtime in results),datetime.timezone.utc).isoformat().replace('+00:00','Z')
 result={'retrievedAt':timestamp,'dataTimestamp':None,'discoveryExtract':base,'discoveryIndexSha256':hashlib.sha256(dbf.read_bytes()).hexdigest(),'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors; regional index by Geofabrik','extractUrl':f'https://download.geofabrik.de/north-america/us/california/{args.region}.html','boundarySource':BOUNDARIES,'scope':f'Geofabrik {args.region} tourism=viewpoint point index hydrated from the OSM API in {len(groups)} small batches. Optional supplemental mapped ways. Private/no-foot-access tags excluded where present. Relations and viewpoints not tagged in OSM are not a complete inventory. Community metadata is not agency verification.','excluded':excluded,'viewpoints':sorted(rows.values(),key=lambda v:v['id'])}
 path=pathlib.Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n');temp.replace(path)
 print(json.dumps({'mapped':len(rows),'bayArea':sum(v['region']=='bay-area'for v in rows.values()),'counties':len(set(v['county']for v in rows.values())),'excluded':excluded},indent=2))
if __name__=='__main__':main()
