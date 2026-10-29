import os
import math
import hashlib
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import requests
from django.core.cache import cache

HOURLY = 'wind_speed_10m,rain,showers,snowfall'
UNITS = ('mph', 'mm', 'cm')


class ProviderError(Exception):
    pass


def directions(origin, destination, departure_iso):
    token = os.getenv('MAPBOX_ACCESS_TOKEN')
    if not token:
        raise ProviderError('MAPBOX_ACCESS_TOKEN is missing in backend/.env')
    pair = f'{origin[0]},{origin[1]};{destination[0]},{destination[1]}'
    url = f'https://api.mapbox.com/directions/v5/mapbox/driving/{pair}'
    params = {'access_token': token, 'alternatives': 'true', 'geometries': 'geojson', 'overview': 'full', 'annotations': 'distance,duration', 'steps': 'false', 'depart_at': departure_iso}
    try:
        response = requests.get(url, params=params, timeout=(5, 25))
        data = response.json()
    except requests.Timeout as error:
        raise ProviderError('Mapbox Directions timed out. Try the request again.') from error
    except requests.RequestException as error:
        raise ProviderError('Mapbox Directions is unreachable. Check outbound network access and retry.') from error
    except ValueError as error:
        raise ProviderError('Mapbox Directions returned invalid JSON.') from error
    if not isinstance(data, dict):
        raise ProviderError('Mapbox Directions returned an unexpected response.')
    if not response.ok or data.get('code') != 'Ok':
        raise ProviderError(f"Mapbox Directions: {data.get('message') or response.reason}")
    if not data.get('routes'):
        raise ProviderError('Mapbox found no drivable routes for these locations')
    return data['routes'][:3]


def _key(coordinate, start, end):
    raw = (round(coordinate[0], 4), round(coordinate[1], 4), start, end, HOURLY, UNITS)
    return 'forecast:' + hashlib.sha256(repr(raw).encode()).hexdigest()


def _batch(items, start, end):
    params = {
        'latitude': ','.join(str(item[1][1]) for item in items),
        'longitude': ','.join(str(item[1][0]) for item in items),
        'hourly': HOURLY, 'wind_speed_unit': 'mph',
        'precipitation_unit': 'mm', 'timezone': 'GMT', 'timeformat': 'unixtime',
        'start_hour': datetime.fromtimestamp(start, timezone.utc).strftime('%Y-%m-%dT%H:%M'),
        'end_hour': datetime.fromtimestamp(end, timezone.utc).strftime('%Y-%m-%dT%H:%M'),
    }
    for attempt in range(2):
        try:
            response = requests.get('https://api.open-meteo.com/v1/forecast', params=params, timeout=(10, 30))
            data = response.json()
            break
        except (requests.Timeout, requests.ConnectionError) as error:
            if attempt == 1:
                raise ProviderError('Open-Meteo is unavailable after a retry. Try again shortly.') from error
            time.sleep(.5)
        except requests.RequestException as error:
            raise ProviderError('Open-Meteo is unreachable. Check outbound network access and retry.') from error
        except ValueError as error:
            raise ProviderError('Open-Meteo returned invalid JSON.') from error
    if not response.ok:
        raise ProviderError(f"Open-Meteo: {data.get('reason') if isinstance(data, dict) else response.reason}")
    records = data if isinstance(data, list) else [data]
    if len(records) != len(items):
        raise ProviderError('Open-Meteo returned an unexpected number of locations')
    result = {}
    for (key, _), record in zip(items, records):
        units = record.get('hourly_units', {})
        if units.get('wind_speed_10m') not in ('mp/h', 'mph', 'mi/h') or units.get('rain') != 'mm' or units.get('showers') != 'mm' or units.get('snowfall') != 'cm':
            raise ProviderError('Open-Meteo returned unexpected forecast units')
        hourly = record.get('hourly') or {}
        times = hourly.get('time') or []
        if not times or any(len(hourly.get(field) or []) != len(times) for field in ('wind_speed_10m', 'rain', 'showers', 'snowfall')):
            raise ProviderError('Open-Meteo returned incomplete hourly arrays')
        result[key] = hourly
    return result


def forecasts(coordinates, start, end):
    unique = {(round(point[0], 4), round(point[1], 4)): point for point in coordinates}
    result, missing = {}, []
    for key, point in unique.items():
        cached = cache.get(_key(point, start, end))
        if cached is None:
            missing.append((key, point))
        else:
            result[key] = cached
    if missing:
        batches = [missing[index:index + 20] for index in range(0, len(missing), 20)]
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(_batch, batch, start, end) for batch in batches]
            for future in as_completed(futures):
                batch_result = future.result()
                for key, hourly in batch_result.items():
                    result[key] = hourly
                    cache.set(_key(unique[key], start, end), hourly, 15 * 60)
    return result


def sample(hourly, timestamp):
    times = hourly['time']
    if timestamp < times[0] or timestamp > times[-1]:
        return {'wind_mph': None, 'rain_in_h': None, 'snow_in_h': None}
    lower = math.floor(timestamp / 3600) * 3600
    upper = math.ceil(timestamp / 3600) * 3600
    positions = {value: index for index, value in enumerate(times)}
    if lower not in positions or upper not in positions:
        return {'wind_mph': None, 'rain_in_h': None, 'snow_in_h': None}
    left, right = positions[lower], positions[upper]
    w0, w1 = hourly['wind_speed_10m'][left], hourly['wind_speed_10m'][right]
    wind = None if w0 is None or w1 is None else w0 + (w1 - w0) * ((timestamp - lower) / 3600)
    rain, showers, snow = (hourly[field][right] for field in ('rain', 'showers', 'snowfall'))
    return {
        'wind_mph': wind,
        'rain_in_h': None if rain is None or showers is None else (rain + showers) / 25.4,
        'snow_in_h': None if snow is None else snow / 2.54,
    }
