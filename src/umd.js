// Run a UMD bundle through its CommonJS branch so its exports land in their own object. d3-geo-polygon's
// browser-global build can't share window.d3 with d3-geo-projection: it replaces d3.geoInterrupted* with
// clipped wrappers that call d3.geoInterrupted*, i.e. themselves.
export async function loadUmd(url, require) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const module = { exports: {} };
  new Function('exports', 'module', 'require', await res.text())(module.exports, module, require);
  return module.exports;
}
