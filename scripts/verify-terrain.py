#!/usr/bin/env python3
"""Spot-check prepared terrain against the independent USGS point-query API.

Run with the terrain virtualenv after preparing horizons. This is a small,
repeatable sanity check, not a field survey or a validation of every horizon.
Raw point-query responses and the resulting report are checked in as evidence.
The coarse raster is deliberately compared to higher-resolution source values:
differences are retained rather than used to invent an accuracy guarantee.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode
import numpy as np
import rasterio
import requests

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'data/research/terrain-verification.json'
API = 'https://epqs.nationalmap.gov/v1/json'
IDS = ['twin-peaks', 'muir-beach-overlook', 'mount-tamalpais']


def destination(lat, lng, bearing, distance):
    lat, lng, bearing = map(math.radians, [lat, lng, bearing])
    arc = distance / 6371000
    phi = math.asin(math.sin(lat) * math.cos(arc) + math.cos(lat) * math.sin(arc) * math.cos(bearing))
    lam = lng + math.atan2(math.sin(bearing) * math.sin(arc) * math.cos(lat), math.cos(arc) - math.sin(lat) * math.sin(phi))
    return math.degrees(phi), math.degrees(lam)


def run(refresh=False):
    catalog = json.loads((ROOT / 'data/catalog.json').read_text())['viewpoints']
    existing = {} if refresh or not TARGET.exists() else {p['key']: p for p in json.loads(TARGET.read_text())['points']}
    locations = {v['id']: v for v in catalog if v['id'] in IDS}
    # Check each stored pin, the old incorrect East Peak pin, one nearby inland
    # ray maximum per location, and a mapped-ocean point. EPQS may return
    # bathymetry offshore; that must not be mistaken for sea-surface height.
    points = []
    for key, v in locations.items():
        points.append({'key': key, 'kind': 'observer', 'viewpointId': key, 'lat': v['lat'], 'lng': v['lng']})
        bearing = {'twin-peaks': 135.5, 'muir-beach-overlook': 45, 'mount-tamalpais': 270}[key]
        distance = {'twin-peaks': 55, 'muir-beach-overlook': 55, 'mount-tamalpais': 855}[key]
        lat, lng = destination(v['lat'], v['lng'], bearing, distance)
        points.append({'key': key + '-ray', 'kind': 'ray', 'viewpointId': key, 'lat': lat, 'lng': lng, 'bearing': bearing, 'distanceMeters': distance})
    points += [{'key': 'mount-tamalpais-old-pin', 'kind': 'superseded-observer', 'lat': 37.9235, 'lng': -122.5779},
               {'key': 'pacific-ocean', 'kind': 'ocean', 'lat': 37.86, 'lng': -122.8}]
    raster_file = ROOT / 'work/terrain/bay-3dep.tif'
    with rasterio.open(raster_file) as raster:
        heights, transform = raster.read(1, masked=True).filled(np.nan), raster.transform
        def sample(lat, lng):
            col, row = (~transform) * (lng, lat)
            col, row = col - .5, row - .5
            c, r = math.floor(col), math.floor(row)
            dx, dy = col-c, row-r
            z = float(heights[r, c]*(1-dx)*(1-dy) + heights[r, c+1]*dx*(1-dy)
                      + heights[r+1, c]*(1-dx)*dy + heights[r+1, c+1]*dx*dy)
            return z if math.isfinite(z) else None
        session = requests.Session()
        for point in points:
            params = {'x': point['lng'], 'y': point['lat'], 'wkid': 4326, 'units': 'Meters', 'includeDate': 'true'}
            point['sourceUrl'] = API + '?' + urlencode(params)
            cached = existing.get(point['key'], {})
            if cached.get('sourceUrl') == point['sourceUrl']:
                response, checked_at = cached['response'], cached['checkedAt']
            else:
                result = session.get(API, params=params, timeout=30)
                result.raise_for_status()
                response, checked_at = result.json(), datetime.now(timezone.utc).isoformat()
            if 'value' not in response or 'error' in response:
                raise RuntimeError(f'Invalid USGS response: {response}')
            value = float(response['value'])
            point.update(response=response, checkedAt=checked_at,
                         pointElevationMeters=value if -500 < value < 9000 else None,
                         rasterElevationMeters=sample(point['lat'], point['lng']))
            a, b = point['pointElevationMeters'], point['rasterElevationMeters']
            point['rasterMinusPointMeters'] = round(b-a, 2) if a is not None and b is not None else None
            print(point['key'], 'point:', a, 'coarse raster:', b, flush=True)
    observers = {p['viewpointId']: p for p in points if p['kind'] == 'observer'}
    for point in [p for p in points if p['kind'] == 'ray']:
        observer, distance = observers[point['viewpointId']], point['distanceMeters']
        for label, field in [('pointQuerySampleAngleDegrees', 'pointElevationMeters'), ('rasterSampleAngleDegrees', 'rasterElevationMeters')]:
            if point[field] is not None and observer[field] is not None:
                point[label] = round(math.degrees(math.atan2(point[field]-observer[field]-1.7-distance**2/(2*6371000), distance)), 3)
        point['note'] = 'Angle to this single sampled point, with Earth curvature and 1.7 metre observer height. The finer point query is not a survey of the whole ray or the true maximum horizon.'
    result = {'source': 'USGS Elevation Point Query Service', 'documentationUrl': 'https://apps.nationalmap.gov/epqs/',
              'rasterSha256': hashlib.sha256(raster_file.read_bytes()).hexdigest(), 'points': points,
              'scope': 'Three featured viewpoints, three inland ray maxima samples, one corrected pin and one ocean sample. This is a sanity check, not exhaustive validation or a measured horizon-accuracy claim.',
              'limitations': ['The exported ~89 by 111 metre raster smooths narrow summits and coastal cliffs. Its elevation can differ substantially from the finer EPQS source.',
                              'Nearby sample-angle differences of several degrees occur in these checks; no blanket sub-degree horizon accuracy or exact obstruction minute is established.',
                              'A higher-resolution point elevation does not validate terrain between sampled points or distant horizon bearings.',
                              'EPQS can report bathymetry offshore. Its seabed height must not be confused with the sea surface. This report retains the raw USGS response rather than converting it to sea level.',
                              'Viewpoint pins are approximate feature locations; buildings, vegetation, guardrails and the actual standing position are not modelled.']}
    TARGET.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Refresh official USGS point-query evidence.')
    run(parser.parse_args().refresh)
