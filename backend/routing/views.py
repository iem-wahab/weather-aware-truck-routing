import math
from datetime import datetime, timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .providers import ProviderError, directions, forecasts, sample
from .geometry import MILE, checkpoints, corridor_samples
from .risk import LEVELS, classify


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({'error': message}, status=code)


def _coordinate(value):
    if not isinstance(value, list) or len(value) != 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in value):
        raise ValueError('Select a valid origin and destination')
    lon, lat = value
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError('Location coordinates are out of range')
    return [float(lon), float(lat)]


def _number(value, name):
    if isinstance(value, bool):
        raise ValueError(f'{name} must be a number')
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{name} must be a number')
    if not math.isfinite(number):
        raise ValueError(f'{name} must be finite')
    return number


def _departure(value):
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if date.tzinfo is None:
            raise ValueError()
        timestamp = date.timestamp()
    except (AttributeError, ValueError, OverflowError):
        raise ValueError('Departure must include a timezone')
    now = datetime.now(timezone.utc).timestamp()
    if timestamp < now - 60 or timestamp + 48 * 3600 > now + 16 * 86400:
        raise ValueError('Choose a departure between now and 14 days from now so the 48-hour forecast is available')
    return timestamp, datetime.fromtimestamp(timestamp, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _window(departure, latest):
    return [math.floor(departure / 3600) * 3600, math.ceil(max(latest, departure + 48 * 3600) / 3600) * 3600]


def _summarize(checkpoint_list):
    severe = high = weighted = 0.0
    missing = any(point['risk'] is None for point in checkpoint_list)
    blocked = any(point['risk'] == 'No Travel' for point in checkpoint_list)
    total = checkpoint_list[-1]['distance_m']
    for left, right in zip(checkpoint_list, checkpoint_list[1:]):
        distance = right['distance_m'] - left['distance_m']
        if left['risk'] is None or right['risk'] is None:
            continue
        score = max(LEVELS.index(left['risk']), LEVELS.index(right['risk']))
        weighted += score * distance
        severe += distance if score == 3 else 0
        high += distance if score == 2 else 0
    return {
        'severe_miles': severe / MILE,
        'high_miles': high / MILE,
        'average_risk': None if missing else weighted / total,
        'status': 'No Travel' if blocked else ('Incomplete forecast' if missing else 'Eligible'),
    }


@api_view(['POST'])
def plan(request):
    try:
        body = request.data
        origin, destination = _coordinate(body.get('origin')), _coordinate(body.get('destination'))
        if origin == destination:
            raise ValueError('Origin and destination must differ')
        departure, departure_iso = _departure(body.get('departure_utc'))
        load = _number(body.get('load_lb'), 'Load weight')
        if load < 0:
            raise ValueError('Load weight cannot be negative')
        interval = body.get('interval_miles')
        if isinstance(interval, bool) or interval not in (10, 25, 50):
            raise ValueError('Checkpoint interval must be 10, 25, or 50 miles')
        raw_routes = directions(origin, destination, departure_iso)
        distinct = []
        seen_geometry = set()
        for raw in raw_routes:
            geometry_key = tuple(tuple(point) for point in raw['geometry']['coordinates'])
            if geometry_key not in seen_geometry:
                seen_geometry.add(geometry_key)
                distinct.append(raw)
        raw_routes = distinct
        route_specs = []
        for raw in raw_routes:
            coordinates = raw['geometry']['coordinates']
            legs = raw['legs']
            distances = [value for leg in legs for value in leg['annotation']['distance']]
            durations = [value for leg in legs for value in leg['annotation']['duration']]
            points = checkpoints(coordinates, distances, durations, interval, departure)
            route_specs.append({'coordinates': coordinates, 'distances': distances, 'durations': durations, 'points': points, 'distance_m': sum(distances), 'duration_s': sum(durations)})
        latest = max(point['eta'] for route in route_specs for point in route['points'])
        window = _window(departure, latest)
        if window[1] > datetime.now(timezone.utc).timestamp() + 16 * 86400:
            raise ValueError('This trip reaches beyond available forecast coverage; choose an earlier departure or shorter trip')
        coords = [point['coordinate'] for route in route_specs for point in route['points']]
        weather = forecasts(coords, *window)
        routes = []
        for index, route in enumerate(route_specs):
            point_data = []
            for point in route['points']:
                key = (round(point['coordinate'][0], 4), round(point['coordinate'][1], 4))
                values = sample(weather[key], point['eta'])
                point_data.append({
                    'coordinate': point['coordinate'], 'distance_m': point['distance_m'],
                    'eta_utc': datetime.fromtimestamp(point['eta'], timezone.utc).isoformat().replace('+00:00', 'Z'),
                    **values, **classify(values['wind_mph'], values['rain_in_h'], values['snow_in_h'], load),
                })
            summary = _summarize(point_data)
            routes.append({
                'id': f'route-{index + 1}', 'name': f'Route {index + 1}',
                'geometry': {'type': 'LineString', 'coordinates': route['coordinates']},
                'distance_m': route['distance_m'], 'duration_s': route['duration_s'],
                'arrival_utc': datetime.fromtimestamp(departure + route['duration_s'], timezone.utc).isoformat().replace('+00:00', 'Z'),
                'checkpoints': point_data, **summary,
            })
        eligible = [route for route in routes if route['status'] == 'Eligible']
        best = min(eligible, key=lambda route: (route['severe_miles'], route['high_miles'], route['average_risk'], route['duration_s'])) if eligible else None
        qualifier = ' among routes with complete forecasts' if len(eligible) < len(routes) and best else ''
        explanation = (f"{best['severe_miles']:.1f} Severe mi, {best['high_miles']:.1f} High mi, and {best['average_risk']:.2f} average risk{qualifier}; ranked by severity, then drive time." if best else 'No eligible route: every route has a No Travel checkpoint or incomplete ETA forecasts.')
        return Response({
            'routes': routes, 'recommended_route_id': best['id'] if best else None,
            'recommendation_explanation': explanation,
            'availability_message': None if len(routes) == 3 else f'Mapbox supplied {len(routes)} distinct route(s) for this trip.',
            'corridor_coordinates': corridor_samples(route_specs), 'forecast_window': window,
            'departure_utc': departure_iso, 'load_lb': load,
        })
    except ValueError as error:
        return _error(str(error))
    except ProviderError as error:
        return _error(str(error), status.HTTP_502_BAD_GATEWAY)
    except (KeyError, TypeError, IndexError) as error:
        return _error(f'Provider returned unusable route or forecast data: {error}', status.HTTP_502_BAD_GATEWAY)


@api_view(['POST'])
def corridor_weather(request):
    try:
        body = request.data
        coordinates = body.get('coordinates')
        if not isinstance(coordinates, list) or not 1 <= len(coordinates) <= 150:
            raise ValueError('Corridor must contain 1 to 150 locations')
        coordinates = [_coordinate(point) for point in coordinates]
        departure, _ = _departure(body.get('departure_utc'))
        load = _number(body.get('load_lb'), 'Load weight')
        if load < 0:
            raise ValueError('Load weight cannot be negative')
        window = body.get('forecast_window')
        if not isinstance(window, list) or len(window) != 2 or not all(isinstance(v, int) for v in window):
            raise ValueError('Forecast window is invalid')
        if window[0] > math.floor(departure / 3600) * 3600 or window[1] < math.ceil((departure + 48 * 3600) / 3600) * 3600 or window[1] > datetime.now(timezone.utc).timestamp() + 16 * 86400:
            raise ValueError('Forecast window does not cover the requested trip')
        weather = forecasts(coordinates, *window)
        timestamps = [departure + hour * 3600 for hour in range(49)]
        frames = []
        for timestamp in timestamps:
            frame = []
            for point in coordinates:
                key = (round(point[0], 4), round(point[1], 4))
                values = sample(weather[key], timestamp)
                result = classify(values['wind_mph'], values['rain_in_h'], values['snow_in_h'], load)
                frame.append(None if result['risk'] is None else LEVELS.index(result['risk']))
            frames.append(frame)
        return Response({'timestamps_utc': [datetime.fromtimestamp(t, timezone.utc).isoformat().replace('+00:00', 'Z') for t in timestamps], 'risk_frames': frames})
    except ValueError as error:
        return _error(str(error))
    except ProviderError as error:
        return _error(str(error), status.HTTP_502_BAD_GATEWAY)
    except (KeyError, TypeError, IndexError) as error:
        return _error(f'Open-Meteo returned unusable weather data: {error}', status.HTTP_502_BAD_GATEWAY)
