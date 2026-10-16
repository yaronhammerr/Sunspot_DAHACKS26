#!/usr/bin/env python3
"""Extract viewpoint nodes/ways from a downloaded OSM PBF, not private-user metadata.
Requires: Python 3 + osmium. See README data collection section.
Usage: python scripts/extract-osm-viewpoints.py extract.osm.pbf counties.geojson output.json
"""
import sys,json,datetime,pathlib,osmium,hashlib
BAY={'San Francisco','San Mateo','Santa Clara','Alameda','Contra Costa','Marin','Sonoma','Napa','Solano'}
KEEP={'name','name:en','ele','opening_hours','access','foot','wheelchair','surface','smoothness','incline','operator','website','contact:website','fee','charge','description','direction','wikidata','dog','bicycle','lit','drinking_water','toilets','bench','shelter','parking','sac_scale','trail_visibility','wheelchair:description','seasonal'}

def ring_contains(ring,x,y):
 inside=False
 for i,a in enumerate(ring):
  b=ring[i-1]
  if (a[1]>y)!=(b[1]>y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside

def polygon_contains(poly,x,y):return ring_contains(poly[0],x,y) and not any(ring_contains(h,x,y) for h in poly[1:])

def extract(pbf,boundaries,output):
 counties=[]
 for f in json.load(open(boundaries))['features']:
  if str(f['properties'].get('STATE',f.get('id','')[:2]))!='06':continue
  geom=f['geometry'];polys=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
  xs=[p[0] for poly in polys for p in poly[0]];ys=[p[1] for poly in polys for p in poly[0]]
  counties.append((f['properties']['NAME'],polys,(min(xs),min(ys),max(xs),max(ys))))
 def county(x,y):
  for name,polys,bbox in counties:
   if bbox[0]<=x<=bbox[2] and bbox[1]<=y<=bbox[3] and any(polygon_contains(poly,x,y) for poly in polys):return name
  return None
 rows=[];excluded={'restricted':0,'outsideCalifornia':0,'invalidGeometry':0};kindCounts={}
 processor=osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.TagFilter(('tourism','viewpoint')))
 for item in processor:
  tags={t.k:t.v for t in item.tags if t.k in KEEP}
  if tags.get('access') in ['private','no'] or tags.get('foot')=='no':excluded['restricted']+=1;continue
  if isinstance(item,osmium.osm.Node):
   if not item.location.valid():excluded['invalidGeometry']+=1;continue
   lat,lng=item.location.lat,item.location.lon;kind='node'
  elif isinstance(item,osmium.osm.Way):
   points=[(n.lat,n.lon) for n in item.nodes if n.location.valid()]
   if not points:excluded['invalidGeometry']+=1;continue
   lat=sum(p[0] for p in points)/len(points);lng=sum(p[1] for p in points)/len(points);kind='way'
  else:continue # Relations need multipolygon assembly; not silently counted as complete.
  c=county(lng,lat)
  if not c:excluded['outsideCalifornia']+=1;continue
  rows.append({'id':f'osm-{kind}-{item.id}','osmType':kind,'osmId':item.id,'name':tags.get('name') or tags.get('name:en') or f'Unnamed mapped overlook — {c}','lat':round(lat,7),'lng':round(lng,7),'county':c,'region':'bay-area' if c in BAY else 'northern-california','tags':tags,'sourceUrl':f'https://www.openstreetmap.org/{kind}/{item.id}'})
  kindCounts[kind]=kindCounts.get(kind,0)+1
 header=processor.header
 stamp=header.get('osmosis_replication_timestamp') or None
 result={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'dataTimestamp':stamp,'extractFilename':pathlib.Path(pbf).name,'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors; regional extract by Geofabrik','extractUrl':'https://download.geofabrik.de/north-america/us/california/norcal.html','boundarySource':'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json','scope':'OSM tourism=viewpoint nodes and ways in the Northern California extract. Relations omitted. Not a complete inventory or confirmation of public access.','excluded':excluded,'kinds':kindCounts,'viewpoints':rows}
 pathlib.Path(output).write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'total':len(rows),'bayArea':sum(v['region']=='bay-area' for v in rows),'counties':len(set(v['county'] for v in rows)),'excluded':excluded}))
if __name__=='__main__':
 if len(sys.argv)!=4:raise SystemExit(__doc__)
 extract(*sys.argv[1:])
