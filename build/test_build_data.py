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


REAL_EXPORT = Path(__file__).resolve().parents[2] / "airtrails" / "airtrail.json"
ALLOWED_TOP = {"id", "date", "flightNumber", "airline", "aircraft", "from", "to", "dep", "arr", "track", "approx"}


def make_airport(icao, lat, lon):
    return {"icao": icao, "iata": icao[1:], "lat": lat, "lon": lon, "municipality": "Town " + icao,
            "country": "US", "tz": "UTC", "name": "Secret Name", "type": "large_airport",
            "continent": "NA", "custom": False}


def make_flight(**over):
    track = [[-122.4, 37.6, 100.0, 1000], [-110.0, 38.0, 9000.0, 4000],
             [-95.0, 39.0, 11000.0, 8000], [-71.0, 42.4, 50.0, 12000]]
    f = {
        "date": "2023-05-01", "flightNumber": "UA123", "aircraftReg": "N12345", "note": "private note",
        "departure": "2023-05-01T10:00:00Z", "arrival": "2023-05-01T14:30:00.000+00:00",
        "takeoffActual": "2023-05-01T10:20:00Z", "landingActual": "2023-05-01T14:10:00Z",
        "departureGate": "B35A", "arrivalGate": "D2", "departureTerminal": "B", "arrivalTerminal": "2",
        "from": make_airport("KSFO", 37.62, -122.37), "to": make_airport("KBOS", 42.36, -71.0),
        "aircraft": {"icao": "B738", "name": "Boeing 737-800", "sourceId": "x"},
        "airline": {"name": "United", "icao": "UAL", "iata": "UA", "iconPath": "p", "sourceId": "s"},
        "passengers": [{"userId": "u123secret", "guestName": None, "seat": "window", "seatNumber": "32F",
                        "seatClass": "economy", "flightReason": "leisure",
                        "user": {"id": "u123secret", "displayName": "Paul Mison", "username": "paulmison"}}],
        "track": {"coordinates": track, "times": [p[3] for p in track], "trackDeg": [1, 2, 3, 4],
                  "sourceName": "x.csv", "sourceFormat": "csv", "groundSpeedKt": [1, 2, 3, 4]},
    }
    f.update(over)
    return f


class ParseTests(unittest.TestCase):
    def test_parse_ts_formats(self):
        self.assertEqual(bd.parse_ts("2019-12-26T22:03:00Z"), 1577397780)
        self.assertEqual(bd.parse_ts("2019-12-26T22:03:00.000+00:00"), 1577397780)
        self.assertEqual(bd.parse_ts("2019-12-26T22:03:00"), 1577397780)  # naive = UTC
        self.assertIsNone(bd.parse_ts(None))


