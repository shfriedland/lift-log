// Screens: top bar, workout list, workout, exercises, settings, routines.
"use strict";

function render() {
  renderTop();
  const m = $('#main');
  if (view.tab === 'log') m.innerHTML = view.workoutId ? vWorkout() : vLog();
  else if (view.tab === 'ex') m.innerHTML = view.exerciseId ? vExercise() : vExList();
  else if (view.tab === 'rt') m.innerHTML = view.routineId ? vRoutine() : vRoutines();
  else if (view.tab === 'cd') m.innerHTML = view.cardioId ? vCardio() : vCardioList();
  else m.innerHTML = vSettings();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view.tab));
  m.querySelectorAll('textarea').forEach(autoGrow);
  saveView()
}
const VID_ICON = `<svg class="vicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5z"/></svg>`;
const CAM_ICON = `<svg class="vicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2 2 0 0 1 5 6.5h2.5L9 4.5h6l1.5 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>`;

function renderTop() {
  const home = `<button class="home" data-a="home" aria-label="Home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg></button>`;
  const dot = `<span class="sync ${syncState}" title="${esc(syncLabel())}"></span>`;
  let left = '',
    sub = false,
    trash = '';
  if (view.tab === 'log' && view.workoutId && S.workouts[view.workoutId]) {
    const w = S.workouts[view.workoutId];
    sub = true;
    left = `<button class="wtitle" data-a="wInfo"><b>${esc(w.name||'Workout')}</b><span id="wtimer">${timerText(w)}</span></button>`;
    trash = `<button class="home trash" data-a="delW" aria-label="Delete workout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg></button>`
  } else if (view.tab === 'ex' && view.exerciseId) {
    sub = true;
    left = `<button class="backIcon" data-a="back" aria-label="Back">‹</button><h1>${esc(exName(view.exerciseId))}</h1>`
  } else if (view.tab === 'rt' && view.routineId) {
    sub = true;
    left = `<button class="backIcon" data-a="back" aria-label="Back">‹</button><h1>${esc((S.routines[view.routineId]||{}).name||'Routine')}</h1>`
  } else if (view.tab === 'cd' && view.cardioId && S.workouts[view.cardioId]) {
    sub = true;
    left = `<button class="backIcon" data-a="back" aria-label="Back">‹</button><h1>${esc(S.workouts[view.cardioId].type||'Cardio')}</h1>`;
    trash = `<button class="home trash" data-a="delCardio" aria-label="Delete cardio session"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg></button>`
  } else left = `<h1>${{log:'Workouts',rt:'Routines',ex:'Exercises',set:'Settings',cd:'Cardio'}[view.tab]}</h1>`;
  $('#top').innerHTML = `${left}${trash}${sub?home:''}${dot}`
}

function autoGrow(t) {
  t.style.height = 'auto';
  t.style.height = (t.scrollHeight + 2) + 'px'
}

// The date box on the left of a workout card: small month (and year, if not this year) above a big day number.
function dateBox(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, dd);
  const mon = dt.toLocaleDateString(undefined, {
    month: 'short'
  });
  const yr = y !== new Date().getFullYear() ? ` '${String(y).slice(2)}` : '';
  const wd = dt.toLocaleDateString(undefined, {
    weekday: 'short'
  });
  return `<div class="dbox" aria-label="${esc(prettyDate(d))}"><span class="dmon">${esc(mon + yr)}</span><b class="dday">${dd}</b><span class="dwd">${esc(wd)}</span></div>`
}

