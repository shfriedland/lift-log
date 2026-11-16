// CSV import (Rep Count, Strong, Hevy, ...) and backup restore.
"use strict";

let imp = null;

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = (text.split(/\r?\n/).find(l => l.trim() && !/^sep=/i.test(l)) || '');
  const cnt = c => first.split(c).length;
  const d = [',', ';', '\t'].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = [];
  let row = [],
    f = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++
        } else q = false
      } else f += c
    } else if (c === '"') q = true;
    else if (c === d) {
      row.push(f);
      f = ''
    } else if (c === '\n') {
      row.push(f);
      rows.push(row);
      row = [];
      f = ''
    } else if (c !== '\r') f += c
  }
  if (f !== '' || row.length) {
    row.push(f);
    rows.push(row)
  }
  return rows.filter(r => r.some(c => c.trim() !== '') && !/^sep=/i.test(r[0] || ''))
}
const FIELDS = [
  ['date', 'Date / workout start', 1],
  ['exercise', 'Exercise', 1],
  ['weight', 'Weight'],
  ['reps', 'Reps'],
  ['note', 'Set note'],
  ['workout', 'Workout name'],
  ['category', 'Muscle group'],
  ['duration', 'Duration (sec)'],
  ['settype', 'Set type (warm-up)'],
  ['unit', 'Weight unit'],
  ['sets', 'Sets (if one row = several sets)']
];

function guessMap(head) {
  const L = head.map(h => h.trim().toLowerCase());
  const used = new Set();
  const find = (...res) => {
    for (const re of res) {
      const i = L.findIndex((h, ix) => !used.has(ix) && re.test(h));
      if (i >= 0) {
        used.add(i);
        return i
      }
    }
    return -1
  };
  const m = {};
  m.exercise = find(/^exercise( name)?$/, /exercise(?!.*note)/, /^(movement|lift)$/);
  m.date = find(/^date$/, /date/, /^day$/, /^(time|start|start time|timestamp)$/, /start/);
  m.reps = find(/^reps?$/, /^reps?\b/, /repetition/);
  m.weight = find(/^weight/, /weight|load/, /^(kg|lbs?)$/);
  m.note = find(/^(set )?notes?$/, /set ?note/, /^comments?$/);
  m.workout = find(/^workout( name)?$/, /workout ?name|routine|^session|^title$/, /^name$/);
  m.category = find(/categor|muscle|body ?part/);
  m.duration = find(/^duration|^seconds?$/);
  m.settype = find(/set ?type|warm/);
  m.unit = find(/unit/);
  m.sets = find(/^sets$/, /set ?count|num.*sets/);
  if (m.exercise < 0) m.exercise = find(/^name$/);
  return m
}

function parseDate(v, dmy) {
  v = String(v ?? '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return dmy ? ymd(y, +m[2], +m[1]) : ymd(y, +m[1], +m[2])
  }
  if (/^\d{10,13}$/.test(v)) {
    const t = +v;
    return localYmd(new Date(v.length === 10 ? t * 1000 : t))
  }
  const t = Date.parse(v);
  return isNaN(t) ? null : localYmd(new Date(t))
}

