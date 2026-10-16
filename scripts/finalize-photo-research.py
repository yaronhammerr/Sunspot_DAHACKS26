#!/usr/bin/env python3
"""Reconcile cached spatial/name results and write a complete research audit.
Run after collectors finish. No network requests or photo approvals happen here.
"""
import collections, json, math, pathlib, re
ROOT=pathlib.Path(__file__).resolve().parent.parent
WORK=ROOT/'work/photo-research'

def main():
 locations={};mime_types={}
 for path in (WORK/'api').glob('*.json'):
  data=json.loads(path.read_text())
  for page in data.get('query',{}).get('pages',{}).values():
   for info in page.get('imageinfo',[]):mime_types[page.get('pageid')]=info.get('mime')
  for p in data.get('query',{}).get('geosearch',[]):locations[p['pageid']]=dict(lat=p['lat'],lng=p['lon'])
 inventory=json.loads((WORK/'inventory.json').read_text())['viewpoints']
 audit=[];retry=[]
 for v in inventory:
  path=WORK/'views'/f"{v['id']}.json"
  data=json.loads(path.read_text()) if path.exists() else dict(id=v['id'],name=v['name'],lat=v['lat'],lng=v['lng'],county=v['county'],candidates=[],searches=[])
  unique={}
  for c in data['candidates']:
   c['mime']=c.get('mime') or mime_types.get(c['pageId'])
   w,h=c['width'],c['height']
   size_ok=(max(w,h)>=1600 and min(w,h)>=900) or (w>=1920 and h>=400 and w/h>=3)
   c['qualified']=bool(size_ok and c['mime'] in ['image/jpeg','image/png','image/webp'] and c['author'] and re.search('CC BY|CC0|Public domain',c['license'],re.I) and not re.search(r'\bNC\b|\bND\b',c['license'],re.I))
   loc=locations.get(c['pageId'])
   if loc and (not c.get('gpsLat') or not c.get('gpsLng')):
    c['gpsLat']=str(loc['lat']);c['gpsLng']=str(loc['lng']);c['coordinatesSource']='Wikimedia Commons spatial index'
   key=c['sourceUrl']
   if key in unique:
    old=unique[key]
    if not old.get('gpsLat') and c.get('gpsLat'):old['gpsLat']=c['gpsLat'];old['gpsLng']=c['gpsLng']
    old['discoveries']=sorted(set(old.get('discoveries',[old['discovery']]))|set(c.get('discoveries',[c['discovery']])))
   else:unique[key]=c
  data['candidates']=list(unique.values());path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
  methods={s['method'] for s in data['searches']}
  missing=[]
  if 'coordinates' not in methods:missing.append('coordinates')
  if not v['name'].startswith('Unnamed mapped') and 'name' not in methods:missing.append('name')
  if missing:retry.append(dict(id=v['id'],missing=missing))
  audit.append(dict(id=v['id'],name=v['name'],county=v['county'],checkedAt='2026-10-16',searches=data['searches'],candidatesFound=len(data['candidates']),resolutionAndLicenseQualified=sum(c['qualified'] for c in data['candidates']),missingSearches=missing))
 report=dict(checkedAt='2026-10-16',scope='All 1,501 existing discovery entries, named and unnamed; primary media source: Wikimedia Commons.',radiusMeters=150,photoMinimum=dict(longEdge=1600,shortEdge=900,panoramaWidth=1920,panoramaHeight=400),summary=dict(inventory=len(inventory),coordinateSearches=sum(any(q['method']=='coordinates' for q in a['searches']) for a in audit),namedSearches=sum(any(q['method']=='name' for q in a['searches']) for a in audit),withCandidates=sum(a['resolutionAndLicenseQualified']>0 for a in audit),incomplete=len(retry)),viewpoints=audit)
 (ROOT/'data/research/photo-audit.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
 (WORK/'retry.json').write_text(json.dumps(retry,indent=2)+'\n')
 print(json.dumps(report['summary'],indent=2))

if __name__=='__main__':main()
