#!/usr/bin/env python3
"""Prepare actual image files and contact sheets; nothing is published here.
Requires Pillow only for decoding image dimensions and building review sheets.
"""
import argparse, concurrent.futures, hashlib, html, importlib.util, json, math, pathlib, re, subprocess, textwrap, time
from PIL import Image, ImageDraw, ImageFont
ROOT=pathlib.Path(__file__).resolve().parent.parent
WORK=ROOT/'work/photo-research'
spec=importlib.util.spec_from_file_location('research', ROOT/'scripts/research-viewpoint-photos.py');research=importlib.util.module_from_spec(spec);spec.loader.exec_module(research)

BAD=re.compile(r'\b(map|diagram|logo|portrait|selfie|lichen|mushroom|butterfly|insect|lizard|salamander|frog|squirrel|flower|flowers|warbler|sparrow|hummingbird|moth|beetle|poison oak|buttercup|fritillary|plaque|signage|headstone|drawings|oil on canvas|painting|t-shirt|tshirt|calypte|bombus|quercus|coyote scat|snake|snakes|quail|fox|deer|elk|spider|bee|bees|moth|moths|kinglet|millipede|centipede|whitebark pine|sperm whale|tremella|fresnel lens|lichen|gull)\b',re.I)
VISTA=re.compile(r'view|panoram|vista|overlook|skyline|sunset|coast|summit|landscape|valley|ocean|bay|mountain|lake|cliff|ridge|peak',re.I)

def distance(v,c):
 try:
  a,b=float(c['gpsLat']),float(c['gpsLng'])
  return math.hypot((v['lat']-a)*111320,(v['lng']-b)*111320*math.cos(v['lat']*math.pi/180))
 except (TypeError,ValueError):return None

def rank(v,c):
 t=c['title']+' '+c['description']+' '+c['categories']
 d=distance(v,c);score=0
 if VISTA.search(t):score+=12
 if 'panoram' in t.lower():score+=8
 if BAD.search(c['title']+' '+c['description']):score-=50
 if c['width']/c['height']>=1.3:score+=5
 if c['width']/c['height']>4:score-=4
 if d is not None and d<=150:score+=20-d/20
 if c['discovery']=='existing':score+=18
 if c['discovery']=='name':score+=3
 return score