function buildImport() {
  const m = imp.map;
  if (m.date < 0 || m.exercise < 0) return {
    ok: false,
    err: 'Pick which columns hold the Date and the Exercise.',
    workouts: [],
    setCount: 0,
    skipped: 0
  };
  let dmy = false;
  for (const row of imp.data) {
    const mm = String(row[m.date] || '').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]/);
    if (mm && +mm[1] > 12) {
      dmy = true;
      break
    }
  }
  const wHead = m.weight >= 0 ? String(imp.head[m.weight] || '').toLowerCase() : '';
  const groups = [],
    seen = {};
  let prevKey = null,
    setCount = 0,
    skipped = 0;
  for (const row of imp.data) {
    const rawDate = String(row[m.date] ?? '').trim();
    const date = parseDate(rawDate, dmy);
    const exn = String(row[m.exercise] ?? '').trim();
    if (!date || !exn) {
      skipped++;
      continue
    }
    let wRaw = m.weight >= 0 ? String(row[m.weight] ?? '').trim() : '',
      rRaw = m.reps >= 0 ? String(row[m.reps] ?? '').trim() : '';
    const x = wRaw.match(/^([\d.,]+)\s*(kg|lbs?)?\s*[x×]\s*(\d+)/i);
    if (x && !rRaw) {
      wRaw = x[1] + (x[2] || '');
      rRaw = x[3]
    }
    let w = num(wRaw);
    const r = num(rRaw);
    let note = m.note >= 0 ? String(row[m.note] ?? '').trim() : '';
    const dur = m.duration >= 0 ? num(row[m.duration]) : NaN;
    if (dur > 0) note = (note ? note + ' · ' : '') + fmtNum(dur) + 's';
    if (w === 0 && isNaN(r)) w = NaN;
    let u = imp.unitMode;
    if (u === 'auto') {
      const src = (m.unit >= 0 ? String(row[m.unit] || '') : '') + ' ' + wRaw + ' ' + wHead;
      u = /kg|kilo/i.test(src) ? 'kg' : /lb|pound/i.test(src) ? 'lb' : S.unit
    }
    if (!isNaN(w) && u !== S.unit) w = u === 'kg' ? w * 2.20462 : w / 2.20462;
    if (!isNaN(w)) w = Math.round(w * 10) / 10;
    const wname = m.workout >= 0 ? String(row[m.workout] ?? '').trim() : '';
    // a new workout starts whenever the workout name or its start time changes from the row above
    const sk = rawDate + '|' + wname;
    let g = groups[groups.length - 1];
    if (sk !== prevKey) {
      const n = seen[sk] = (seen[sk] || 0) + 1;
      const t = Date.parse(rawDate.replace(' ', 'T'));
      g = {
        key: sk + (n > 1 ? '#' + n : ''),
        date,
        name: wname || 'Workout',
        start: /\d:\d/.test(rawDate) && !isNaN(t) ? t : 0,
        entries: []
      };
      groups.push(g);
      prevKey = sk
    }
    let en = g.entries.find(e => e.name.toLowerCase() === exn.toLowerCase());
    if (!en) {
      en = {
        name: exn,
        category: m.category >= 0 ? String(row[m.category] ?? '').trim() : '',
        sets: []
      };
      g.entries.push(en)
    }
    let n = m.sets >= 0 ? parseInt(row[m.sets], 10) : 1;
    if (!(n >= 1 && n <= 20)) n = 1;
    const filled = !isNaN(w) || !isNaN(r);
    const wu = m.settype >= 0 && /warm|^w$/i.test(String(row[m.settype] ?? '').trim());
    for (let k = 0; k < n; k++) {
      const st = {
        w: isNaN(w) ? '' : String(w),
        r: isNaN(r) ? '' : String(Math.round(r)),
        note: k === 0 ? note : '',
        done: filled
      };
      if (wu) st.warmup = true;
      en.sets.push(st);
      setCount++
    }
  }
  const workouts = groups.sort((a, b) => a.date.localeCompare(b.date) || (a.start - b.start));
  return {
    ok: workouts.length > 0,
    err: workouts.length ? '' : 'No sets found with these columns. Try different column choices.',
    workouts,
    setCount,
    skipped
  }
}

function previewHtml(r) {
  if (!r.ok) return `<div class="err">${esc(r.err)}</div>`;
  const f = r.workouts[0],
    l = r.workouts[r.workouts.length - 1],
    ex = new Set();
  r.workouts.forEach(w => w.entries.forEach(e => ex.add(e.name.toLowerCase())));
  const sample = l.entries.slice(0, 3).map(e => `<div><b>${esc(e.name)}</b>: ${e.sets.slice(0,4).map(s=>esc(fmtSet(s))).join(' · ')}${e.sets.length>4?' …':''}</div>`).join('');
  return `<div><b>${r.workouts.length}</b> workouts · <b>${r.setCount}</b> sets · <b>${ex.size}</b> exercises</div><div class="mut">${prettyDate(f.date)} → ${prettyDate(l.date)}${r.skipped?` · ${r.skipped} rows skipped`:''}</div>
  <div class="lbl" style="margin-top:10px">Most recent: ${esc(l.name)}, ${prettyDate(l.date)}</div>${sample}`
}

