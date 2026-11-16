// Sync with the private GitHub data repo: push changed files, pull and merge by updatedAt.
"use strict";

const LSG = 'liftlog.gh',
  LSGS = 'liftlog.ghsync';
let gh = null,
  syncState = 'local',
  flushing = false,
  flushTimer = null,
  lastSync = 0,
  syncErr = '';
const dirty = new Set();
try {
  gh = JSON.parse(localStorage.getItem(LSG)) || null
} catch (e) {}
let ghCache = {};
try {
  ghCache = JSON.parse(localStorage.getItem(LSGS)) || {}
} catch (e) {}

function saveGhCache() {
  try {
    localStorage.setItem(LSGS, JSON.stringify(ghCache))
  } catch (e) {}
}
const monthOf = w => 'm-' + (w.date || '0000-00').slice(0, 7);

function syncLabel() {
  if (!gh) return 'Saved on this phone only. Connect GitHub below to back up and sync automatically.';
  return {
    syncing: 'Syncing with GitHub…',
    synced: 'Synced to ' + gh.repo + (lastSync ? ' · ' + new Date(lastSync).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    }) : ''),
    error: 'Couldn’t reach GitHub' + (syncErr ? ' (' + syncErr + ')' : '') + '. Changes are saved on this phone and will sync later.',
    local: 'Connected to ' + gh.repo
  } [syncState]
}

function setSync(s, err) {
  syncState = s;
  if (err !== undefined) syncErr = err;
  const d = $('#top .sync');
  if (d) {
    d.className = 'sync ' + s;
    d.title = syncLabel()
  }
  const l = $('#syncLine');
  if (l) l.textContent = syncLabel()
}

function markDirty(k) {
  dirty.add(k);
  if (!gh) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 3000)
}

function touchW(w, prevMonth) {
  w.updatedAt = now();
  markDirty(monthOf(w));
  if (prevMonth && prevMonth !== monthOf(w)) markDirty(prevMonth);
  saveLocal()
}

function touchEx(e) {
  e.updatedAt = now();
  markDirty('meta');
  saveLocal()
}

function bodyFor(k) {
  if (k === 'meta') return {
    unit: S.unit,
    unitAt: S.unitAt || 0,
    exercises: S.exercises,
    routines: S.routines
  };
  const ws = {};
  for (const w of Object.values(S.workouts))
    if (monthOf(w) === k) ws[w.id] = w;
  return {
    workouts: ws
  }
}

function makeIdx(k, b) {
  if (k === 'meta') {
    const ex = {},
      rt = {};
    for (const id in b.exercises || {}) ex[id] = b.exercises[id].updatedAt || 0;
    for (const id in b.routines || {}) rt[id] = b.routines[id].updatedAt || 0;
    return {
      ex,
      rt,
      unitAt: b.unitAt || 0
    }
  }
  const o = {};
  for (const id in b.workouts || {}) o[id] = b.workouts[id].updatedAt || 0;
  return o
}

function b64(str) {
  const by = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000));
  return btoa(s)
}

function ghHeaders(extra) {
  return Object.assign({
    Authorization: 'Bearer ' + gh.token,
    'X-GitHub-Api-Version': '2022-11-28'
  }, extra || {})
}
const ghUrl = p => `https://api.github.com/repos/${gh.repo}/contents/${p}`;
async function ghFetch(url, opts) {
  let r;
  try {
    r = await fetch(url, Object.assign({
      cache: 'no-store'
    }, opts))
  } catch (e) {
    throw {
      code: 'network',
      msg: 'no connection'
    }
  }
  if (r.status === 401) throw {
    code: 'auth',
    msg: 'token rejected'
  };
  if (r.status === 403 && r.headers.get('x-ratelimit-remaining') !== '0') throw {
    code: 'auth',
    msg: 'token lacks access'
  };
  return r
}
async function ghPut(k, body, keepalive) {
  const name = k + '.json',
    path = 'data/' + name;
  const send = sha => ghFetch(ghUrl(path), {
    method: 'PUT',
    keepalive: !!keepalive,
    headers: ghHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({
      message: 'Update ' + name,
      content: b64(JSON.stringify(body)),
      sha: sha || undefined
    })
  });
  let r = await send(ghCache[name] && ghCache[name].sha);
  if (r.status === 409 || r.status === 422) {
    const m = await ghFetch(ghUrl(path) + '?t=' + now(), {
      headers: ghHeaders({
        Accept: 'application/vnd.github+json'
      })
    });
    r = await send(m.ok ? (await m.json()).sha : undefined)
  }
  if (!r.ok) throw {
    code: 'http',
    msg: 'error ' + r.status
  };
  const j = await r.json();
  ghCache[name] = {
    sha: j.content.sha,
    idx: makeIdx(k, body)
  };
  saveGhCache()
}
async function flush(keepalive) {
  if (!gh || flushing || !dirty.size) return;
  flushing = true;
  setSync('syncing');
  let failed = null;
  while (dirty.size) {
    const k = dirty.values().next().value;
    dirty.delete(k);
    try {
      await ghPut(k, bodyFor(k), keepalive)
    } catch (e) {
      dirty.add(k);
      failed = e;
      break
    }
  }
  flushing = false;
  if (failed) {
    setSync('error', failed.msg || '');
    if (failed.code !== 'auth') setTimeout(flush, 30000)
  } else {
    lastSync = now();
    setSync('synced', '');
    uploadMedia()
  }
}

