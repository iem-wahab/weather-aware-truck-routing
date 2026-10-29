from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.test import APIClient
from .geometry import MILE, checkpoints
from .providers import sample
from .risk import classify, rain_risk, snow_risk, wind_risk
from .views import _departure


class CalculationTests(SimpleTestCase):
    def test_mapbox_departure_has_seconds_without_fraction(self):
        date = datetime.now(timezone.utc) + timedelta(hours=2)
        _, formatted = _departure(date.isoformat())
        self.assertRegex(formatted, r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')

    def test_threshold_boundaries_and_load_overrides(self):
        self.assertEqual(rain_risk(.5), 'Severe')
        self.assertEqual(rain_risk(1), 'Severe')
        self.assertEqual(rain_risk(1.0001), 'No Travel')
        self.assertEqual(snow_risk(3), 'Severe')
        self.assertEqual(snow_risk(3.0001), 'No Travel')
        self.assertEqual(wind_risk(45, 30000), 'Severe')
        self.assertEqual(wind_risk(45, 30001), 'No Travel')
        self.assertEqual(wind_risk(35, 40001), 'Severe')
        self.assertIsNone(classify(20, None, 0, 0)['risk'])

    def test_checkpoint_uses_segment_time_and_last_partial_span(self):
        points = checkpoints([[0, 0], [1, 0], [2, 0]], [10 * MILE, 20 * MILE], [3600, 1800], 25, 1000)
        self.assertEqual(len(points), 3)
        self.assertAlmostEqual(points[1]['eta'], 1000 + 3600 + 1350)
        self.assertAlmostEqual(points[-1]['distance_m'], 30 * MILE)

    def test_hourly_accumulation_and_interpolated_wind(self):
        hourly = {'time': [0, 3600, 7200], 'wind_speed_10m': [20, 40, 50], 'rain': [0, 2.54, 5.08], 'showers': [0, 0, 0], 'snowfall': [0, 0, 0]}
        half = sample(hourly, 1800)
        self.assertEqual(half['wind_mph'], 30)
        self.assertAlmostEqual(half['rain_in_h'], .1)
        self.assertAlmostEqual(sample(hourly, 3600)['rain_in_h'], .1)
        self.assertIsNone(sample(hourly, -1)['wind_mph'])


class ApiTests(SimpleTestCase):
    def test_plan_returns_real_route_and_recommendation(self):
        departure = datetime.now(timezone.utc) + timedelta(hours=2)
        geometry = [[0, 0], [1, 0], [2, 0]]
        route = {'geometry': {'coordinates': geometry}, 'legs': [{'annotation': {'distance': [10 * MILE, 20 * MILE], 'duration': [3600, 1800]}}]}
        def mock_forecasts(coords, start, end):
            times = list(range(start, end + 1, 3600))
            hourly = {'time': times, 'wind_speed_10m': [20] * len(times), 'rain': [0] * len(times), 'showers': [0] * len(times), 'snowfall': [0] * len(times)}
            return {(round(point[0], 4), round(point[1], 4)): hourly for point in coords}
        with patch('routing.views.directions', return_value=[route]), patch('routing.views.forecasts', side_effect=mock_forecasts):
            result = APIClient().post('/api/plan/', {'origin': [0, 0], 'destination': [2, 0], 'departure_utc': departure.isoformat(), 'load_lb': 1000, 'interval_miles': 25}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(len(result.data['routes']), 1)
        self.assertEqual(result.data['recommended_route_id'], 'route-1')
        self.assertEqual(len(result.data['routes'][0]['checkpoints']), 3)
        self.assertLessEqual(len(result.data['corridor_coordinates']), 150)
