import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_data as bd


class GeometryTests(unittest.TestCase):
    def test_wrap_lon(self):
        self.assertAlmostEqual(bd.wrap_lon(181), -179)
        self.assertAlmostEqual(bd.wrap_lon(-181), 179)
        self.assertAlmostEqual(bd.wrap_lon(10), 10)

    def test_unwrap_makes_longitudes_continuous(self):
        pts = [(179.0, 40.0), (-179.0, 40.0), (-177.0, 40.0)]
        out = bd.unwrap_lons(pts)
        self.assertEqual([round(p[0], 6) for p in out], [179.0, 181.0, 183.0])

    def test_simplify_keeps_endpoints_and_drops_collinear_points(self):
        pts = [(float(i), 0.0, 0, i) for i in range(11)]
        out = bd.simplify(pts, 0.01)
        self.assertEqual(out, [pts[0], pts[-1]])

    def test_simplify_keeps_a_real_corner(self):
        pts = [(0.0, 0.0), (5.0, 0.0), (5.0, 5.0)]
        self.assertEqual(bd.simplify(pts, 0.01), pts)

    def test_simplify_to_respects_max_points(self):
        pts = [(i * 0.1, math.sin(i * 0.7) * 0.5) for i in range(400)]
        out = bd.simplify_to(pts, 0.0001, 60)
        self.assertLessEqual(len(out), 60)
        self.assertEqual(out[0], pts[0])
        self.assertEqual(out[-1], pts[-1])

    def test_antimeridian_track_simplifies_to_its_endpoints(self):
        # straight eastbound line across the antimeridian, lon wrapped as in raw data
        pts = [(bd.wrap_lon(170 + i * 2.0), 40.0, 0, i) for i in range(11)]
        out = bd.simplify_track(pts, 0.01, 100)
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(out[0][0], 170.0)
        self.assertAlmostEqual(out[1][0], -170.0)
        for p in out:
            self.assertTrue(-180 <= p[0] < 180)

    def test_haversine_sfo_lhr(self):
        d = bd.haversine_km((-122.375, 37.62), (-0.4543, 51.47))
        self.assertTrue(8550 < d < 8680, d)

    def test_great_circle_endpoints_and_count(self):
        pts = bd.great_circle((-122.375, 37.62), (-0.4543, 51.47), 20)
        self.assertEqual(len(pts), 20)
        self.assertAlmostEqual(pts[0][0], -122.375, places=4)
        self.assertAlmostEqual(pts[-1][1], 51.47, places=4)
        # great circle SFO-LHR bulges north of the straight lat interpolation
        self.assertGreater(max(p[1] for p in pts), 60)

    def test_altitude_profile_is_zero_at_ends_and_cruise_in_middle(self):
        self.assertEqual(bd.altitude_profile(0.0, 11000), 0)
        self.assertEqual(bd.altitude_profile(1.0, 11000), 0)
        self.assertEqual(bd.altitude_profile(0.5, 11000), 11000)

    def test_cruise_for_km_scales_then_caps(self):
        self.assertLess(bd.cruise_for_km(100), 5000)
        self.assertEqual(bd.cruise_for_km(8000), bd.CRUISE_M)


if __name__ == "__main__":
    unittest.main()