function mergeBody(k, b) {
  if (k === 'meta') {
    if ((b.unitAt || 0) > (S.unitAt || 0)) {
      S.unit = b.unit || 'lb';
      S.unitAt = b.unitAt
    }
    for (const [key, src] of [
        ['exercises', b.exercises || {}],
        ['routines', b.routines || {}]
      ])
      for (const id in src) {
        const l = S[key][id];
        if (!l || (src[id].updatedAt || 0) > (l.updatedAt || 0)) S[key][id] = src[id]
      }
  } else {
    const rw = b.workouts || {};
    for (const id in rw) {
      const l = S.workouts[id];
      if (!l || (rw[id].updatedAt || 0) > (l.updatedAt || 0)) S.workouts[id] = rw[id]
    }
  }
}
async function pull() {
  if (!gh || flushing) return;
  setSync('syncing');
  try {
    const r = await ghFetch(ghUrl('data') + '?t=' + now(), {
      headers: ghHeaders({
        Accept: 'application/vnd.github+json'
      })
    });
    let list = [];
    if (r.status === 404) list = [];
    else if (!r.ok) throw {
      code: 'http',
      msg: 'error ' + r.status
    };
    else list = await r.json();
    const names = new Set();
    let metaIdx = null;
    const remoteIdx = {};
    for (const f of list) {
      if (!/\.json$/.test(f.name)) continue;
      const k = f.name.slice(0, -5);
      names.add(f.name);
      let idx;
      if (ghCache[f.name] && ghCache[f.name].sha === f.sha) idx = ghCache[f.name].idx;
      else {
        const rr = await ghFetch(ghUrl('data/' + f.name) + '?t=' + now(), {
          headers: ghHeaders({
            Accept: 'application/vnd.github.raw+json'
          })
        });
        if (!rr.ok) throw {
          code: 'http',
          msg: 'error ' + rr.status
        };
        const b = await rr.json();
        mergeBody(k, b);
        idx = makeIdx(k, b);
        ghCache[f.name] = {
          sha: f.sha,
          idx
        }
      }
      if (k === 'meta') metaIdx = idx;
      else remoteIdx[k] = idx
    }
    for (const n in ghCache)
      if (!names.has(n)) delete ghCache[n];
    saveGhCache();
    if (!metaIdx) {
      if (Object.keys(S.exercises).length || Object.keys(S.routines).length) dirty.add('meta')
    } else {
      if ((S.unitAt || 0) !== (metaIdx.unitAt || 0)) dirty.add('meta');
      for (const id in S.exercises)
        if ((S.exercises[id].updatedAt || 0) !== metaIdx.ex[id]) dirty.add('meta');
      for (const id in S.routines)
        if ((S.routines[id].updatedAt || 0) !== metaIdx.rt[id]) dirty.add('meta')
    }
    for (const m in remoteIdx)
      for (const id in remoteIdx[m]) {
        const l = S.workouts[id];
        if (!l || monthOf(l) !== m || (l.updatedAt || 0) !== remoteIdx[m][id]) dirty.add(m)
      }
    for (const w of Object.values(S.workouts)) {
      const m = monthOf(w);
      if (!remoteIdx[m] || remoteIdx[m][w.id] !== (w.updatedAt || 0)) dirty.add(m)
    }
    saveLocal();
    lastSync = now();
    setSync('synced', '');
    if (dirty.size) await flush();
    else uploadMedia();
    return true
  } catch (e) {
    setSync('error', e.msg || '');
    return false
  }
}
async function ghConnect(repo, token) {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '').replace(/\.git$/, '');
  token = token.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast('Repo should look like shfriedland/lift-log-data');
  if (!token) return toast('Paste your token first');
  const prev = gh;
  gh = {
    repo,
    token
  };
  let r;
  try {
    r = await ghFetch(`https://api.github.com/repos/${repo}`, {
      headers: ghHeaders({
        Accept: 'application/vnd.github+json'
      })
    })
  } catch (e) {
    gh = prev;
    return toast('GitHub said: ' + (e.msg || 'error'))
  }
  if (!r.ok) {
    gh = prev;
    return toast(r.status === 404 ? 'Repo not found, or the token can’t see it' : 'GitHub said: error ' + r.status)
  }
  try {
    localStorage.setItem(LSG, JSON.stringify(gh))
  } catch (e) {}
  if (!prev || prev.repo !== repo) {
    ghCache = {};
    saveGhCache()
  }
  render();
  toast('Connected. Syncing…');
  const ok = await pull();
  render();
  if (ok) toast('Synced with GitHub')
}

function ghDisconnect() {
  gh = null;
  try {
    localStorage.removeItem(LSG)
  } catch (e) {}
  setSync('local', '');
  render();
  toast('Disconnected. Your data is still on this phone.')
}
document.addEventListener('visibilitychange', () => {
  if (!gh) return;
  if (document.visibilityState === 'hidden') {
    if (dirty.size) {
      clearTimeout(flushTimer);
      flush(true)
    }
    return
  }
  if (!flushing && !dirty.size) {
    const a = document.activeElement;
    if (!a || !/INPUT|TEXTAREA|SELECT/.test(a.tagName)) pull().then(ok => {
      if (ok) render()
    })
  }
});
