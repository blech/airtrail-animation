export const THEMES = {
  paper: {
    id: 'paper', label: 'Paper',
    bg: '#f4f2ee', ocean: '#f4f2ee', land: '#d9d6cf', coast: '#bdb9b0',
    trail: '20,20,20', settledAlpha: 0.22, activeAlpha: 0.9, dot: '#111111',
    glow: 'rgba(0,0,0,0.06)', outline: '#c9c5bc',
    ui: { fg: '#1a1a1a', muted: '#777777', panel: 'rgba(244,242,238,0.85)', accent: '#111111' },
  },
  night: {
    id: 'night', label: 'Night',
    bg: '#000000', ocean: '#050505', land: '#262626', coast: '#3b3b3b',
    trail: '255,255,255', settledAlpha: 0.18, activeAlpha: 0.95, dot: '#ffffff',
    glow: null, outline: null,
    ui: { fg: '#eeeeee', muted: '#888888', panel: 'rgba(0,0,0,0.7)', accent: '#ffffff' },
  },
  natural: {
    id: 'natural', label: 'Natural',
    bg: '#0b1620', ocean: '#12263a', land: '#5d7a62', coast: '#7e9a80',
    trail: '255,190,90', settledAlpha: 0.3, activeAlpha: 0.95, dot: '#ffd089',
    glow: 'rgba(120,170,220,0.25)', outline: 'rgba(160,200,240,0.35)',
    ui: { fg: '#e8eef4', muted: '#8fa3b5', panel: 'rgba(11,22,32,0.75)', accent: '#ffd089' },
  },
  // Colours taken from the AirTrail app (src/app.css and the OpenFreeMap positron/dark basemap styles):
  // land is the style's background, ocean its water fill, trails the app's primary blue, airports its emerald.
  airtrailLight: {
    id: 'airtrailLight', label: 'AirTrail Light',
    bg: '#ffffff', ocean: '#c2c8ca', land: '#f2f3f0', coast: '#c2c8ca',
    trail: '59,130,246', settledAlpha: 0.35, activeAlpha: 0.95, dot: '#10b981',
    glow: null, outline: null,
    ui: { fg: '#09090b', muted: '#71717a', panel: 'rgba(255,255,255,0.85)', accent: '#3b82f6' },
  },
  airtrailDark: {
    id: 'airtrailDark', label: 'AirTrail Dark',
    bg: '#09090b', ocean: '#1b1b1d', land: '#0c0c0c', coast: '#1b1b1d',
    trail: '59,130,246', settledAlpha: 0.4, activeAlpha: 0.95, dot: '#10b981',
    glow: null, outline: null,
    ui: { fg: '#fafafa', muted: '#a1a1aa', panel: 'rgba(9,9,11,0.8)', accent: '#3b82f6' },
  },
};

export const DEFAULT_THEME = 'paper';
export const THEME_ORDER = ['paper', 'night', 'natural', 'airtrailLight', 'airtrailDark'];

const valid = (id) => typeof id === 'string' && Object.hasOwn(THEMES, id);

export function resolveTheme(search, stored) {
  const q = new URLSearchParams(search || '').get('theme');
  if (valid(q)) return q;
  if (valid(stored)) return stored;
  return DEFAULT_THEME;
}
