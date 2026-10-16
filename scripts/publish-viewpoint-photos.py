#!/usr/bin/env python3
"""Publish only images explicitly approved in the contact-sheet review.
Pillow verifies decoded pixels; source images are copied without upscaling/editing.
"""
import argparse, hashlib, importlib.util, json, pathlib, shutil
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
WORK=ROOT/'work/photo-research'

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--approve',help='Comma-separated candidate indices from the CURRENT review-candidates.json');parser.add_argument('--note',default='Photo subject and source description reviewed against the named viewpoint.');parser.add_argument('--publish',action='store_true');args=parser.parse_args()
 rows=json.loads((WORK/'review-candidates.json').read_text())
 dest=WORK/'decisions.json';decisions=json.loads(dest.read_text()) if dest.exists() else {}
 if args.approve:
  for index in args.approve.split(','):
   r=rows[int(index)];key=r['id']+'|'+r['candidate']['sourceUrl']
   if 'error' in r['asset']:raise ValueError(f'Cannot approve unreadable image {index}')
   decisions[key]=dict(status='approved',subjectNote=args.note,checkedAt='2026-10-16')
  dest.write_text(json.dumps(decisions,indent=2,ensure_ascii=False)+'\n')
  print('Approved selections:',len(decisions),flush=True)
 if not args.publish:return
 bykey={r['id']+'|'+r['candidate']['sourceUrl']:r for r in rows}
 # Persist candidate details with each decision so later discovery passes cannot
 # drop a previous approval when the top-ranked results change.
 saved=WORK/'approved-candidates.json';approved=json.loads(saved.read_text()) if saved.exists() else {}
 for key,d in decisions.items():
  if d['status']=='approved' and key in bykey:approved[key]=bykey[key]
 saved.write_text(json.dumps(approved,indent=2,ensure_ascii=False)+'\n')
 manifest=dict(schemaVersion=1,checkedAt='2026-10-16',policy=dict(minLongEdge=1600,minShortEdge=900,minPanoramaWidth=1920,minPanoramaHeight=400,maxPixels=16000000,maxBytes=12000000,upscaled=False,subjectReviewRequired=True),viewpoints={})
 out=ROOT/'public/viewpoints/photos';out.mkdir(parents=True,exist_ok=True)
 keep=set()
 # Existing published approvals live in the repository. Preserve them even on a
 # fresh checkout that has no ignored review cache; new selections add to them.
 prior_path=ROOT/'data/viewpoint-photos.json'
 prior=json.loads(prior_path.read_text()) if prior_path.exists() else {}
 for id,v in prior.get('viewpoints',{}).items():
  photos=[]
  for p in v['photos']:
   decision=decisions.get(id+'|'+p['sourceUrl'],{})
   if decision.get('status')=='rejected':continue
   file=ROOT/'public'/p['url'].lstrip('/')
   if hashlib.sha256(file.read_bytes()).hexdigest()!=p['sha256']:raise ValueError('Published image bytes changed '+p['url'])
   photos.append(p);keep.add(file.name)
  if photos:manifest['viewpoints'][id]=dict(photos=photos)
 for key,r in approved.items():
  d=decisions[key]
  if d['status']!='approved':continue
  c=r['candidate'];a=r['asset'];source=ROOT/a['path']
  with Image.open(source) as image:
   image.load();w,h=image.size;extension={'JPEG':'jpg','PNG':'png','WEBP':'webp'}.get(image.format)
  valid=lambda w,h:(max(w,h)>=1600 and min(w,h)>=900) or (w>=1920 and h>=400 and w/h>=3)
  if not extension or not valid(w,h) or not valid(c['width'],c['height']) or w*h>16000000 or source.stat().st_size>12000000:raise ValueError('Unqualified image '+key)
  digest=hashlib.sha256(source.read_bytes()).hexdigest()
  if digest!=a['sha256']:raise ValueError('Image bytes changed '+key)
  name=digest[:20]+'.'+extension
  shutil.copyfile(source,out/name);keep.add(name)
  photo=dict(url='/viewpoints/photos/'+name,width=w,height=h,sourceWidth=c['width'],sourceHeight=c['height'],originalUrl=c['originalUrl'],author=c['author'],license=c['license'],licenseUrl=c['licenseUrl'],sourceUrl=c['sourceUrl'],caption=c['title'].removeprefix('File:'),sha256=digest,bytes=source.stat().st_size,verification=dict(status='verified',checkedAt=d['checkedAt'],subjectNote=d['subjectNote']))
  if w/h>=3 or h>w:photo['displayFit']='contain'
  photos=manifest['viewpoints'].setdefault(r['id'],dict(photos=[]))['photos']
  photos[:]=[p for p in photos if p['sourceUrl']!=photo['sourceUrl']]
  photos.append(photo)
 # Only remove files owned by this pipeline and no longer referenced.
 keep={pathlib.PurePosixPath(p['url']).name for v in manifest['viewpoints'].values() for p in v['photos']}
 for file in out.iterdir():
  if file.is_file() and file.name not in keep and len(file.stem)==20 and all(ch in '0123456789abcdef' for ch in file.stem):file.unlink()
 (ROOT/'data/viewpoint-photos.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps(dict(viewpoints=len(manifest['viewpoints']),photos=sum(len(v['photos']) for v in manifest['viewpoints'].values()),uniqueFiles=len(keep)),indent=2))

if __name__=='__main__':main()
