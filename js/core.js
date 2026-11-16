// Helpers, app state, and the data model (workouts, exercises, routines, history lookups).
"use strict";

const APP_VERSION = 22; // keep in step with the cache name in sw.js
const LS = 'liftlog.v1',
  LSV = 'liftlog.view';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [c]));
const now = () => Date.now();
const newId = () => now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const localYmd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => localYmd(new Date());

function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return y + '-' + pad(m) + '-' + pad(d)
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36)
}

function num(s) {
  s = String(s ?? '').trim();
  if (!s) return NaN;
  s = s.replace(/(\d),(\d{1,2})(?!\d)/, '$1.$2');
  return parseFloat(s.replace(/[^\d.\-]/g, ''))
}

function fmtNum(n) {
  if (n === '' || n == null || isNaN(n)) return '';
  return String(Math.round(n * 10) / 10)
}

function fmtVol(v) {
  return Math.round(v).toLocaleString()
}

function prettyDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, dd);
  const o = {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  };
  if (y !== new Date().getFullYear()) o.year = 'numeric';
  return dt.toLocaleDateString(undefined, o)
}

function shortDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2600)
}
const blankSet = () => ({
  w: '',
  r: '',
  note: '',
  done: false
});
const hasData = s => s.w !== '' || s.r !== '';
const isWork = s => !s.warmup;

/* ---------- state ---------- */
let S = {
  unit: 'lb',
  unitAt: 0,
  exercises: {},
  workouts: {},
  routines: {}
};
let view = {
  tab: 'log',
  workoutId: null,
  exerciseId: null,
  routineId: null
};
let sheetCtx = null;
const openNotes = new Set();

function loadLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS));
    if (j && j.exercises && j.workouts) S = Object.assign(S, j)
  } catch (e) {}
  if (!S.routines) S.routines = {};
  try {
    const v = JSON.parse(localStorage.getItem(LSV));
    if (v && v.tab) view = v
  } catch (e) {}
}

function saveLocal() {
  try {
    localStorage.setItem(LS, JSON.stringify(S))
  } catch (e) {}
}

function saveView() {
  try {
    localStorage.setItem(LSV, JSON.stringify(view))
  } catch (e) {}
}
const liveW = () => Object.values(S.workouts).filter(w => !w.deleted);
const liveEx = () => Object.values(S.exercises).filter(e => !e.deleted);
const liveR = () => Object.values(S.routines || {}).filter(r => !r.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const tgtLow = t => {
  const m = String(t || '').match(/\d+/);
  return m ? m[0] : ''
};

function touchR(r) {
  r.updatedAt = now();
  markDirty('meta');
  saveLocal()
}
const exName = id => S.exercises[id]?.name || 'Unknown exercise';
const sortW = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);

function vol(w) {
  let v = 0;
  for (const en of w.entries)
    for (const s of en.sets) {
      if (s.warmup) continue;
      const a = num(s.w),
        b = num(s.r);
      if (a && b) v += a * b
    }
  return v
}

function fmtSet(s) {
  return (s.warmup ? 'W ' : '') + (s.w !== '' ? s.w : 'BW') + ' × ' + (s.r !== '' ? s.r : '?')
}
const normName = n => String(n || '').trim().toLowerCase();
// Which routine a workout belongs to: its routine id, plus the routine's current name and the workout's own name
function routineKeys(w) {
  if (!w) return null;
  const k = new Set();
  if (w.routineId) {
    k.add('id:' + w.routineId);
    const r = S.routines[w.routineId];
    if (r && !r.deleted && normName(r.name)) k.add('n:' + normName(r.name))
  }
  const n = normName(w.name);
  if (n && n !== 'workout') k.add('n:' + n);
  return k.size ? k : null
}

function sameRoutine(keys, w) {
  if (!keys) return false;
  if (w.routineId && keys.has('id:' + w.routineId)) return true;
  const n = normName(w.name);
  if (n && keys.has('n:' + n)) return true;
  if (w.routineId) {
    const r = S.routines[w.routineId];
    if (r && keys.has('n:' + normName(r.name))) return true
  }
  return false
}
// Last time this exercise was done. In a routine (or a named workout) only that routine's history counts; unnamed workouts use any history.
function lastFor(exId, cur) {
  const keys = routineKeys(cur);
  let same = null,
    any = null;
  for (const w of liveW()) {
    if (cur && w.id === cur.id) continue;
    if (cur && cur.date && w.date > cur.date) continue;
    const en = w.entries.find(e => e.exId === exId);
    if (!en) continue;
    const sets = en.sets.filter(hasData);
    if (!sets.length) continue;
    const c = {
      date: w.date,
      createdAt: w.createdAt,
      sets,
      name: w.name
    };
    const newer = (a, b) => !a || b.date > a.date || (b.date === a.date && (b.createdAt || 0) > (a.createdAt || 0));
    if (newer(any, c)) any = c;
    if (sameRoutine(keys, w) && newer(same, c)) same = c
  }
  if (keys) {
    if (same) same.scoped = true;
    return same
  }
  if (any) any.scoped = false;
  return any
}

function historyFor(exId) {
  const out = [];
  for (const w of liveW().sort(sortW)) {
    const en = w.entries.find(e => e.exId === exId);
    if (!en) continue;
    const sets = en.sets.filter(s => hasData(s) || (s.media && s.media.length));
    if (sets.length) out.push({
      w,
      sets
    })
  }
  return out
}

function lastUsedMap() {
  const m = {};
  for (const w of liveW())
    for (const en of w.entries)
      if (!m[en.exId] || w.date > m[en.exId]) m[en.exId] = w.date;
  return m
}

function settingsSummary(ex) {
  if (!ex) return '';
  if (typeof ex.machine === 'string') return ex.machine.trim();
  return (ex.settings || []).filter(x => x.k || x.v).map(x => (x.k ? x.k + ' ' : '') + x.v).join(', ')
}

function e1rm(s) {
  if (s.warmup) return 0;
  const w = num(s.w),
    r = num(s.r);
  if (!w || !r || r > 15) return 0;
  return r === 1 ? w : w * (1 + r / 30)
}
