// Helpers, app state, and the data model (workouts, exercises, routines, history lookups).
"use strict";

const APP_VERSION = 44; // keep in step with the cache name in sw.js
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
// Text size follows the iPhone's setting (Settings > Display & Brightness > Text Size).
// Safari reports it through the `-apple-system-body` font, which is 17px at the default size. All sizes in
// styles.css are in rem, so scaling the root font size scales text and layout together. The scale is capped
// so the set rows still fit on a phone at the largest sizes. Other browsers keep the normal 16px.
function applyTextSize() {
  let scale = 1;
  try {
    if (window.CSS && CSS.supports('font', '-apple-system-body')) {
      const probe = document.createElement('span');
      probe.style.font = '-apple-system-body';
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const px = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      if (px > 0) scale = Math.min(1.35, Math.max(.88, px / 17))
    }
  } catch (e) {}
  document.documentElement.style.fontSize = scale === 1 ? '' : (16 * scale).toFixed(2) + 'px'
}
applyTextSize();

// Some iPhones, as home-screen apps, lay out "the bottom of the screen" higher than it really is: short by
// exactly the status bar (59pt on Dynamic Island phones), so everything pinned to the bottom (tab bar, bottom
// fade, sheets, toast) sits that much too high. And they don't do it consistently: after coming back from the
// background the layout can be right again.
// So don't trust the reported window height. Measure where the bottom actually is, with an invisible marker
// pinned to the bottom edge, compare that with the real screen height, and shift those pieces down by the
// difference (--vfix in styles.css). Re-checked every couple of seconds and on every resume, so if the phone
// changes its mind the bar follows within a moment. A phone that lays out correctly always gets 0.
const viewportFix = {
  px: 0,
  screen: 0,
  bottom: 0
};
let vfixProbe = null;

function fixViewport() {
  if (!document.body) return;
  if (!vfixProbe) {
    vfixProbe = document.createElement('div');
    vfixProbe.setAttribute('aria-hidden', 'true');
    vfixProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
    document.body.appendChild(vfixProbe)
  }
  const bottom = vfixProbe.getBoundingClientRect().bottom; // where "the bottom" is really laid out
  const portrait = window.innerHeight > window.innerWidth;
  const screenH = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let px = 0;
  if (standalone && /iPhone|iPod/.test(navigator.userAgent)) {
    const gap = Math.round(screenH - bottom);
    if (gap >= 15 && gap <= 70) px = gap // about a status bar; anything else is left alone
  }
  viewportFix.screen = Math.round(screenH);
  viewportFix.bottom = Math.round(bottom);
  if (px !== viewportFix.px || !viewportFix.set) {
    viewportFix.px = px;
    viewportFix.set = true;
    document.documentElement.style.setProperty('--vfix', px + 'px')
  }
}
fixViewport();
window.addEventListener('resize', fixViewport);
if (window.visualViewport) visualViewport.addEventListener('resize', fixViewport);
window.addEventListener('orientationchange', () => setTimeout(fixViewport, 300));
window.addEventListener('pageshow', fixViewport);
setInterval(() => {
  if (document.visibilityState === 'visible') fixViewport()
}, 2000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    applyTextSize(); // came back after changing the setting
    // the phone may finish adjusting its layout a moment after the app comes back
    [0, 150, 500, 1200].forEach(ms => setTimeout(fixViewport, ms))
  }
});

// The page content scrolls inside #scroller (the window itself never scrolls; see styles.css).
const scrollToTop = () => {
  const sc = document.getElementById('scroller');
  if (sc) sc.scrollTop = 0
};
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
  routineId: null,
  cardioId: null
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
const liveW = () => Object.values(S.workouts).filter(w => !w.deleted && !isCardio(w)); // lifting workouts only
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

// The lifting workout in progress, if any: started today, not finished, under 8 hours old.
// It's the same rule that keeps the workout timer running.
function activeWorkout() {
  let best = null;
  for (const w of liveW()) {
    const age = now() - (w.createdAt || 0);
    if (w.finishedAt || w.date !== today() || age < 0 || age > 8 * 3600e3) continue;
    if (!best || (w.createdAt || 0) > (best.createdAt || 0)) best = w
  }
  return best
}

// ---------- cardio ----------
// A cardio session is stored in S.workouts like a workout, marked kind: 'cardio', so sync, backup and restore
// handle it unchanged. It's kept out of everything lifting-related by liveW(); liveC() lists the sessions.
//   {id, kind: 'cardio', date, type, min, dist, du, note, entries: [], createdAt, updatedAt, deleted?}
// min and dist are strings exactly as typed; du is the distance unit ('mi' or 'km'), fixed when it's logged.
const CARDIO_TYPES = ['Run', 'Walk', 'Treadmill', 'Bike', 'Row', 'Elliptical', 'Stair climber', 'Swim', 'Hike', 'Other'];
const distUnit = () => S.unit === 'kg' ? 'km' : 'mi';
const isCardio = w => w.kind === 'cardio';
const liveC = () => Object.values(S.workouts).filter(w => !w.deleted && isCardio(w));

// Minutes from what was typed: "30", "30.5", "32:15" (min:sec) or "1:05:00" (h:min:sec).
function parseMinutes(v) {
  v = String(v ?? '').trim();
  if (!v) return NaN;
  if (v.includes(':')) {
    const p = v.split(':').map(Number);
    if (p.some(isNaN)) return NaN;
    return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60
  }
  return num(v)
}

// "Pace 9:42 /mi" when there's both a time and a distance. Biking shows speed instead ("Speed 16.0 mph").
function paceText(c) {
  const m = parseMinutes(c.min),
    d = num(c.dist);
  if (!(m > 0) || !(d > 0)) return '';
  if (c.type === 'Bike') return 'Speed ' + (d / (m / 60)).toFixed(1) + ((c.du || 'mi') === 'km' ? ' km/h' : ' mph');
  const secs = Math.round(m * 60 / d);
  return 'Pace ' + Math.floor(secs / 60) + ':' + pad(secs % 60) + ' /' + (c.du || 'mi')
}

// Short summary for lists, e.g. "3.1 mi · 30 min".
function cardioSummary(c) {
  const bits = [];
  if (c.dist !== '' && c.dist != null) bits.push(c.dist + ' ' + (c.du || 'mi'));
  if (c.min !== '' && c.min != null) bits.push(c.min + (String(c.min).includes(':') ? '' : ' min'));
  return bits.join(' · ')
}

// The most recent earlier session of the same type, for the faint hints in the time and distance boxes.
function lastCardio(type, cur) {
  let best = null;
  for (const c of liveC()) {
    if (cur && (c.id === cur.id || (cur.date && c.date > cur.date))) continue;
    if (c.type !== type || (c.min === '' && c.dist === '')) continue;
    if (!best || sortW(c, best) < 0) best = c
  }
  return best
}