def obtain(c,cached_only=False):
 key=hashlib.sha256(c['sourceUrl'].encode()).hexdigest()[:20]
 path=WORK/'images'/f'{key}.jpg';path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():
  if cached_only:return dict(error='Not downloaded yet',key=key)
  # Ask Commons for a sufficiently tall panorama rather than enlarging pixels.
  ratio=c['width']/c['height']
  # Very wide panoramas need more horizontal pixels to retain 400 native
  # vertical pixels. Keep their full frame within the decoded-pixel budget.
  width=min(12000,max(1920,math.ceil((450 if ratio>=3 else 920)*ratio)))
  width=min(c['width'],width)
  url=c['previewUrl']
  if width!=1920:
   data=research.api(dict(titles=c['title'],prop='imageinfo',iiprop='url|size',iiurlwidth=str(width)))
   info=next(iter(data['query']['pages'].values()))['imageinfo'][0]
   url=info.get('thumburl',info['url']).split('?')[0]
  tmp=path.with_suffix('.part')
  result=subprocess.run(['curl','-fLsS','--retry','2','--retry-delay','1','--max-time','50','-A',research.AGENT,url,'-o',str(tmp)],capture_output=True,text=True)
  if result.returncode:
   result=subprocess.run(['curl','-fLsS','--max-time','35','-A',research.AGENT,c['originalUrl'],'-o',str(tmp)],capture_output=True,text=True)
   if result.returncode:
    tmp.unlink(missing_ok=True);return dict(error=result.stderr[:180],key=key)
  tmp.replace(path)
 try:
  with Image.open(path) as im:
   im.load();w,h=im.size;fmt=im.format
  resolution_ok=(max(w,h)>=1600 and min(w,h)>=900) or (w>=1920 and h>=400 and w/h>=3)
  if not resolution_ok or w*h>16000000 or path.stat().st_size>12000000:
   if cached_only:return dict(error='Cached image needs a different thumbnail size',key=key)
   ratio=c['width']/c['height']
   width=min(c['width'],12000,max(1920,math.ceil((450 if ratio>=3 else 920)*ratio)))
   data=research.api(dict(titles=c['title'],prop='imageinfo',iiprop='url|size',iiurlwidth=str(width)))
   info=next(iter(data['query']['pages'].values()))['imageinfo'][0]
   fallback=info.get('thumburl',info['url']).split('?')[0]
   result=subprocess.run(['curl','-fLsS','--max-time','35','-A',research.AGENT,fallback,'-o',str(path)],capture_output=True,text=True)
   if result.returncode:return dict(error=result.stderr[:180],key=key)
   with Image.open(path) as im:
    im.load();w,h=im.size;fmt=im.format
   if not ((max(w,h)>=1600 and min(w,h)>=900) or (w>=1920 and h>=400 and w/h>=3)):return dict(error=f'Actual asset is only {w}x{h}',key=key)
  if w*h>16000000 or path.stat().st_size>12000000:return dict(error='Decoded image exceeds the mobile preview memory/download limit',key=key)
  return dict(key=key,path=str(path.relative_to(ROOT)),width=w,height=h,format=fmt,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)
 except Exception as e:
  return dict(error=str(e),key=key)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--pending-only',action='store_true');parser.add_argument('--cached-only',action='store_true',help='Prepare available cached images without network requests');args=parser.parse_args()
 published=json.loads((ROOT/'data/viewpoint-photos.json').read_text())['viewpoints'] if (ROOT/'data/viewpoint-photos.json').exists() else {}
 inventory=json.loads((WORK/'inventory.json').read_text())['viewpoints'];lookup={v['id']:v for v in inventory}
 rows=[]
 for p in (WORK/'views').glob('*.json'):
  data=json.loads(p.read_text());v=lookup[data['id']]
  if args.pending_only and v['id'] in published:continue
  cs=sorted([c for c in data['candidates'] if not re.search(r'AI.generated|Midjourney|Stable Diffusion|DALL.E|synthetic image', c['title']+' '+c['description']+' '+c['categories'],re.I) and c['qualified']],key=lambda c:rank(v,c),reverse=True)
  if v['name'].startswith('Unnamed mapped'):
   cs=[c for c in cs if distance(v,c) is not None and distance(v,c)<=100 and not BAD.search(c['title']+' '+c['description'])]
  else:cs=[c for c in cs if not BAD.search(c['title']+' '+c['description']) and (distance(v,c) is None or distance(v,c)<=6000)]
  for c in cs[:2]:rows.append(dict(id=v['id'],name=v['name'],county=v['county'],lat=v['lat'],lng=v['lng'],candidate=c,distanceMeters=None if distance(v,c) is None else round(distance(v,c)),rank=rank(v,c)))
 rows.sort(key=lambda r:(lookup[r['id']]['region']!='bay-area',lookup[r['id']]['visit']['reviewStatus']!='official-source-reviewed',r['name'].startswith('Unnamed mapped'),r['name'],-r['rank']))
 existing_path=WORK/'review-candidates.json';existing=json.loads(existing_path.read_text()) if existing_path.exists() else []
 def reusable(a):
  w,h=a.get('width',0),a.get('height',0)
  return 'error' not in a and w*h<=16000000 and a.get('bytes',0)<=12000000 and ((max(w,h)>=1600 and min(w,h)>=900) or (w>=1920 and h>=400 and w/h>=3))
 done={r['candidate']['sourceUrl']:r['asset'] for r in existing if r.get('asset') and reusable(r['asset'])}
 needed={r['candidate']['sourceUrl']:r['candidate'] for r in rows if r['candidate']['sourceUrl'] not in done}
 print(f'Preparing {len(rows)} candidates for {len(set(r["id"] for r in rows))} spots; checking {len(needed)} image assets'+(' (cached only)' if args.cached_only else ''),flush=True)
 # Media downloads use a small pool; Commons API metadata is separately capped
 # at two requests by research.api. Save progress as downloads finish.
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  jobs={pool.submit(obtain,c,args.cached_only):source for source,c in needed.items()}
  completed=0
  for job in concurrent.futures.as_completed(jobs):
   source=jobs[job]
   try:done[source]=job.result()
   except Exception as e:done[source]=dict(error=str(e))
   completed+=1
   if completed%25==0:print(f'Checked {completed}/{len(needed)} remaining candidates',flush=True)
 for r in rows:r['asset']=done[r['candidate']['sourceUrl']]
 existing_path.write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n')
 fontpath='/System/Library/Fonts/Supplemental/Arial.ttf'
 font=ImageFont.truetype(fontpath,13);small=ImageFont.truetype(fontpath,11)
 out=WORK/'sheets';out.mkdir(exist_ok=True)
 for old in out.glob('*.jpg'):
  if old.stem.isdigit():old.unlink()
 for offset in range(0,len(rows),24):
  group=rows[offset:offset+24];sheet=Image.new('RGB',(1440,math.ceil(len(group)/4)*253),'#faf8f4');draw=ImageDraw.Draw(sheet)
  for n,r in enumerate(group):
   x=(n%4)*360;y=(n//4)*253;c=r['candidate'];a=r['asset'];number=offset+n
   if 'error' not in a:
    with Image.open(ROOT/a['path']) as im:
     im.thumbnail((352,174));sheet.paste(im,(x+(360-im.width)//2,y))
   text=f'{number}: {r["name"]}'
   for k,line in enumerate(textwrap.wrap(text,49)[:2]):draw.text((x+5,y+176+k*15),line,fill='#392115',font=font)
   subtitle=f'{r["county"]} | {r["distanceMeters"]}m | {a.get("width",0)}x{a.get("height",0)}'
   draw.text((x+5,y+209),subtitle,fill='#647460',font=small)
   title=html.unescape(c['title'].replace('File:',''))
   draw.text((x+5,y+225),title[:53],fill='#82766e',font=small)
  sheet.save(out/f'{offset//24:03}.jpg',quality=90)
 print(f'Review sheets: {len(range(0,len(rows),24))}; successful assets: {sum("error" not in r["asset"] for r in rows)}',flush=True)

if __name__=='__main__':main()