function vLog() {
  const ws = liveW().sort(sortW);
  let h = `<button class="primary big" data-a="newWorkout">+ Start workout</button>`;
  const prog = ws.reduce((a, w) => a + (w.media || []).length, 0);
  if (prog) h += `<button class="ghost" data-a="progressGallery">Progress checks (${prog})</button>`;
  if (!ws.length) h += `<div class="empty">No workouts yet.<br>Start one, or bring in your Rep Count history from Settings.</div>`;
  let lm = '';
  for (const w of ws) {
    const mk = w.date.slice(0, 7);
    if (mk !== lm) {
      lm = mk;
      h += `<div class="month">${monthLabel(mk)}</div>`
    }
    const names = w.entries.map(e => exName(e.exId));
    const sets = w.entries.reduce((a, e) => a + e.sets.filter(x => hasData(x) && isWork(x)).length, 0);
    const stats = [];
    if (w.entries.length) stats.push(`${sets} sets · ${fmtVol(vol(w))} ${S.unit}`);
    if (mediaCount(w)) stats.push(`<span class="hmedia">${mediaCount(w)} ${CAM_ICON}</span>`);
    // date box | name (big) with sets and pounds under it | exercises as a vertical list
    const shown = names.length > 5 ? names.slice(0, 4) : names;
    h += `<button class="card wcard lift" data-a="openW" data-id="${w.id}">${dateBox(w.date)}
    <div class="wmain"><b class="wname">${esc(w.name||'Workout')}</b>${stats.length?`<div class="wstats">${stats.join(' · ')}</div>`:''}</div>
    <ul class="wex">${shown.map(n=>`<li>${esc(n)}</li>`).join('')}${names.length>shown.length?`<li class="more">+${names.length-shown.length} more</li>`:''}${names.length?'':'<li class="more">No exercises yet</li>'}</ul></button>`
  }
  return h
}

function timerText(w) {
  if (!w) return '';
  const end = w.finishedAt || now();
  const ms = end - (w.createdAt || end);
  if (w.finishedAt || (w.date === today() && ms < 8 * 3600e3 && ms >= 0)) {
    const t = Math.floor(Math.max(0, ms) / 1000),
      h = Math.floor(t / 3600),
      m = Math.floor(t / 60) % 60,
      sec = t % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec) + (w.finishedAt ? ' · done' : '')
  }
  return prettyDate(w.date)
}
setInterval(() => {
  const el = document.getElementById('wtimer');
  if (el && view.workoutId) el.textContent = timerText(S.workouts[view.workoutId])
}, 1000);