class BuildFlightTests(unittest.TestCase):
    def test_output_has_only_whitelisted_keys_and_no_private_strings(self):
        out = bd.build_flight(make_flight())
        self.assertEqual(set(out) - {"id"}, ALLOWED_TOP - {"id"})
        blob = json.dumps(out)
        for secret in ("Paul Mison", "paulmison", "u123secret", "32F", "N12345", "private note",
                       "B35A", "Secret Name", "economy", "leisure"):
            self.assertNotIn(secret, blob)
        self.assertEqual(out["flightNumber"], "UA123")
        self.assertEqual(out["aircraft"], {"name": "Boeing 737-800", "icao": "B738"})
        self.assertEqual(out["airline"], "United")
        self.assertEqual(set(out["from"]), {"icao", "iata", "city", "country", "lat", "lon"})

    def test_real_track_keeps_recorded_times_and_window(self):
        out = bd.build_flight(make_flight())
        self.assertFalse(out["approx"])
        self.assertEqual(out["dep"], out["track"][0][3])
        self.assertEqual(out["arr"], out["track"][-1][3])
        self.assertEqual(out["track"][0][:2], [-122.4, 37.6])

    def test_missing_times_are_synthesised_inside_window(self):
        f = make_flight()
        f["track"]["times"] = []
        out = bd.build_flight(f)
        ts = [p[3] for p in out["track"]]
        self.assertTrue(out["approx"])
        self.assertEqual(ts[0], out["dep"])
        self.assertEqual(ts[-1], out["arr"])
        self.assertTrue(all(b > a for a, b in zip(ts, ts[1:])), ts)

    def test_missing_altitude_is_filled_never_null(self):
        f = make_flight()
        f["track"]["coordinates"] = [[c[0], c[1]] for c in f["track"]["coordinates"]]
        out = bd.build_flight(f)
        alts = [p[2] for p in out["track"]]
        self.assertTrue(all(isinstance(a, (int, float)) and a == a and a >= 0 for a in alts), alts)
        self.assertEqual(alts[0], 0)
        self.assertEqual(alts[-1], 0)
        self.assertGreater(max(alts), 1000)

    def test_negative_altitude_is_clamped_to_zero(self):
        f = make_flight()
        f["track"]["coordinates"][0][2] = -3.0
        out = bd.build_flight(f)
        self.assertTrue(all(p[2] >= 0 for p in out["track"]))

    def test_no_track_falls_back_to_great_circle(self):
        out = bd.build_flight(make_flight(track=None))
        self.assertTrue(out["approx"])
        self.assertGreaterEqual(len(out["track"]), 2)
        self.assertAlmostEqual(out["track"][0][0], -122.37, places=3)
        self.assertAlmostEqual(out["track"][-1][1], 42.36, places=3)
        self.assertEqual(out["track"][0][3], out["dep"])
        self.assertEqual(out["track"][-1][3], out["arr"])

    def test_non_positive_window_is_repaired(self):
        f = make_flight(track=None, takeoffActual=None, landingActual=None,
                        departure="2023-05-01T10:00:00Z", arrival="2023-05-01T10:00:00Z")
        out = bd.build_flight(f)
        self.assertGreater(out["arr"], out["dep"])

    def test_uses_takeoff_landing_when_present_else_scheduled(self):
        f = make_flight(track=None)
        out = bd.build_flight(f)
        self.assertEqual(out["dep"], bd.parse_ts("2023-05-01T10:20:00Z"))
        self.assertEqual(out["arr"], bd.parse_ts("2023-05-01T14:10:00Z"))
        f2 = make_flight(track=None, takeoffActual=None, landingActual=None)
        out2 = bd.build_flight(f2)
        self.assertEqual(out2["dep"], bd.parse_ts("2023-05-01T10:00:00Z"))

    def test_antimeridian_track_survives(self):
        track = [[170 + i * 2.0 if 170 + i * 2.0 < 180 else 170 + i * 2.0 - 360, 40.0, 10000.0, 1000 + i * 600]
                 for i in range(11)]
        f = make_flight(track={"coordinates": track, "times": [p[3] for p in track]})
        out = bd.build_flight(f)
        lons = [p[0] for p in out["track"]]
        self.assertTrue(all(-180 <= x < 180 for x in lons))
        self.assertAlmostEqual(lons[0], 170.0)
        self.assertAlmostEqual(lons[-1], -170.0)


class BuildAllTests(unittest.TestCase):
    def test_sorted_by_departure_with_sequential_ids(self):
        a = make_flight(flightNumber="A", takeoffActual="2023-05-03T10:00:00.000+00:00",
                        landingActual="2023-05-03T14:00:00Z", track=None)
        b = make_flight(flightNumber="B", takeoffActual="2021-01-01T10:00:00Z",
                        landingActual="2021-01-01T14:00:00Z", track=None)
        out = bd.build_all({"users": [{"x": 1}], "flights": [a, b]})
        self.assertEqual([f["flightNumber"] for f in out["flights"]], ["B", "A"])
        self.assertEqual([f["id"] for f in out["flights"]], [0, 1])
        self.assertNotIn("users", out)


@unittest.skipUnless(REAL_EXPORT.exists(), "real AirTrail export not present")
class RealExportTests(unittest.TestCase):
    def test_real_export_is_clean_and_complete(self):
        export = json.loads(REAL_EXPORT.read_text())
        out = bd.build_all(export)
        self.assertEqual(len(out["flights"]), len(export["flights"]))
        blob = json.dumps(out)
        self.assertLess(len(blob), 900_000)
        for f in out["flights"]:
            self.assertEqual(set(f), ALLOWED_TOP)
            self.assertGreaterEqual(len(f["track"]), 2)
            self.assertGreater(f["arr"], f["dep"])
            for lon, lat, alt, t in f["track"]:
                self.assertTrue(-180 <= lon < 180 and -90 <= lat <= 90)
                self.assertTrue(alt == alt and alt >= 0)
        deps = [f["dep"] for f in out["flights"]]
        self.assertEqual(deps, sorted(deps))
        for u in export["users"]:
            for key in ("id", "username", "displayName"):
                if u.get(key):
                    self.assertNotIn(str(u[key]), blob)
        for flight in export["flights"]:
            for p in flight.get("passengers", []):
                for key in ("seatNumber", "userId"):
                    if p.get(key) and len(str(p[key])) > 3:
                        self.assertNotIn(str(p[key]), blob)


if __name__ == "__main__":
    unittest.main()
