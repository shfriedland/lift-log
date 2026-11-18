// Button actions. Every data-a="name" in the HTML calls ACT.name(dataset).
"use strict";

const curW = () => S.workouts[view.workoutId];

function go(v) {
  const from = Object.assign({}, view);
  Object.assign(view, v);
  withTransition(navDirection(from, view), () => {
    openNotes.clear();
    // Jump to the top before swapping in the new page, so the page never shrinks while scrolled down.
    // On iPhone that shrink could make the fixed tab bar jump out of place.
    window.scrollTo(0, 0);
    render()
  })
}

function newWorkout(entries, name, routineId) {
  const w = {
    id: newId(),
    date: today(),
    name: name || 'Workout',
    entries: entries || [],
    notes: '',
    createdAt: now(),
    updatedAt: now()
  };
  if (routineId) w.routineId = routineId;
  S.workouts[w.id] = w;
  touchW(w);
  sheetCtx = null;
  hideSheet();
  go({
    tab: 'log',
    workoutId: w.id
  })
}

function pickEx(id) {
  if (sheetCtx && sheetCtx.target === 'replace') {
    const w = curW(),
      en = w && w.entries[sheetCtx.i];
    if (en) {
      en.exId = id;
      touchW(w)
    }
    closeSheet();
    return
  }
  if (sheetCtx && sheetCtx.target === 'routine') {
    const r = S.routines[view.routineId];
    if (r) {
      r.exercises.push({
        exId: id,
        sets: 3,
        warm: 0,
        target: ''
      });
      touchR(r)
    }
    closeSheet();
    return
  }
  const w = curW();
  if (!w) return;
  const last = lastFor(id, w);
  const n = last ? last.sets.length : 3;
  w.entries.push({
    exId: id,
    sets: Array.from({
      length: n
    }, (_, j) => Object.assign(blankSet(), last && last.sets[j] && last.sets[j].warmup ? {
      warmup: true
    } : {}))
  });
  touchW(w);
  closeSheet()
}
const ACT = {
  back() {
    go({
      log: {
        workoutId: null
      },
      ex: {
        exerciseId: null
      },
      rt: {
        routineId: null
      },
      cd: {
        cardioId: null
      }
    } [view.tab] || {})
  },
  newWorkout: sheetNew,
  startEmpty() {
    newWorkout()
  },
  startRepeat(d) {
    const src = liveW().sort(sortW).find(w => w.name === d.n);
    if (!src) return;
    newWorkout(src.entries.map(e => {
      const ss = e.sets.filter(hasData);
      return {
        exId: e.exId,
        sets: ss.length ? ss.map(x => Object.assign(blankSet(), x.warmup ? {
          warmup: true
        } : {})) : [blankSet()]
      }
    }), src.name)
  },
  openW(d) {
    go({
      workoutId: d.id
    })
  },
  openWfromEx(d) {
    go({
      tab: 'log',
      workoutId: d.id
    })
  },
  addEx() {
    sheetAddEx('workout')
  },
  addExR() {
    sheetAddEx('routine')
  },
  newRoutine() {
    const r = {
      id: newId(),
      name: 'New routine',
      exercises: [],
      createdAt: now()
    };
    S.routines[r.id] = r;
    touchR(r);
    go({
      routineId: r.id
    });
    const t = document.querySelector('input[data-f="rtname"]');
    if (t) {
      t.focus();
      t.select()
    }
  },
  openR(d) {
    go({
      routineId: d.id
    })
  },
  startR(d) {
    const r = S.routines[d.id];
    if (!r) return;
    if (!r.exercises.length) {
      toast('Add exercises to this routine first');
      go({
        tab: 'rt',
        routineId: r.id
      });
      return
    }
    newWorkout(r.exercises.map(e => {
      const warm = e.warm || 0;
      const last = warm ? null : lastFor(e.exId, {
        id: null,
        date: today(),
        name: r.name,
        routineId: r.id
      });
      return {
        exId: e.exId,
        target: e.target || '',
        sets: [...Array.from({
          length: warm
        }, () => Object.assign(blankSet(), {
          warmup: true
        })), ...Array.from({
          length: Math.max(1, e.sets || 3)
        }, (_, j) => Object.assign(blankSet(), last && last.sets[j] && last.sets[j].warmup ? {
          warmup: true
        } : {}))]
      }
    }), r.name, r.id)
  },
  rtMove(d) {
    const r = S.routines[view.routineId],
      i = +d.i,
      k = i + +d.dir;
    [r.exercises[i], r.exercises[k]] = [r.exercises[k], r.exercises[i]];
    touchR(r);
    render()
  },
  rtRemove(d) {
    const r = S.routines[view.routineId];
    r.exercises.splice(+d.i, 1);
    touchR(r);
    render()
  },
  rtWarm(d) {
    const e = S.routines[view.routineId].exercises[+d.i];
    e.warm = Math.min(10, Math.max(0, (e.warm || 0) + +d.d));
    touchR(S.routines[view.routineId]);
    render()
  },
  rtSets(d) {
    const e = S.routines[view.routineId].exercises[+d.i];
    e.sets = Math.min(20, Math.max(1, (e.sets || 3) + +d.d));
    touchR(S.routines[view.routineId]);
    render()
  },
  delR() {
    const r = S.routines[view.routineId];
    confirmSheet(`Delete ${r.name}?`, 'Past workouts from this routine stay in your log.', 'Delete routine', () => {
      r.deleted = true;
      touchR(r);
      view.routineId = null
    })
  },
  saveAsRoutine() {
    const w = curW();
    let r = w.routineId && S.routines[w.routineId] && !S.routines[w.routineId].deleted ? S.routines[w.routineId] : liveR().find(x => x.name.toLowerCase() === (w.name || '').toLowerCase());
    const was = !!r;
    r = upsertRoutineFrom(w, r);
    w.routineId = r.id;
    touchW(w);
    render();
    toast(was ? `Updated routine “${r.name}”` : `Saved routine “${r.name}”`)
  },
  routinesFromHistory() {
    const seen = new Set();
    let n = 0;
    for (const w of liveW().sort(sortW)) {
      const k = (w.name || '').toLowerCase();
      if (!w.entries.length || seen.has(k)) continue;
      seen.add(k);
      upsertRoutineFrom(w, null);
      n++;
      if (n >= 12) break
    }
    render();
    toast(`Made ${n} routine${n===1?'':'s'}. Tap one to edit it.`)
  },
  pickEx(d) {
    pickEx(d.id)
  },
  replaceEx(d) {
    sheetReplaceEx(+d.i)
  },
  exFilterAll() {
    sheetCtx.catOnly = false;
    renderExResults($('#exq')?.value || '')
  },
  exFilterCat() {
    sheetCtx.catOnly = true;
    renderExResults($('#exq')?.value || '')
  },
  createEx(d) {
    const id = newId();
    S.exercises[id] = {
      id,
      name: d.n,
      category: sheetCtx && sheetCtx.catOnly ? sheetCtx.cat : '',
      settings: [],
      notes: '',
      createdAt: now(),
      updatedAt: now()
    };
    touchEx(S.exercises[id]);
    pickEx(id)
  },
  newExSheet() {
    sheetCtx = {
      type: 'newEx'
    };
    openSheet(`<h2>New exercise</h2><input id="newExName" placeholder="e.g. Hammer Strength Chest Press" autocomplete="off"><button class="primary" style="margin-top:12px" data-a="createExStandalone">Create</button>`)
  },
  createExStandalone() {
    const n = ($('#newExName')?.value || '').trim();
    if (!n) return;
    const dupe = liveEx().find(e => e.name.toLowerCase() === n.toLowerCase());
    if (dupe) {
      sheetCtx = null;
      hideSheet();
      go({
        exerciseId: dupe.id
      });
      return
    }
    const id = newId();
    S.exercises[id] = {
      id,
      name: n,
      settings: [],
      notes: '',
      createdAt: now(),
      updatedAt: now()
    };
    touchEx(S.exercises[id]);
    sheetCtx = null;
    hideSheet();
    go({
      exerciseId: id
    })
  },
  openEx(d) {
    go({
      exerciseId: d.id
    })
  },
  exHist(d) {
    go({
      tab: 'ex',
      exerciseId: d.id
    })
  },
  setMenu(d) {
    const w = curW(),
      st = w.entries[+d.i].sets[+d.j];
    sheetCtx = {
      type: 'setMenu'
    };
    openSheet(`<h2>${esc(exName(w.entries[+d.i].exId))} · ${st.warmup?'warm-up':'set '+(w.entries[+d.i].sets.slice(0,+d.j+1).filter(isWork).length)}</h2>
    <button class="ghost left" data-a="toggleWarmSheet" data-i="${d.i}" data-j="${d.j}">${st.warmup?'Make it a working set':'Make it a warm-up'}</button>
    <button class="ghost left red" data-a="delSetSheet" data-i="${d.i}" data-j="${d.j}">Delete this set</button>`)
  },
  toggleWarmSheet(d) {
    ACT.toggleWarm(d);
    closeSheet()
  },
  delSetSheet(d) {
    ACT.delSet(d);
    closeSheet()
  },
  removeLastSet(d) {
    const w = curW(),
      en = w.entries[+d.i];
    if (en.sets.length) en.sets.pop();
    openNotes.clear();
    touchW(w);
    closeSheet()
  },
  wInfo() {
    const w = curW();
    if (!w) return;
    sheetCtx = {
      type: 'wInfo'
    };
    openSheet(`<h2>Workout</h2><label class="lbl" style="margin-top:0">Name</label><input data-f="wname" value="${esc(w.name)}" placeholder="Workout name">
    <label class="lbl">Date</label><input type="date" data-f="wdate" value="${w.date}"><button class="primary" style="margin-top:14px" data-a="closeSheet">Done</button>`)
  },
  finishW() {
    const w = curW();
    if (w && !w.finishedAt) {
      w.finishedAt = now();
      touchW(w)
    }
    go({
      workoutId: null
    })
  },
  home() {
    sheetCtx = null;
    hideSheet();
    go({
      tab: 'log',
      workoutId: null,
      exerciseId: null,
      routineId: null,
      cardioId: null
    })
  },
  toggleWarm(d) {
    const w = curW(),
      s = w.entries[+d.i].sets[+d.j];
    s.warmup = !s.warmup;
    if (!s.warmup) delete s.warmup;
    touchW(w);
    render()
  },
  addSet(d) {
    const w = curW(),
      en = w.entries[+d.i],
      p = en.sets[en.sets.length - 1];
    en.sets.push(p ? {
      w: p.w,
      r: p.r,
      note: '',
      done: false
    } : blankSet());
    touchW(w);
    render()
  },
  note(d) {
    const key = d.i + '-' + d.j;
    if (openNotes.has(key)) openNotes.delete(key);
    else openNotes.add(key);
    render()
  },
  delSet(d) {
    const w = curW();
    w.entries[+d.i].sets.splice(+d.j, 1);
    openNotes.clear();
    touchW(w);
    render()
  },
  exMenu(d) {
    const i = +d.i,
      w = curW(),
      en = w.entries[i];
    sheetCtx = {
      type: 'exMenu',
      i
    };
    openSheet(`<h2>${esc(exName(en.exId))}</h2><button class="ghost left" data-a="machine" data-id="${en.exId}">⚙︎ Machine settings</button><button class="ghost left" data-a="replaceEx" data-i="${i}">⇄ Replace exercise</button><button class="ghost left" data-a="exHist" data-id="${en.exId}">History &amp; PRs</button>${i>0?`<button class="ghost left" data-a="exMove" data-i="${i}" data-dir="-1">↑ Move up</button>`:''}${i<w.entries.length-1?`<button class="ghost left" data-a="exMove" data-i="${i}" data-dir="1">↓ Move down</button>`:''}${en.sets.length?`<button class="ghost left" data-a="removeLastSet" data-i="${i}">− Remove last set</button>`:''}<button class="ghost left red" data-a="exRemove" data-i="${i}">Remove from this workout</button>`)
  },
  exMove(d) {
    const w = curW(),
      i = +d.i,
      k = i + +d.dir;
    [w.entries[i], w.entries[k]] = [w.entries[k], w.entries[i]];
    touchW(w);
    closeSheet()
  },
  exRemove(d) {
    const w = curW();
    w.entries.splice(+d.i, 1);
    touchW(w);
    closeSheet()
  },
  machine(d) {
    sheetMachine(d.id)
  },
  logCardio() {
    // start with the type logged most recently, so a regular run is one tap
    const prev = liveC().sort(sortW)[0];
    const c = {
      id: newId(),
      kind: 'cardio',
      date: today(),
      type: prev ? prev.type : 'Run',
      min: '',
      dist: '',
      du: distUnit(),
      note: '',
      entries: [],
      createdAt: now(),
      updatedAt: now()
    };
    S.workouts[c.id] = c;
    touchW(c);
    go({
      tab: 'cd',
      cardioId: c.id
    })
  },
  openCardio(d) {
    go({
      cardioId: d.id
    })
  },
  delCardio() {
    confirmSheet('Delete this cardio session?', 'This can’t be undone.', 'Delete', () => {
      const c = S.workouts[view.cardioId];
      if (!c) return;
      c.deleted = true;
      touchW(c);
      view.cardioId = null
    })
  },
  delW() {
    confirmSheet('Delete this workout?', 'This can’t be undone.', 'Delete workout', () => {
      const w = curW();
      w.deleted = true;
      w.entries = [];
      touchW(w);
      view.workoutId = null
    })
  },
  delEx() {
    const ex = S.exercises[view.exerciseId];
    confirmSheet(`Delete ${ex.name}?`, 'It disappears from your exercise list. Past workouts keep their sets.', 'Delete exercise', () => {
      ex.deleted = true;
      touchEx(ex);
      view.exerciseId = null
    })
  },
  confirmOk() {
    const fn = sheetCtx && sheetCtx.fn;
    if (fn) fn();
    closeSheet();
    window.scrollTo(0, 0)
  },
  closeSheet,
  unit(d) {
    S.unit = d.u;
    S.unitAt = now();
    markDirty('meta');
    saveLocal();
    render()
  },
  doImport,
  async copyBackup() {
    const txt = JSON.stringify({
      app: 'liftlog',
      v: 1,
      unit: S.unit,
      unitAt: S.unitAt,
      exercises: S.exercises,
      workouts: S.workouts,
      routines: S.routines
    });
    try {
      await navigator.clipboard.writeText(txt);
      toast('Backup copied. Paste it into Notes or a file to keep it.')
    } catch (e) {
      sheetCtx = {
        type: 'copy'
      };
      openSheet(`<h2>Backup</h2><div class="mut sm">Select all of this text and copy it somewhere safe.</div><textarea readonly style="height:240px;font-size:12px">${esc(txt)}</textarea><button class="ghost" data-a="closeSheet">Close</button>`)
    }
  },
  downloadBackup() {
    const txt = JSON.stringify({
      app: 'liftlog',
      v: 1,
      unit: S.unit,
      unitAt: S.unitAt,
      exercises: S.exercises,
      workouts: S.workouts,
      routines: S.routines
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], {
      type: 'application/json'
    }));
    a.download = 'lift-log-backup-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove()
    }, 1000);
    toast('Backup saved')
  },
  pasteRestore() {
    sheetCtx = {
      type: 'paste'
    };
    openSheet(`<h2>Restore backup</h2><textarea id="pasteBox" style="height:200px;font-size:13px" placeholder="Paste backup text here"></textarea><button class="primary" style="margin-top:12px" data-a="doPaste">Restore</button>`)
  },
  doPaste() {
    restoreText($('#pasteBox').value)
  },
  viewMedia(d) {
    viewMedia(d.id)
  },
  delMedia(d) {
    const f = findMedia(d.id);
    confirmSheet(`Delete this ${f?f.m.type:'item'}?`, 'It’s removed from this workout and from your backup.', 'Delete', () => deleteMedia(d.id))
  },
  async shareMedia(d) {
    const f = findMedia(d.id);
    if (!f) return;
    const b = await getBlob(f.m);
    if (!b) return toast('Not available on this phone');
    const file = new File([b], f.m.file, {
      type: f.m.mime
    });
    try {
      if (navigator.canShare && navigator.canShare({
          files: [file]
        })) {
        await navigator.share({
          files: [file]
        });
        return
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = f.m.file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove()
    }, 2000)
  },
  progressGallery() {
    const ws = liveW().filter(w => (w.media || []).length).sort(sortW);
    sheetCtx = {
      type: 'gallery'
    };
    openSheet(`<h2>Progress checks</h2>${ws.map(w=>`<div class="lbl">${prettyDate(w.date)} · ${esc(w.name||'')}</div><div class="thumbs">${thumbsHtml(w.media,true)}</div>`).join('')}`)
  },
  ghConnect() {
    ghConnect($('#ghRepo').value, $('#ghToken').value)
  },
  ghDisconnect() {
    confirmSheet('Disconnect GitHub on this phone?', 'Your data stays on this phone and in the repo. You’d need to paste the token again to reconnect.', 'Disconnect', ghDisconnect)
  },
  async syncNow() {
    const ok = await pull();
    if (ok) {
      render();
      toast('Synced')
    }
  }
};