function vWorkout() {
  const w = S.workouts[view.workoutId];
  if (!w || w.deleted) {
    view.workoutId = null;
    return vLog()
  }
  let h = `<textarea class="wnotes" data-f="wnotes" rows="1" placeholder="Workout notes">${esc(w.notes||'')}</textarea>`;
  w.entries.forEach((en, i) => {
    const ex = S.exercises[en.exId];
    const last = lastFor(en.exId, w);
    const sum = settingsSummary(ex);
    h += `<div class="card ex"><div class="exTop"><button class="exName" data-a="exHist" data-id="${en.exId}">${esc(exName(en.exId))}</button>
      <button class="icon gear ${sum?'has':''}" data-a="machine" data-id="${en.exId}" aria-label="Machine settings">⚙︎</button><button class="icon" data-a="exMenu" data-i="${i}" aria-label="Exercise options">⋯</button></div>
    ${sum?`<button class="mline" data-a="machine" data-id="${en.exId}">${esc(sum)}</button>`:''}
    ${ex&&ex.notes?`<div class="cue">${esc(ex.notes)}</div>`:''}
    ${en.target?`<div class="target">Target: ${esc(en.target)} reps</div>`:''}
    <div class="set head"><span>SET</span><span>${S.unit.toUpperCase()}</span><span>REPS</span><span>NOTES</span><span></span></div>`;
    let wn = 0;
    en.sets.forEach((s, j) => {
      const ls = last && last.sets[j];
      const key = i + '-' + j;
      if (!s.warmup) wn++;
      const done = s.w !== '' && s.r !== '';
      const hasM = s.media && s.media.length;
      h += `<div class="set ${done?'done':''} ${s.warmup?'warm':''}"><button class="n ${s.warmup?'wu':''}" data-a="toggleWarm" data-i="${i}" data-j="${j}" aria-label="${s.warmup?'Warm-up set':'Set '+wn}. Tap to switch warm-up, hold for options">${s.warmup?'W':(done?'✓':wn)}</button>
      <input inputmode="decimal" data-f="w" data-i="${i}" data-j="${j}" value="${esc(s.w)}" placeholder="${ls&&ls.w!==''?esc(ls.w):''}" aria-label="Weight">
      <input inputmode="numeric" data-f="r" data-i="${i}" data-j="${j}" value="${esc(s.r)}" placeholder="${ls&&ls.r!==''?esc(ls.r):en.target?esc(tgtLow(en.target)):''}" aria-label="Reps">
      <textarea class="ni" data-f="note" data-i="${i}" data-j="${j}" rows="1" aria-label="Note for ${s.warmup?'warm-up':'set '+wn}">${esc(s.note||'')}</textarea>
      <button class="icon note vid ${hasM?'has':''}" data-a="note" data-i="${i}" data-j="${j}" aria-label="Set video">${VID_ICON}</button></div>`;
      if (openNotes.has(key)) h += `<div class="noteRow">${s.media&&s.media.length?`<div class="thumbs">${thumbsHtml(s.media)}</div>`:''}
        <div class="tools"><label class="addMedia">${VID_ICON} Add video<input type="file" accept="video/*,image/*" data-media="set" data-i="${i}" data-j="${j}" hidden></label></div></div>`
    });
    h += `<button class="addSet" data-a="addSet" data-i="${i}">+ Add set</button></div>`
  });
  h += `<button class="primary" data-a="addEx">+ Add exercise</button>

  <div class="card"><h3>Progress check</h3><div class="mut sm">Photos or video of you for this workout.</div>${(w.media||[]).length?`<div class="thumbs">${thumbsHtml(w.media,true)}</div>`:''}
  <label class="addMedia" style="margin-top:8px">+ Add photos or video<input type="file" accept="image/*,video/*" multiple data-media="workout" hidden></label></div>
  ${w.entries.length?`<div class="mut sm center">${fmtVol(vol(w))} ${S.unit} total volume</div>`:''}
  <button class="ghost" data-a="finishW">${w.finishedAt?'Done':'Finish workout'}</button>
  ${w.entries.length?`<button class="ghost" data-a="saveAsRoutine">${w.routineId&&S.routines[w.routineId]&&!S.routines[w.routineId].deleted?'Update routine with these exercises':'Save as routine'}</button>`:''}`;
  return h
}

function vExList() {
  const lu = lastUsedMap();
  const list = liveEx().sort((a, b) => a.name.localeCompare(b.name));
  let h = `<input class="search" data-f="exlq" placeholder="Search exercises" autocomplete="off"><button class="primary" data-a="newExSheet">+ New exercise</button>`;
  if (!list.length) h += `<div class="empty">No exercises yet. They're created as you log, or when you import.</div>`;
  list.sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
  let lc = null;
  for (const e of list) {
    const sum = settingsSummary(e);
    const cat = e.category || 'Other';
    if (cat !== lc) {
      lc = cat;
      h += `<div class="month" data-cat>${esc(cat)}</div>`
    }
    h += `<button class="card exrow" data-a="openEx" data-id="${e.id}" data-name="${esc((e.name+' '+(e.category||'')).toLowerCase())}"><div><b>${esc(e.name)}</b>${sum?`<div class="sm" style="color:#c9c8ff">⚙︎ ${esc(sum)}</div>`:''}<div class="mut sm">${lu[e.id]?'Last done '+prettyDate(lu[e.id]):'Not logged yet'}</div></div><span class="mut">›</span></button>`
  }
  return h
}

function msEditor(ex) {
  return `<label class="lbl" style="margin-top:0">⚙︎ Machine settings</label><textarea data-f="machine" data-id="${ex.id}" rows="2" placeholder="e.g. Seat 4, back pad 2, handles wide">${esc(settingsSummary(ex))}</textarea>
  <label class="lbl">Notes / cues</label><textarea data-f="exnotes" data-id="${ex.id}" rows="2" placeholder="e.g. Grip one notch wider, slow negatives">${esc(ex.notes||'')}</textarea>`
}