function renderImport() {
  const r = buildImport();
  sheetCtx = {
    type: 'import'
  };
  openSheet(`<h2>Import workouts</h2><div class="mut sm">I matched the columns automatically. Check each one points to the right column in your file.</div>
  ${FIELDS.map(([k,l,req])=>`<label class="map"><span>${l}${req?' *':''}</span><select data-f="impmap" data-k="${k}"><option value="-1">— none —</option>${imp.head.map((h,i)=>`<option value="${i}" ${imp.map[k]===i?'selected':''}>${esc(h.trim()||'Column '+(i+1))}</option>`).join('')}</select></label>`).join('')}
  <label class="map"><span>Weights in the file are</span><select data-f="impunit">${[['auto','Auto-detect'],['lb','lb'],['kg','kg']].map(([v,t])=>`<option value="${v}" ${imp.unitMode===v?'selected':''}>${t}</option>`).join('')}</select></label>
  <div class="preview">${previewHtml(r)}</div>
  <button class="primary" data-a="doImport" ${r.ok?'':'disabled'}>Import ${r.ok?r.workouts.length+' workouts':''}</button><button class="ghost" data-a="closeSheet">Cancel</button>`)
}

function startImport(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    toast('That file doesn’t look like a CSV with workout rows.');
    return
  }
  const head = rows[0];
  imp = {
    head,
    data: rows.slice(1),
    map: guessMap(head),
    unitMode: 'auto'
  };
  renderImport()
}

function doImport() {
  const r = buildImport();
  if (!r.ok) return;
  const byName = {};
  for (const e of liveEx()) byName[e.name.toLowerCase()] = e.id;
  for (const g of r.workouts) {
    const id = 'imp' + hash(g.key);
    const entries = g.entries.map(en => {
      let exId = byName[en.name.toLowerCase()];
      if (!exId) {
        exId = newId();
        S.exercises[exId] = {
          id: exId,
          name: en.name,
          category: en.category || '',
          settings: [],
          notes: '',
          createdAt: now(),
          updatedAt: now()
        };
        byName[en.name.toLowerCase()] = exId;
        markDirty('meta')
      } else if (en.category && !S.exercises[exId].category) {
        S.exercises[exId].category = en.category;
        touchEx(S.exercises[exId])
      }
      return {
        exId,
        sets: en.sets
      }
    });
    const prev = S.workouts[id];
    const w = {
      id,
      date: g.date,
      name: g.name,
      entries,
      notes: prev?.notes || '',
      createdAt: g.start || prev?.createdAt || Date.parse(g.date + 'T12:00:00') || now(),
      updatedAt: now(),
      imported: true
    };
    if (prev && monthOf(prev) !== monthOf(w)) markDirty(monthOf(prev));
    S.workouts[id] = w;
    markDirty(monthOf(w))
  }
  saveLocal();
  imp = null;
  view.tab = 'log';
  view.workoutId = null;
  closeSheet();
  toast(`Imported ${r.workouts.length} workouts and ${r.setCount} sets`)
}

// ---------- backup ----------
function mergeIn(o) {
  if (!o || typeof o !== 'object' || !o.exercises || !o.workouts) throw new Error('bad');
  for (const id in o.exercises) {
    const r = o.exercises[id],
      l = S.exercises[id];
    if (r && r.name && (!l || (r.updatedAt || 0) > (l.updatedAt || 0))) S.exercises[id] = r
  }
  for (const id in o.workouts) {
    const r = o.workouts[id],
      l = S.workouts[id];
    if (r && r.date && Array.isArray(r.entries) && (!l || (r.updatedAt || 0) > (l.updatedAt || 0))) {
      if (l) markDirty(monthOf(l));
      S.workouts[id] = r;
      markDirty(monthOf(r))
    }
  }
  for (const id in (o.routines || {})) {
    const r = o.routines[id],
      l = S.routines[id];
    if (r && Array.isArray(r.exercises) && (!l || (r.updatedAt || 0) > (l.updatedAt || 0))) S.routines[id] = r
  }
  markDirty('meta');
  saveLocal()
}

function restoreText(t) {
  try {
    mergeIn(JSON.parse(t));
    closeSheet();
    toast('Backup restored')
  } catch (e) {
    toast('That isn’t a Lift Log backup.')
  }
}
