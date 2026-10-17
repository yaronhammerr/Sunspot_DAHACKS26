#!/usr/bin/env python3
"""Rebuild offline Bay Area horizons from USGS 3DEP, never from made-up heights.

Setup: python3 -m venv work/terrain/venv
       work/terrain/venv/bin/pip install -r scripts/terrain-requirements.txt
Run:   work/terrain/venv/bin/python scripts/prepare-terrain.py
Raw downloads stay in ignored work/terrain; only compact profiles are published.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import rasterio
from rasterio.features import rasterize
import requests

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work/terrain'
SOURCE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
OCEAN = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ocean.geojson'


def download():
    WORK.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    if not (WORK / 'bay-3dep.tif').exists():
        params = {'f': 'json', 'bbox': '-123.7,36.2,-120.7,39.4', 'bboxSR': 4326, 'imageSR': 4326,
                  'size': '3000,4000', 'format': 'tiff', 'pixelType': 'F32',
                  'interpolation': 'RSP_BilinearInterpolation', 'renderingRule': json.dumps({'rasterFunction': 'None'})}
        result = session.get(SOURCE + '/exportImage', params=params, timeout=90)
        result.raise_for_status()
        metadata = result.json()
        if 'href' not in metadata:
            raise RuntimeError(f'USGS export failed: {metadata}')
        data = session.get(metadata['href'], timeout=180)
        data.raise_for_status()
        (WORK / 'bay-3dep.tif').write_bytes(data.content)
        (WORK / 'export.json').write_text(json.dumps(metadata, indent=2))
    if not (WORK / 'ocean.geojson').exists():
        response = session.get(OCEAN, timeout=90)
        response.raise_for_status()
        (WORK / 'ocean.geojson').write_bytes(response.content)


def build(only=None):
    viewpoints = json.loads((ROOT / 'data/catalog.json').read_text())['viewpoints']
    selected = set(only) if only else None
    known_ids = {v['id'] for v in viewpoints}
    if selected and not selected.issubset(known_ids):
        raise ValueError(f'Unknown catalog IDs: {sorted(selected - known_ids)}')
    download()
    subprocess.run([sys.executable, str(ROOT / 'scripts/fetch-terrain-ground.py')], check=True)
    native_ground = json.loads((WORK / 'ground-samples.json').read_text())['samples']
    with rasterio.open(WORK / 'bay-3dep.tif') as raster:
        heights = raster.read(1, masked=True).filled(np.nan).astype('float64')
        heights[(heights < -500) | (heights > 9000)] = np.nan
        transform, bounds = raster.transform, raster.bounds
        shapes = json.loads((WORK / 'ocean.geojson').read_text())['features']
        ocean = rasterize(((f['geometry'], 1) for f in shapes), out_shape=heights.shape, transform=transform, fill=0, dtype='uint8')
        # Only explicit mapped OCEAN can fill 3DEP no-data as sea level. Never
        # assume that missing land or inland lake pixels are zero elevation.
        ocean_mask = (np.isnan(heights) | (heights < 0)) & (ocean == 1)
        ocean_fills = int(np.count_nonzero(ocean_mask))
        heights[ocean_mask] = 0
        rows, cols = heights.shape

    def sample(lat, lng):
        x = (lng - transform.c) / transform.a - .5
        y = (lat - transform.f) / transform.e - .5
        c, r = np.floor(x).astype(int), np.floor(y).astype(int)
        valid = (r >= 0) & (r < rows - 1) & (c >= 0) & (c < cols - 1)
        c, r = np.clip(c, 0, cols - 2), np.clip(r, 0, rows - 2)
        dx, dy = x - c, y - r
        z = (heights[r, c] * (1-dx) * (1-dy) + heights[r, c+1] * dx * (1-dy)
             + heights[r+1, c] * (1-dx) * dy + heights[r+1, c+1] * dx * dy)
        return np.where(valid, z, np.nan)

    raster_sha256 = hashlib.sha256((WORK / 'bay-3dep.tif').read_bytes()).hexdigest()
    target = ROOT / 'public/terrain/horizons.json'
    distances = np.concatenate((np.arange(55, 2000, 40), np.arange(2000, 10000, 80), np.arange(10000, 60001, 110)))
    bearings = np.deg2rad(np.arange(0, 360, .5))[:, None]
    arc = distances[None, :] / 6371000
    profiles, unavailable = {}, {}
    if selected:
        previous = json.loads(target.read_text())
        expected = {'source': SOURCE, 'rasterSha256': raster_sha256, 'bearingStep': 1,
                    'observerHeightMeters': 1.7, 'maxDistanceMeters': 60000}
        if any(previous.get(key) != value for key, value in expected.items()):
            raise ValueError('Incremental preparation requires the same source raster and horizon settings')
        profiles = {key: value for key, value in previous['profiles'].items() if key in known_ids}
        unavailable = {key: value for key, value in previous['unavailable'].items() if key in known_ids}
        for place in viewpoints:
            old = profiles.get(place['id'])
            if old and place['id'] not in selected and (old.get('lat') != place['lat'] or old.get('lng') != place['lng']):
                raise ValueError(f'Unselected observation pin changed: {place["id"]}')
    for i, v in enumerate(viewpoints):
        if selected and v['id'] not in selected:
            if v['id'] not in profiles and v['id'] not in unavailable:
                unavailable[v['id']] = 'Terrain profile not yet prepared for this catalog pin'
            continue
        profiles.pop(v['id'], None)
        unavailable.pop(v['id'], None)
        # First release intentionally targets the supported Bay Area region.
        if not (36.8 <= v['lat'] <= 38.9 and -123.2 <= v['lng'] <= -121.1):
            unavailable[v['id']] = 'Outside prepared Bay Area terrain coverage'
            continue
        native = native_ground.get(v['id'], {})
        ground = native.get('elevationMeters')
        if ground is None or not np.isfinite(ground) or native.get('lat') != v['lat'] or native.get('lng') != v['lng']:
            unavailable[v['id']] = 'Native ground elevation missing or observation pin changed'
            continue
        lat, lng = np.deg2rad(v['lat']), np.deg2rad(v['lng'])
        ray_lat = np.arcsin(np.sin(lat) * np.cos(arc) + np.cos(lat) * np.sin(arc) * np.cos(bearings))
        ray_lng = lng + np.arctan2(np.sin(bearings) * np.sin(arc) * np.cos(lat), np.cos(arc) - np.sin(lat) * np.sin(ray_lat))
        z = sample(np.rad2deg(ray_lat), np.rad2deg(ray_lng))
        # Geometric Earth curvature, k=0 terrestrial refraction. Solar atmospheric
        # refraction is supplied once by SunCalc in the application.
        angles = np.rad2deg(np.arctan2(z - ground - 1.7 - distances[None, :] ** 2 / (2 * 6371000), distances[None, :]))
        complete = np.isfinite(z).all(axis=1)
        maximum = np.max(np.where(np.isfinite(angles), angles, -90), axis=1)
        # Half-degree rays become a conservative one-degree angular envelope.
        horizon = [round(float(max(maximum[j*2], maximum[j*2+1])), 2) if complete[j*2] and complete[j*2+1] else None for j in range(360)]
        profiles[v['id']] = {'elevation': round(ground, 1), 'lat': v['lat'], 'lng': v['lng'],
                              'groundSource': {'sourceUrl': native['sourceUrl'], 'rasterId': native['rasterId'], 'nativeResolution': native['nativeResolution'], 'checkedAt': native['checkedAt']}, 'angles': horizon,
                              'coverage': 'complete' if all(a is not None for a in horizon) else 'partial',
                              'validFraction': round(sum(a is not None for a in horizon) / 360, 4)}
        if i % 50 == 0:
            print(f'Prepared {len(profiles)} profiles', flush=True)
    metadata = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'source': SOURCE,
                'resolutionMeters': 112, 'rasterPixelDegrees': [abs(transform.a), abs(transform.e)], 'bearingStep': 1,
                'observerHeightMeters': 1.7, 'maxDistanceMeters': 60000,
                'refraction': 'Geometric terrain with Earth curvature; no terrestrial refraction. SunCalc apparent solar altitude includes astronomical refraction once; upper solar limb +0.266 degrees.',
                'bounds': list(bounds), 'profiles': profiles, 'unavailable': unavailable,
                'method': 'Observer ground from native USGS getSamples at each exact pin (variable source resolution). Rays use USGS 3DEP mosaic exported as bare F32 elevation, bilinear ~89x111m raster; half-degree rays stored as one-degree maxima; radial steps 40m to 2km, 80m to 10km, 110m to 60km. Nearby sub-grid ridges and objects are unresolved.',
                'water': {'maskSource': OCEAN, 'maskLicense': 'Natural Earth public domain', 'filledOceanPixels': ocean_fills, 'note': 'Only mapped ocean fills missing or negative offshore DEM as sea surface zero; remaining missing land rays stay null. Positive coastal terrain is retained. Coastline and standing-position errors remain possible.'},
                'rasterSha256': raster_sha256,
                'coverage': {'catalog': len(viewpoints), 'profiles': len(profiles), 'complete': sum(p['coverage'] == 'complete' for p in profiles.values()), 'unavailable': len(unavailable)}}
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(metadata, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(target)
    print(json.dumps(metadata['coverage']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', help='Prepare selected catalog IDs while preserving other profiles from the same source raster.')
    build(parser.parse_args().only)
