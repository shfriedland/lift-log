// Event wiring (taps, long-press, typing, file pickers) and startup. Loads last.
"use strict";

let lpTimer = null,
  lpFired = false;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-a="toggleWarm"]');
  if (!b) return;
  lpFired = false;
  clearTimeout(lpTimer);
  lpTimer = setTimeout(() => {
    lpFired = true;
    haptic();
    ACT.setMenu(b.dataset)
  }, 500)
});
['pointerup', 'pointercancel', 'pointermove'].forEach(ev => document.addEventListener(ev, e => {
  if (ev === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return;
  clearTimeout(lpTimer)
}));
document.addEventListener('contextmenu', e => {
  if (e.target.closest('[data-a="toggleWarm"]')) e.preventDefault()
});
document.addEventListener('click', e => {
  if (e.target.id === 'sheetWrap') {
    closeSheet();
    return
  }
  if (lpFired && e.target.closest('[data-a="toggleWarm"]')) {
    lpFired = false;
    return
  }
  const b = e.target.closest('[data-a],[data-tab]');
  if (!b) return;
  if (b.dataset.tab) {
    // A tab always opens on its main list, never on whatever was left open inside it.
    go({
      tab: b.dataset.tab,
      workoutId: null,
      exerciseId: null,
      routineId: null,
      cardioId: null
    });
    return
  }
  const fn = ACT[b.dataset.a];
  if (fn) fn(b.dataset, b)
});
document.addEventListener('input', e => {
  const t = e.target,
    f = t.dataset.f;
  if (t.tagName === 'TEXTAREA') autoGrow(t);
  if (t.id === 'exq') {
    renderExResults(t.value);
    return
  }
  if (!f) return;
  if (f === 'exlq') {
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.exrow').forEach(el => el.style.display = el.dataset.name.includes(q) ? '' : 'none');
    document.querySelectorAll('[data-cat]').forEach(hd => {
      let n = hd.nextElementSibling,
        any = false;
      while (n && n.classList.contains('exrow')) {
        if (n.style.display !== 'none') any = true;
        n = n.nextElementSibling
      }
      hd.style.display = any ? '' : 'none'
    });
    return
  }
  if (f === 'impmap') {
    imp.map[t.dataset.k] = +t.value;
    renderImport();
    return
  }
  if (f === 'impunit') {
    imp.unitMode = t.value;
    renderImport();
    return
  }
  if (f === 'rtname' || f === 'rttarget') {
    const r = S.routines[view.routineId];
    if (!r) return;
    if (f === 'rtname') r.name = t.value;
    else r.exercises[+t.dataset.i].target = t.value.trim();
    touchR(r);
    return
  }
  if (['wname', 'wdate', 'wnotes', 'w', 'r', 'note'].includes(f)) {
    const w = curW();
    if (!w) return;
    const pm = monthOf(w);
    if (f === 'wname') w.name = t.value;
    else if (f === 'wdate') {
      if (!t.value) return;
      w.date = t.value
    } else if (f === 'wnotes') w.notes = t.value;
    else {
      const s = w.entries[+t.dataset.i].sets[+t.dataset.j];
      s[f] = t.value;
      if (f === 'w' || f === 'r') {
        s.done = s.w !== '' && s.r !== '';
        const row = t.closest('.set');
        if (row) row.classList.toggle('done', s.done)
      }
    }
    touchW(w, pm);
    return
  }
  if (['cType', 'cDate', 'cMin', 'cDist', 'cNote'].includes(f)) {
    const c = S.workouts[view.cardioId];
    if (!c) return;
    const pm = monthOf(c);
    if (f === 'cDate') {
      if (!t.value) return;
      c.date = t.value
    } else c[{
      cType: 'type',
      cMin: 'min',
      cDist: 'dist',
      cNote: 'note'
    } [f]] = t.value;
    touchW(c, pm);
    if (f === 'cType') {
      // new type → new title and new hints, without losing focus or scroll
      renderTop();
      const last = lastCardio(c.type, c);
      $('[data-f="cMin"]').placeholder = last && last.min !== '' ? last.min : '0';
      $('[data-f="cDist"]').placeholder = last && last.dist !== '' ? last.dist : '0'
    }
    $('#cPace').textContent = paceText(c);
    return
  }
  const ex = S.exercises[t.dataset.id];
  if (!ex) return;
  if (f === 'exname') {
    if (!t.value.trim()) return;
    ex.name = t.value.trim()
  } else if (f === 'exnotes') ex.notes = t.value;
  else if (f === 'machine') {
    ex.machine = t.value;
    ex.settings = []
  } else if (f === 'excat') ex.category = t.value.trim();
  else if (f === 'msk' || f === 'msv') {
    const s = ex.settings[+t.dataset.k];
    if (!s) return;
    s[f === 'msk' ? 'k' : 'v'] = t.value;
    document.querySelectorAll(`[data-ms="${ex.id}"] input[data-f="${f}"][data-k="${t.dataset.k}"]`).forEach(o => {
      if (o !== t) o.value = t.value
    })
  }
  touchEx(ex)
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.media) {
    const files = [...(t.files || [])];
    t.value = '';
    addMediaFiles(files, {
      kind: t.dataset.media,
      i: t.dataset.i,
      j: t.dataset.j
    });
    return
  }
  if (t.id === 'syncVid') {
    try {
      localStorage.setItem('liftlog.syncvid', t.checked ? '1' : '0')
    } catch (e) {}
    if (t.checked) uploadMedia();
    return
  }
  if (t.id !== 'csvFile' && t.id !== 'jsonFile') return;
  const file = t.files && t.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    const txt = String(rd.result || '');
    if (t.id === 'csvFile') startImport(txt);
    else restoreText(txt)
  };
  rd.onerror = () => toast('Couldn’t read that file.');
  rd.readAsText(file);
  t.value = ''
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'newExName') ACT.createExStandalone();
  if (e.key === 'Enter' && e.target.id === 'exq') {
    const first = $('#exResults [data-a]');
    if (first) first.click()
  }
});

loadLocal();
render();
if (gh) pull().then(ok => {
  if (ok) render()
});
try {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist()
} catch (e) {}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadSW = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadSW && !reloaded && !dirty.size) {
      reloaded = true;
      location.reload()
    }
  });
  navigator.serviceWorker.register('sw.js', {
    updateViaCache: 'none'
  }).then(r => {
    r.update();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') r.update()
    })
  }).catch(() => {})
}
