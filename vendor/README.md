# Vendored third-party files

Loaded as classic scripts (UMD) so the page works from any static server with no network access.

| File | Source | Licence |
|---|---|---|
| d3-array.min.js | https://cdn.jsdelivr.net/npm/d3-array@3 (v3.2.4) | ISC |
| d3-geo.min.js | https://cdn.jsdelivr.net/npm/d3-geo@3 (v3.1.1) | ISC |
| topojson-client.min.js | https://cdn.jsdelivr.net/npm/topojson-client@3 (v3.1.0) | ISC |
| land-110m.json | https://cdn.jsdelivr.net/npm/world-atlas@2 (Natural Earth 110m land) | Public domain |

`d3-array` must be loaded before `d3-geo` (d3-geo's UMD build extends the existing global `d3`).
