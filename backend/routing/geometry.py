import math

MILE = 1609.344
EARTH = 6371000


def interpolate(a, b, fraction):
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]


def point_at(coordinates, distances, durations, target):
    traveled = elapsed = 0.0
    for index, distance in enumerate(distances):
        next_traveled = traveled + distance
        if target <= next_traveled or index == len(distances) - 1:
            fraction = max(0, min(1, (target - traveled) / distance)) if distance else 0
            return interpolate(coordinates[index], coordinates[index + 1], fraction), elapsed + durations[index] * fraction, index
        traveled = next_traveled
        elapsed += durations[index]
    raise ValueError('Empty route geometry')


def checkpoints(coordinates, distances, durations, interval_miles, departure):
    if len(coordinates) != len(distances) + 1 or len(distances) != len(durations):
        raise ValueError('Mapbox route annotations do not align with its geometry')
    if not distances or any(not isinstance(d, (float, int)) or d < 0 for d in distances) or any(not isinstance(t, (float, int)) or t < 0 for t in durations):
        raise ValueError('Mapbox returned invalid road segment annotations')
    total = sum(distances)
    if total <= 0:
        raise ValueError('Mapbox returned a zero-length route')
    interval = interval_miles * MILE
    targets = [0.0]
    step = interval
    while step < total:
        targets.append(step)
        step += interval
    targets.append(total)
    result = []
    for target in targets:
        coordinate, travel_seconds, _ = point_at(coordinates, distances, durations, target)
        result.append({'coordinate': coordinate, 'distance_m': target, 'eta': departure + travel_seconds})
    return result


def offset_point(a, b, side, meters):
    lat = math.radians(a[1])
    dx = (b[0] - a[0]) * math.cos(lat)
    dy = b[1] - a[1]
    length = math.hypot(dx, dy) or 1
    east, north = -dy / length * side, dx / length * side
    return [a[0] + math.degrees(east * meters / (EARTH * max(.1, math.cos(lat)))), a[1] + math.degrees(north * meters / EARTH)]


def corridor_samples(route_specs, cap=150):
    # Allocate an equal density by route length, then reduce density to fit the shared cap.
    lengths = [sum(route['distances']) for route in route_specs]
    spacing = max(20 * MILE, sum(lengths) / max(1, cap // 3 - len(route_specs)))
    while True:
        samples = {}
        for route, length in zip(route_specs, lengths):
            targets = [length * i / max(1, math.ceil(length / spacing)) for i in range(max(1, math.ceil(length / spacing)) + 1)]
            for target in targets:
                center, _, index = point_at(route['coordinates'], route['distances'], route['durations'], target)
                a = route['coordinates'][index]
                b = route['coordinates'][index + 1]
                for point in (center, offset_point(a, b, -1, 5 * MILE), offset_point(a, b, 1, 5 * MILE)):
                    key = (round(point[0], 3), round(point[1], 3))
                    samples[key] = [key[0], key[1]]
        if len(samples) <= cap:
            return list(samples.values())
        spacing *= 1.25
