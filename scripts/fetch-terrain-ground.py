#!/usr/bin/env python3
"""Cache native USGS 3DEP observer elevations for supported catalog pins.

Run: work/terrain/venv/bin/python scripts/fetch-terrain-ground.py
Only the preparation cache is written. This does not regenerate horizons.
Requests use native service resolution, not the coarse regional export.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import time
import requests

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work/terrain'
TARGET = WORK / 'ground-samples.json'
SOURCE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples'
DOCS = 'https://developers.arcgis.com/rest/services-reference/enterprise/get-samples/'
PARAMETERS = {'f': 'json', 'geometryType': 'esriGeometryMultipoint', 'returnFirstValueOnly': 'true',
              'interpolation': 'RSP_BilinearInterpolation', 'outFields': 'Name,LowPS,HighPS,AcquisitionDate'}


def fetch_batch(batch):
    geometry = {'points': [[v['lng'], v['lat']] for v in batch], 'spatialReference': {'wkid': 4326}}
    params = {**PARAMETERS, 'geometry': json.dumps(geometry, separators=(',', ':'))}
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    cache = WORK / 'ground-batches' / (key + '.json')
    if cache.exists():
        record = json.loads(cache.read_text())
    else:
        for attempt in range(2):
            try:
                response = requests.get(SOURCE, params=params, timeout=(10, 45))
                response.raise_for_status()
                data = response.json()
                if 'error' in data or not isinstance(data.get('samples'), list):
                    raise RuntimeError(f'USGS getSamples failed: {data}')
                record = {'sourceUrl': response.url, 'checkedAt': datetime.now(timezone.utc).isoformat(),
                          'request': params, 'response': data}
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
                break
            except (requests.RequestException, ValueError, RuntimeError):
                if attempt == 1:
                    raise
                time.sleep(1)
    indexed = {}
    for sample in record['response']['samples']:
        location_id = sample.get('locationId')
        if not isinstance(location_id, int) or not 0 <= location_id < len(batch) or location_id in indexed:
            raise RuntimeError('Ambiguous or invalid USGS sample locationId')
        place, point = batch[location_id], sample.get('location', {})
        if (point.get('spatialReference', {}).get('wkid') != 4326
                or abs(point.get('x', float('inf')) - place['lng']) > 1e-8
                or abs(point.get('y', float('inf')) - place['lat']) > 1e-8):
            raise RuntimeError(f'USGS coordinate mismatch for {place["id"]}')
        try:
            elevation = float(sample['value'])
            resolution = float(sample['resolution'])
            if not math.isfinite(elevation) or not -500 < elevation < 9000 or not 0 < resolution < 1000:
                raise ValueError('Out-of-range source value or resolution')
        except (KeyError, ValueError, TypeError):
            indexed[location_id] = {'id': place['id'], 'lat': place['lat'], 'lng': place['lng'],
                                    'elevationMeters': None, 'reason': 'USGS sample is no-data or invalid',
                                    'rawSample': sample, 'checkedAt': record['checkedAt'], 'sourceUrl': record['sourceUrl']}
            continue
        indexed[location_id] = {'id': place['id'], 'lat': place['lat'], 'lng': place['lng'],
                                'elevationMeters': elevation, 'nativeResolution': resolution,
                                'rasterId': sample['rasterId'], 'attributes': sample.get('attributes', {}),
                                'checkedAt': record['checkedAt'], 'sourceUrl': record['sourceUrl']}
    for index, place in enumerate(batch):
        if index not in indexed:
            indexed[index] = {'id': place['id'], 'lat': place['lat'], 'lng': place['lng'],
                              'elevationMeters': None, 'reason': 'USGS returned no sample for this pin',
                              'checkedAt': record['checkedAt'], 'sourceUrl': record['sourceUrl']}
    return [indexed[i] for i in range(len(batch))]


def run(refresh=False):
    places = [v for v in json.loads((ROOT / 'data/catalog.json').read_text())['viewpoints']
              if 36.8 <= v['lat'] <= 38.9 and -123.2 <= v['lng'] <= -121.1]
    document = {} if refresh or not TARGET.exists() else json.loads(TARGET.read_text())
    previous = document.get('samples', {}) if document.get('version') == 2 and document.get('source') == SOURCE and document.get('parameters') == PARAMETERS else {}
    samples = {v['id']: previous[v['id']] for v in places if v['id'] in previous
               and previous[v['id']].get('lat') == v['lat'] and previous[v['id']].get('lng') == v['lng']
               and previous[v['id']].get('elevationMeters') is not None}
    missing = [v for v in places if v['id'] not in samples]
    batches = [missing[i:i+40] for i in range(0, len(missing), 40)]
    if refresh:
        # Batch filenames are request hashes, so explicit refresh also removes
        # just the raw batch responses used by this helper.
        for path in (WORK / 'ground-batches').glob('*.json'):
            path.unlink()
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(fetch_batch, batch) for batch in batches]
        for index, future in enumerate(as_completed(futures), 1):
            for sample in future.result():
                samples[sample['id']] = sample
            print(f'Native ground batch {index}/{len(batches)} complete; {len(samples)}/{len(places)} pins cached', flush=True)
    ordered = {v['id']: samples[v['id']] for v in places}
    result = {'version': 2, 'source': SOURCE, 'documentationUrl': DOCS,
              'parameters': PARAMETERS, 'geometrySpatialReference': 4326, 'units': 'metres',
              'method': 'Native-resolution bare-earth source samples with bilinear interpolation; service pixel size defaults to one metre. Returned nativeResolution is in the individual source raster spatial reference units, not necessarily metres. Each source resolution and raster ID is retained. No invented ground elevations or no-data-to-zero conversion.',
              'limitations': 'Pin location, source DEM age and standing position remain uncertain. Native observer elevations do not refine the coarse regional ray raster.',
              'count': len(ordered), 'available': sum(v['elevationMeters'] is not None for v in ordered.values()),
              'samples': ordered}
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(f'Saved {TARGET.relative_to(ROOT)}: {result["available"]}/{result["count"]} native elevations', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Refresh native samples from USGS.')
    run(parser.parse_args().refresh)
