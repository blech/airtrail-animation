# flightglobe

A spinnable, animated globe of a personal flight history. Static page; data is a privacy-reduced extract of an AirTrail export.

    python3 build/build_data.py     # ../airtrails/airtrail.json -> web/data/flights.json
    python3 -m http.server 8000 -d web   # then open http://localhost:8000
    node --test web/test/*.test.js && python3 -m unittest discover -s build -v

Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.
