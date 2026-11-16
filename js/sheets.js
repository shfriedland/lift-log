// Bottom sheets: start workout, exercise picker (add / replace), machine settings, confirm.
"use strict";

function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheetWrap').classList.add('on');
  $('#sheet').scrollTop = 0;
  $('#sheet').querySelectorAll('textarea').forEach(autoGrow)
}

function closeSheet() {
  $('#sheetWrap').classList.remove('on');
  sheetCtx = null;
  if (viewURL) {
    const v = $('#mv video');
    if (v) v.pause();
    URL.revokeObjectURL(viewURL);
    viewURL = null
  }
  render()
}

function confirmSheet(title, msg, ok, fn) {
  sheetCtx = {
    type: 'confirm',
    fn
  };
  openSheet(`<h2>${esc(title)}</h2><p class="mut">${esc(msg)}</p><button class="primary" style="background:var(--red);color:#fff" data-a="confirmOk">${esc(ok)}</button><button class="ghost" data-a="closeSheet">Cancel</button>`)
}

function sheetNew() {
  const names = [];
  for (const w of liveW().sort(sortW)) {
    if (w.name && w.entries.length && !names.includes(w.name)) names.push(w.name);
    if (names.length >= 6) break
  }
  const rs = liveR();
  sheetCtx = {
    type: 'new'
  };
  openSheet(`<h2>Start workout</h2>${rs.length?'<div class="lbl">Routines</div>':''}${rs.map(r=>`<button class="ghost left" data-a="startR" data-id="${r.id}">▶ ${esc(r.name)} <span class="mut sm">· ${r.exercises.length} exercises</span></button>`).join('')}<div class="lbl">Or</div><button class="primary" data-a="startEmpty">Empty workout</button>${names.length?'<div class="lbl">Repeat a past workout</div>':''}${names.map(n=>`<button class="ghost left" data-a="startRepeat" data-n="${esc(n)}">↻ ${esc(n)}</button>`).join('')}`)
}

function sheetAddEx(target) {
  sheetCtx = {
    type: 'addEx',
    target: target || 'workout'
  };
  openSheet(`<h2>Add exercise</h2><input id="exq" placeholder="Search or type a new name…" autocomplete="off"><div id="exResults"></div>`);
  renderExResults('')
}

function sheetReplaceEx(i) {
  const en = curW().entries[i],
    cur = S.exercises[en.exId],
    cat = (cur && cur.category) || '';
  sheetCtx = {
    type: 'addEx',
    target: 'replace',
    i,
    skip: en.exId,
    cat,
    catOnly: !!cat
  };
  openSheet(`<h2>Replace ${esc(exName(en.exId))}</h2><input id="exq" placeholder="Search or type a new name…" autocomplete="off"><div id="exFilter"></div><div id="exResults"></div>`);
  renderExResults('')
}

function renderExResults(q) {
  const lu = lastUsedMap();
  const ql = q.trim().toLowerCase();
  const c = sheetCtx || {};
  const cl = (c.cat || '').toLowerCase();
  const fb = $('#exFilter');
  if (fb) fb.innerHTML = c.cat ? (c.catOnly ? `<div class="exFilter"><span>Showing <b>${esc(c.cat)}</b> only</span><button class="link" data-a="exFilterAll">Show all ✕</button></div>` : `<div class="exFilter"><span>Showing all exercises</span><button class="link" data-a="exFilterCat">Only ${esc(c.cat)}</button></div>`) : '';
  const list = liveEx().filter(e => e.id !== c.skip && (!c.catOnly || (e.category || '').toLowerCase() === cl) && e.name.toLowerCase().includes(ql)).sort((a, b) => (lu[b.id] || '').localeCompare(lu[a.id] || '') || a.name.localeCompare(b.name));
  let h = '';
  if (ql && !list.some(e => e.name.toLowerCase() === ql)) h += `<button class="pick" data-a="createEx" data-n="${esc(q.trim())}"><b style="color:var(--acc)">+ Create “${esc(q.trim())}”</b></button>`;
  for (const e of list.slice(0, 80)) {
    const sum = settingsSummary(e);
    const sub = [e.category, sum ? '⚙︎ ' + sum : ''].filter(Boolean).join(' · ');
    h += `<button class="pick" data-a="pickEx" data-id="${e.id}"><b>${esc(e.name)}</b>${sub?`<div class="mut sm">${esc(sub)}</div>`:''}</button>`
  }
  if (!h) h = `<div class="mut sm" style="padding:14px 4px">${c.catOnly?'No other '+esc(c.cat)+' exercises yet.':'Type a name to create your first exercise.'}</div>`;
  $('#exResults').innerHTML = h
}

function sheetMachine(id) {
  const ex = S.exercises[id];
  if (!ex) return;
  sheetCtx = {
    type: 'machine',
    id
  };
  openSheet(`<h2>⚙︎ ${esc(ex.name)}</h2><textarea data-f="machine" data-id="${id}" rows="3" placeholder="e.g. Seat 4, back pad 2, handles wide">${esc(settingsSummary(ex))}</textarea><button class="primary" style="margin-top:12px" data-a="closeSheet">Done</button>`);
  const t = $('#sheet textarea');
  if (t) {
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length)
  }
}