function vExercise() {
  const ex = S.exercises[view.exerciseId];
  if (!ex || ex.deleted) {
    view.exerciseId = null;
    return vExList()
  }
  const hist = historyFor(ex.id);
  let best = 0,
    heavy = 0;
  for (const hst of hist)
    for (const s of hst.sets) {
      best = Math.max(best, e1rm(s));
      heavy = Math.max(heavy, s.warmup ? 0 : (num(s.w) || 0))
    }
  let h = `<input class="title" data-f="exname" data-id="${ex.id}" value="${esc(ex.name)}" style="margin-bottom:8px"><input data-f="excat" data-id="${ex.id}" value="${esc(ex.category||'')}" placeholder="Muscle group (e.g. Lats)" list="cats" style="margin-bottom:12px"><datalist id="cats">${[...new Set(liveEx().map(e=>e.category).filter(Boolean))].sort().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  <div class="stats"><div><b>${best?fmtNum(best):'–'}</b><span>est. 1RM</span></div><div><b>${heavy?fmtNum(heavy):'–'}</b><span>heaviest</span></div><div><b>${hist.length}</b><span>sessions</span></div></div>
  <div class="card">${msEditor(ex)}</div><div class="month">History</div>`;
  if (!hist.length) h += `<div class="empty">No sets logged yet.</div>`;
  for (const {
      w,
      sets
    }
    of hist) h += `<div class="card hist"><button class="block" style="text-align:left" data-a="openWfromEx" data-id="${w.id}"><div class="row"><b>${prettyDate(w.date)}</b><span class="mut sm">${esc(w.name||'')}</span></div></button><div class="sets">${sets.map(s=>esc(fmtSet(s))+(s.note?` <i>— ${esc(s.note)}</i>`:'')+(s.media&&s.media.length?` <span class="hmedia">${VID_ICON}${s.media.length>1?'×'+s.media.length:''}</span>`:'')).join('<br>')}</div>${sets.some(s=>s.media&&s.media.length)?`<div class="thumbs">${sets.flatMap(s=>s.media||[]).map(m=>thumbsHtml([m])).join('')}</div>`:''}</div>`;
  h += `<button class="link red center block" data-a="delEx">Delete exercise</button>`;
  return h
}

function vSettings() {
  return `
  <div class="card"><h3>Units</h3><div class="seg"><button data-a="unit" data-u="lb" class="${S.unit==='lb'?'on':''}">lb</button><button data-a="unit" data-u="kg" class="${S.unit==='kg'?'on':''}">kg</button></div>
  <div class="mut sm">This changes the label only; numbers you've logged stay as typed. Imports get converted to this unit.</div></div>
  <div class="card"><h3>Import from Rep Count</h3><ol class="sm">
    <li>In Rep Count, open the <b>Statistics</b> tab. On iPhone, scroll to the bottom; on Android, tap the menu in the top right.</li>
    <li>Tap the CSV export (it's a Rep Count Premium feature) and save the file to Files.</li>
    <li>Choose that file here, check the column matching, and import.</li></ol>
    <label class="filebtn primary">Choose CSV file<input type="file" accept=".csv,text/csv,text/plain,text/comma-separated-values" id="csvFile" hidden></label>
    <div class="mut sm">CSV exports from Strong, Hevy, FitNotes and similar apps work too. Importing the same file again updates those workouts instead of duplicating them.</div></div>
  <div class="card"><h3>Sync with GitHub</h3><div class="sm" id="syncLine" style="margin-bottom:8px">${esc(syncLabel())}</div>
    ${gh?`<label class="toggle"><span>Also back up videos to GitHub<br><span class="mut sm">Photos always back up. Videos are big, so this uses more data and repo space (videos over 40 MB stay on the phone).</span></span><input type="checkbox" id="syncVid" ${syncVideosOn()?'checked':''}></label><button class="ghost" data-a="syncNow">Sync now</button><button class="link red" data-a="ghDisconnect">Disconnect this phone</button>`:`
    <ol class="sm"><li>On GitHub, make a <b>fine-grained token</b> with access to only your data repo and <b>Contents: Read and write</b>.</li><li>Paste it below and tap Connect. Your workouts then save to the repo automatically, and any device you connect gets the same data.</li></ol>
    <input id="ghRepo" value="shfriedland/lift-log-data" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-bottom:8px">
    <input id="ghToken" type="password" placeholder="Paste token (github_pat_…)" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button class="primary" style="margin-top:10px" data-a="ghConnect">Connect</button>`}</div>
  <div class="card"><h3>Backup</h3>
    <button class="ghost" data-a="downloadBackup">Download backup file</button>
    <button class="ghost" data-a="copyBackup">Copy backup to clipboard</button>
    <label class="filebtn ghost">Restore from a backup file<input type="file" accept=".json,.txt,application/json,text/plain" id="jsonFile" hidden></label>
    <button class="ghost" data-a="pasteRestore">Restore from pasted text</button></div>
  <div class="mut sm center">${liveW().length} workouts · ${liveC().length} cardio · ${liveEx().length} exercises · app version ${APP_VERSION}</div>`
}

