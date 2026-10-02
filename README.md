# flightglobe

A spinnable, animated globe of a personal flight history. It is a static page: open it from any static file server, no build step and no network access needed at runtime.

Data is a privacy-reduced extract of an AirTrail export: flight number, airline, aircraft type, airports, times and the (simplified) track. Passengers, seats, seat classes, reasons, notes, gates, terminals and registrations are dropped.

## Run

    python3 build/build_data.py          # ../airtrails/airtrail.json -> web/data/flights.json
    python3 -m http.server 8000 -d web   # then open http://localhost:8000

To publish, copy the `web/` folder to any static host. `web/data/flights.json` is committed; the raw export is not part of this repo.

## Using it

The page opens as a time-lapse: flights play in date order, each for a few seconds (scaled gently by real duration), and the globe accumulates until it is "full". The date counter jumps between trips; the timeline at the bottom is on the true calendar axis.

- The date line shows the current flight's own date; stopped at the very start or the full state it shows the whole span. Airport labels follow the current flight (the destination gets a ring until it lands); at the full state the busiest airports are labelled.
- Airports carry a city colour (Dopplr's scheme: `md5(city name)[:6]`, darkened x0.8 when light; `build/city_names.json` maps airports such as NRT to their metro city). `?marks=current` (default) rings the current flight's two airports in their city colours, `?marks=all` rings every airport reached so far, `?marks=dots` colours the dots themselves.
- When playback finishes by itself the globe idles in a slow spin; any touch, key or scroll stops it for good (until the next run finishes). Skip-to-end and reduced-motion leave it static, and only a real flick carries momentum.
- Drag to spin, scroll or pinch to zoom, double-click to reset.
- Top right shows the flight in the air (airline · aircraft); on a phone it stacks under the date.
- Hover (or tap) a trail for its flight number, date, route, aircraft, distance flown and great-circle distance.
- **Great circle** redraws every flight as the great-circle arc between its airports instead of the recorded track (constant speed, same timing). The readout distance is always the real distance flown.
- **Follow** makes the camera track each flight; any manual drag or zoom switches it off.
- Keys: `Space` play/pause, `←` `→` step between flights, `End` skip to the full state, `Home` restart.
- Themes: Paper (default), Night, Natural. Choose in the corner, or open with `?theme=night`. The choice is remembered when storage is available.
- With `prefers-reduced-motion` the page opens at the final state, paused.

## Develop

    node --test web/test/*.test.js && python3 -m unittest discover -s build -v

Pure logic (geometry, playback clock, stats, formatting, themes, camera maths) lives in DOM-free modules under `web/src/` with Node tests; `render.js`, `interaction.js`, `ui.js` and `main.js` are the browser layer. Libraries are vendored in `web/vendor/` (see its README).

Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.
