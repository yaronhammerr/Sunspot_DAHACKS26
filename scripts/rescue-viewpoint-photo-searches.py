#!/usr/bin/env python3
"""Additional disambiguated searches for reviewed destinations missing previews."""
import importlib.util,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('research',ROOT/'scripts/research-viewpoint-photos.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
QUERIES={
 'sentinel-dome':'"Sentinel Dome" panorama Yosemite',
 'lassen-peak':'"Lassen Peak" summit panorama',
 'osm-node-2360047421':'"Artist Point" Yosemite',
 'osm-node-1751223614':'"Crescent Meadow" Sequoia landscape',
 'osm-node-8376960336':'"Dantes View" panorama',
 'osm-way-28824850':'"Coit Tower" panorama',
 'briones-ridge':'"Briones Regional Park"', 'del-valle-shore':'"Del Valle Regional Park"',
 'las-trampas-circuit':'"Las Trampas Regional Wilderness"', 'monte-bello-vista':'"Monte Bello Open Space Preserve" view',
 'purisima-ridge':'"Purisima Creek Redwoods"', 'rancho-high-meadow':'"Rancho San Antonio Open Space Preserve" view',
 'tilden-meadows':'"Tilden Regional Park" landscape', 'wildcat-canyon-ridge':'"Wildcat Canyon Regional Park"',
 'hill-88':'"Hill 88" Marin', 'gunsight-rock':'"Gunsight Rock" Sonoma', 'westwood-hills':'"Westwood Hills" Napa',
 'coal-creek-vista':'"Coal Creek Open Space Preserve"', 'coyote-valley-arrowhead':'"Coyote Valley Open Space Preserve"',
 'castle-rock-goat':'"Castle Rock State Park" "Goat"', 'jack-london-vistas':'"Jack London State Historic Park" Sonoma',
 'angel-island-livermore':'"Angel Island" "summit"', 'big-basin-ocean-view':'"Big Basin" "Ocean View"',
 'castle-crags-vista':'"Castle Crags" "Vista"', 'carquinez-ridge':'"Carquinez Strait Regional Shoreline"',
 'pleasanton-ridge':'"Pleasanton Ridge Regional Park"', 'sierra-vista-overlook':'"Sierra Vista Open Space Preserve"',
 'bald-mountain-sierra':'"Sierra Azul" "Bald Mountain"', 'picchetti-reservoir-view':'"Picchetti" "reservoir"',
 'roberts-ridge-loop':'"Roberts Regional Recreation Area"', 'sue-meg-headlands':'"Sue-meg" coast',
}

def main():
 inv={v['id']:v for v in json.loads((r.CACHE/'inventory.json').read_text())['viewpoints']}
 published=json.loads((ROOT/'data/viewpoint-photos.json').read_text())['viewpoints']
 for id,q in QUERIES.items():
  if id in published:continue
  path=r.CACHE/'views'/f'{id}.json';v=inv[id]
  old=json.loads(path.read_text()) if path.exists() else dict(id=id,name=v['name'],lat=v['lat'],lng=v['lng'],county=v['county'],candidates=[],searches=[])
  if any(s['query']==q for s in old['searches']):continue
  try:
   data=r.api(dict(generator='search',gsrsearch=q+' filetype:bitmap',gsrnamespace='6',gsrlimit='20',prop='imageinfo',iiprop='url|size|mime|extmetadata',iiurlwidth='1920',iiextmetadatafilter=r.META))
   candidates=r.parse(data,'disambiguated-name',q)
   # Read again after the network operation to retain concurrent spatial work.
   if path.exists():old=json.loads(path.read_text())
   unique={c['sourceUrl']:c for c in old['candidates']}
   for c in candidates:unique.setdefault(c['sourceUrl'],c)
   old['candidates']=list(unique.values());old['searches'].append(dict(method='disambiguated-name',query=q,status='searched',returned=len(candidates)))
   path.write_text(json.dumps(old,indent=2,ensure_ascii=False)+'\n')
   print(id,len(candidates),flush=True)
  except Exception as e:print(id,str(e),flush=True)

if __name__=='__main__':main()