function vRoutines() {
  const rs = liveR();
  let h = `<button class="primary" data-a="newRoutine">+ New routine</button>`;
  if (!rs.length) {
    h += `<div class="empty">No routines yet. A routine is a saved list of exercises. Tap Start and they all load with blanks for weight and reps.</div>`;
    if (liveW().some(w => w.entries.length)) h += `<button class="ghost" data-a="routinesFromHistory">Build routines from my past workouts</button>`
  }
  for (const r of rs) {
    let ld = '';
    for (const w of liveW())
      if (w.routineId === r.id && w.date > ld) ld = w.date;
    const names = r.exercises.map(e => exName(e.exId));
    h += `<div class="card"><button class="rtTap" data-a="openR" data-id="${r.id}"><div class="row"><b>${esc(r.name||'Routine')}</b><span class="mut sm">${r.exercises.length} exercise${r.exercises.length===1?'':'s'} ›</span></div>
    <div class="mut sm">${names.length?esc(names.join(', ')):'No exercises yet'}</div><div class="mut sm">${ld?'Last done '+prettyDate(ld):'Not done yet'}</div></button>
    <button class="primary startBtn" data-a="startR" data-id="${r.id}">Start</button></div>`
  }
  return h
}

function vRoutine() {
  const r = S.routines[view.routineId];
  if (!r || r.deleted) {
    view.routineId = null;
    return vRoutines()
  }
  let h = `<input class="title" data-f="rtname" value="${esc(r.name)}" placeholder="Routine name">`;
  if (!r.exercises.length) h += `<div class="empty">Add the exercises for this routine.</div>`;
  r.exercises.forEach((e, i) => {
    const sum = settingsSummary(S.exercises[e.exId]);
    h += `<div class="card"><div class="exTop"><b class="exName" style="color:var(--text)">${esc(exName(e.exId))}</b>
    ${i>0?`<button class="icon" data-a="rtMove" data-i="${i}" data-dir="-1" aria-label="Move up">↑</button>`:''}${i<r.exercises.length-1?`<button class="icon" data-a="rtMove" data-i="${i}" data-dir="1" aria-label="Move down">↓</button>`:''}<button class="icon gear ${sum?'has':''}" data-a="machine" data-id="${e.exId}" aria-label="Machine settings">⚙︎</button><button class="icon red" data-a="rtRemove" data-i="${i}" aria-label="Remove">×</button></div>${sum?`<button class="mline" data-a="machine" data-id="${e.exId}">${esc(sum)}</button>`:''}
    <div class="rtRow"><span class="mut sm">Warm-ups</span><div class="stepper"><button data-a="rtWarm" data-i="${i}" data-d="-1">−</button><b>${e.warm||0}</b><button data-a="rtWarm" data-i="${i}" data-d="1">+</button></div><span></span><span></span></div>
    <div class="rtRow"><span class="mut sm">Sets</span><div class="stepper"><button data-a="rtSets" data-i="${i}" data-d="-1">−</button><b>${e.sets}</b><button data-a="rtSets" data-i="${i}" data-d="1">+</button></div>
    <span class="mut sm">Reps</span><input data-f="rttarget" data-i="${i}" value="${esc(e.target||'')}" placeholder="e.g. 8-10"></div>
    </div>`
  });
  h += `<button class="ghost" data-a="addExR">+ Add exercise</button>
  <button class="primary" data-a="startR" data-id="${r.id}">Start this routine</button>
  <button class="link red center block" data-a="delR">Delete routine</button>`;
  return h
}

