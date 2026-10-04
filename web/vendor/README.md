# Vendored third-party files

Loaded as classic scripts (UMD) so the page works from any static server with no network access.

| File | Source | Licence |
|---|---|---|
| d3-array.min.js | https://cdn.jsdelivr.net/npm/d3-array@3 (v3.2.4) | ISC |
| d3-geo.min.js | https://cdn.jsdelivr.net/npm/d3-geo@3 (v3.1.1) | ISC |
| d3-geo-projection.min.js | https://cdn.jsdelivr.net/npm/d3-geo-projection@4 (v4.0.0), used by homolosine.html | ISC |
| d3-geo-polygon.min.js | https://cdn.jsdelivr.net/npm/d3-geo-polygon@2 (v2.0.1), used by homolosine.html | ISC |
| topojson-client.min.js | https://cdn.jsdelivr.net/npm/topojson-client@3 (v3.1.0) | ISC |
| land-110m.json | https://cdn.jsdelivr.net/npm/world-atlas@2 (Natural Earth 110m land) | Public domain |

`d3-array` must be loaded before `d3-geo`, and both before `d3-geo-projection` (each UMD build extends the existing global `d3`).

`d3-geo-polygon` is not loaded with a script tag: its global build clobbers `d3.geoInterrupted*` with wrappers that call themselves. `src/umd.js` runs it through its CommonJS branch instead, with the global `d3` as its dependencies.
