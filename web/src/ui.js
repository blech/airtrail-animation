import {
  calendarForPlayhead, playheadForCalendar, calendarRange, stepTarget, yearTicks,
} from './clock.js';
import { formatKm, flightBlurb, dateLabel } from './format.js';
import { trackSlice, trackLengthKm } from './geo.js';
import { airportStats, currentIndex } from './stats.js';
import { marksFromToggle, coloursOn } from './marks.js';

const SPEEDS = [0.5, 1, 2, 4];
const SCRUB_MAX = 1000;

export function bindUi({ state, schedule, flights, cum, getLoc, setFollow }) {
  const $ = (id) => document.getElementById(id);
  const playBtn = $('play');
  const speedBtn = $('speed');
  const scrub = $('scrub');
  const followBox = $('follow');
  const gcBox = $('gc');
  const coloursBox = $('colours');
  const fnumEl = $('fnum');
  const fsubEl = $('fsub');
  const playheadEl = $('playhead');
  const dateEl = $('date');
  const statsEl = $('stats');
  const ticksEl = $('ticks');
  const yearsEl = $('years');

  const [T0, T1] = calendarRange(schedule);
  const span = Math.max(1, T1 - T0);
  const frac = (T) => (T - T0) / span;

  // ticks (one per flight) and year labels, on the true calendar axis
  const ticks = flights.map((f) => {
    const el = document.createElement('i');
    el.style.left = `${frac(f.dep) * 100}%`;
    ticksEl.appendChild(el);
    return el;
  });
  function drawYears() {
    yearsEl.textContent = '';
    const width = Math.max(1, ticksEl.getBoundingClientRect().width);
    for (const { year, f } of yearTicks(T0, T1, 34 / width)) {
      const el = document.createElement('span');
      el.textContent = String(year);
      el.style.left = `${Math.min(97, Math.max(2, f * 100))}%`;
      yearsEl.appendChild(el);
    }
  }
  drawYears();
  window.addEventListener('resize', drawYears);

  const syncPlay = () => { playBtn.textContent = state.playing ? '⏸' : '▶'; };
  const jump = (p) => { state.playhead = Math.min(schedule.total, Math.max(0, p)); };

  playBtn.addEventListener('click', (e) => {
    if (!state.playing && state.playhead >= schedule.total) jump(0);
    state.playing = !state.playing;
    syncPlay();
    e.currentTarget.blur();
  });
  $('restart').addEventListener('click', (e) => { jump(0); state.playing = true; syncPlay(); e.currentTarget.blur(); });
  $('end').addEventListener('click', (e) => { jump(schedule.total); state.playing = false; syncPlay(); e.currentTarget.blur(); });
  speedBtn.addEventListener('click', (e) => {
    const i = SPEEDS.indexOf(state.speed);
    state.speed = SPEEDS[(i + 1) % SPEEDS.length];
    speedBtn.textContent = `${state.speed}×`;
    e.currentTarget.blur();
  });
  followBox.addEventListener('change', () => setFollow(followBox.checked));
  gcBox.addEventListener('change', () => { state.greatCircle = gcBox.checked; });
  coloursBox.checked = coloursOn(state.marks);
  coloursBox.addEventListener('change', () => { state.marks = marksFromToggle(coloursBox.checked); });

  let wasPlaying = false;
  scrub.addEventListener('pointerdown', () => { wasPlaying = state.playing; state.playing = false; });
  const endScrub = () => { if (wasPlaying) { state.playing = true; wasPlaying = false; syncPlay(); } };
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);
  scrub.addEventListener('input', () => {
    const T = T0 + (Number(scrub.value) / SCRUB_MAX) * span;
    jump(playheadForCalendar(schedule, T));
    syncPlay();
  });

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (!state.playing && state.playhead >= schedule.total) jump(0);
        state.playing = !state.playing;
        break;
      case 'ArrowRight': e.preventDefault(); jump(stepTarget(schedule, state.playhead, +1)); break;
      case 'ArrowLeft': e.preventDefault(); jump(stepTarget(schedule, state.playhead, -1)); break;
      case 'End': e.preventDefault(); jump(schedule.total); state.playing = false; break;
      case 'Home': e.preventDefault(); jump(0); state.playing = true; break;
      default: return;
    }
    syncPlay();
  });

  // update() runs every frame; only touch the DOM when the text actually changed
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  let lastCompleted = -1;
  function update() {
    const loc = getLoc();
    // top right: the flight in the air, or the one that just landed; blank before the first and at the end
    const shown = currentIndex(loc, flights.length);
    const blurb = shown >= 0 ? flightBlurb(flights[shown]) : { title: '', subtitle: '' };
    setText(fnumEl, blurb.title);
    setText(fsubEl, blurb.subtitle);

    const T = calendarForPlayhead(schedule, state.playhead);
    // the whole span only when stopped at the very start or end; otherwise the flight's own date
    const showRange = !state.playing && (state.playhead <= 0 || state.playhead >= schedule.total);
    setText(dateEl, dateLabel(flights, shown, showRange));
    playheadEl.style.left = `${frac(T) * 100}%`;

    let km = cum[loc.completed].km;
    const airports = airportStats(flights, loc.completed, loc.active ? loc.active.i : -1).size;
    if (loc.active) {
      const f = flights[loc.active.i];
      km += trackLengthKm(trackSlice(f.track, 0, loc.active.f));
    }
    const n = loc.completed + (loc.active ? 1 : 0);
    setText(statsEl, `${n} flight${n === 1 ? '' : 's'} · ${formatKm(km)} · ${airports} airport${airports === 1 ? '' : 's'}`);

    if (document.activeElement !== scrub || !scrub.matches(':active')) {
      scrub.value = String(Math.round(frac(T) * SCRUB_MAX));
    }
    if (loc.completed !== lastCompleted) {
      for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('done', i < loc.completed);
      lastCompleted = loc.completed;
    }
    followBox.checked = state.follow;
    syncPlay();
  }

  syncPlay();
  return { update };
}