function upsertRoutineFrom(w, existing) {
  const r = existing || {
    id: newId(),
    createdAt: now(),
    exercises: []
  };
  const old = {};
  for (const e of r.exercises || []) old[e.exId] = e;
  r.name = w.name || r.name || 'Routine';
  r.exercises = w.entries.map(en => {
    const ss = en.sets;
    const warm = ss.filter(x => x.warmup).length;
    return {
      exId: en.exId,
      warm,
      sets: Math.max(1, ss.length - warm),
      target: (old[en.exId] && old[en.exId].target) || en.target || ''
    }
  });
  r.deleted = false;
  S.routines[r.id] = r;
  touchR(r);
  return r
}

// ---------- cardio ----------
function vCardioList() {
  const cs = liveC().sort(sortW);
  let h = `<button class="primary big" data-a="logCardio">+ Log cardio</button>`;
  if (!cs.length) h += `<div class="empty">No cardio yet.<br>Log a run, ride, row or anything else here.</div>`;
  let lm = '';
  for (const c of cs) {
    const mk = c.date.slice(0, 7);
    if (mk !== lm) {
      lm = mk;
      h += `<div class="month">${monthLabel(mk)}</div>`
    }
    const sum = cardioSummary(c),
      pace = paceText(c);
    h += `<button class="card wcard" data-a="openCardio" data-id="${c.id}">${dateBox(c.date)}<div class="wbody"><b>${esc(c.type||'Cardio')}</b>
    <div class="mut sm">${sum?esc(sum):'Nothing logged yet'}</div>${pace?`<div class="mut sm">${esc(pace)}</div>`:''}${c.note?`<div class="mut sm cnote">${esc(c.note)}</div>`:''}</div></button>`
  }
  return h
}

function vCardio() {
  const c = S.workouts[view.cardioId];
  if (!c || c.deleted || !isCardio(c)) {
    view.cardioId = null;
    return vCardioList()
  }
  const last = lastCardio(c.type, c),
    du = c.du || 'mi';
  const types = CARDIO_TYPES.concat(CARDIO_TYPES.includes(c.type) ? [] : [c.type]);
  return `<div class="card cform">
    <div class="cfield"><label class="lbl" for="cType">Type</label><select id="cType" class="ctype" data-f="cType">${types.map(t=>`<option ${t===c.type?'selected':''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="cfield"><label class="lbl" for="cDate">Date</label><input id="cDate" type="date" data-f="cDate" value="${c.date}"></div>
    <div class="cbig">
      <label><span class="lbl">Time (min)</span><input inputmode="decimal" data-f="cMin" value="${esc(c.min)}" placeholder="${last&&last.min!==''?esc(last.min):'0'}" autocomplete="off"></label>
      <label><span class="lbl">Distance (${esc(du)})</span><input inputmode="decimal" data-f="cDist" value="${esc(c.dist)}" placeholder="${last&&last.dist!==''?esc(last.dist):'0'}" autocomplete="off"></label>
    </div>
    <div class="pace" id="cPace">${esc(paceText(c))}</div>
    <label class="lbl" for="cNote">Notes</label><textarea id="cNote" data-f="cNote" rows="2" placeholder="How it felt, route, heart rate…">${esc(c.note||'')}</textarea>
  </div>
  <button class="ghost" data-a="back">Done</button>`
}
