// Set videos and progress-check photos: IndexedDB storage, thumbnails, viewer, GitHub upload.
"use strict";

const idb = {
  p: null,
  open() {
    return this.p || (this.p = new Promise((res, rej) => {
      const r = indexedDB.open('liftlog-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('m');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error)
    }))
  },
  async run(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction('m', mode);
      const q = fn(t.objectStore('m'));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error)
    })
  },
  get(k) {
    return this.run('readonly', st => st.get(k))
  },
  put(k, v) {
    return this.run('readwrite', st => st.put(v, k))
  },
  del(k) {
    return this.run('readwrite', st => st.delete(k))
  }
};

function* allMedia() {
  for (const w of Object.values(S.workouts)) {
    if (w.deleted) continue;
    for (const m of w.media || []) yield {
      m,
      w,
      arr: w.media
    };
    for (const en of w.entries)
      for (let j = 0; j < en.sets.length; j++) {
        const st = en.sets[j];
        for (const m of st.media || []) yield {
          m,
          w,
          arr: st.media,
          set: st,
          setNo: j + 1,
          exId: en.exId
        }
      }
  }
}

function findMedia(id) {
  for (const x of allMedia())
    if (x.m.id === id) return x;
  return null
}
const mediaCount = w => (w.media || []).length + w.entries.reduce((a, en) => a + en.sets.reduce((b, st) => b + (st.media || []).length, 0), 0);

function thumbsHtml(list, big) {
  return (list || []).map(m => `<button class="th ${m.type==='video'?'vid':''} ${big?'big':''}" data-a="viewMedia" data-id="${m.id}" style="${m.thumb?`background-image:url(${m.thumb})`:''}" aria-label="Open ${m.type}"></button>`).join('')
}

function drawThumb(src, w, h, max) {
  const sc = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * sc));
  c.height = Math.max(1, Math.round(h * sc));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c
}

function loadImg(blob) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob),
      i = new Image();
    i.onload = () => {
      res(i);
      setTimeout(() => URL.revokeObjectURL(u), 1000)
    };
    i.onerror = () => {
      URL.revokeObjectURL(u);
      rej()
    };
    i.src = u
  })
}
async function prepImage(file) {
  try {
    const i = await loadImg(file);
    const big = drawThumb(i, i.naturalWidth, i.naturalHeight, 1600);
    const blob = await new Promise(r => big.toBlob(r, 'image/jpeg', .82));
    return {
      blob: blob || file,
      thumb: drawThumb(i, i.naturalWidth, i.naturalHeight, 200).toDataURL('image/jpeg', .6)
    }
  } catch (e) {
    return {
      blob: file,
      thumb: ''
    }
  }
}

function videoInfo(blob) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    const u = URL.createObjectURL(blob);
    let done = false;
    const fin = t => {
      if (done) return;
      done = true;
      const d = isFinite(v.duration) ? v.duration : 0;
      URL.revokeObjectURL(u);
      res({
        thumb: t,
        dur: d
      })
    };
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(.5, (v.duration || 1) / 2)
      } catch (e) {
        fin('')
      }
    };
    v.onseeked = () => {
      try {
        fin(drawThumb(v, v.videoWidth, v.videoHeight, 200).toDataURL('image/jpeg', .6))
      } catch (e) {
        fin('')
      }
    };
    v.onerror = () => fin('');
    setTimeout(() => fin(''), 7000);
    v.src = u;
    v.load()
  })
}
async function addMediaFiles(files, target) {
  const w = curW();
  if (!w || !files.length) return;
  let n = 0;
  toast('Adding…');
  for (const f of files) {
    const isVid = /^video\//.test(f.type) || /\.(mov|mp4|m4v)$/i.test(f.name);
    const id = 'md' + newId();
    let blob = f,
      thumb = '',
      dur = 0;
    if (isVid) {
      const inf = await videoInfo(f);
      thumb = inf.thumb;
      dur = inf.dur
    } else {
      const p = await prepImage(f);
      blob = p.blob;
      thumb = p.thumb
    }
    const ext = isVid ? ((f.name.match(/\.(\w+)$/) || [, 'mov'])[1].toLowerCase()) : 'jpg';
    try {
      await idb.put(id, blob)
    } catch (e) {
      toast('Not enough space on this phone to save that');
      continue
    }
    const m = {
      id,
      type: isVid ? 'video' : 'image',
      mime: blob.type || (isVid ? 'video/quicktime' : 'image/jpeg'),
      size: blob.size,
      dur: Math.round(dur),
      file: id + '.' + ext,
      thumb,
      createdAt: now(),
      synced: false
    };
    let arr;
    if (target.kind === 'set') {
      const st = w.entries[+target.i].sets[+target.j];
      arr = st.media = st.media || [];
      openNotes.add(target.i + '-' + target.j)
    } else arr = w.media = w.media || [];
    arr.push(m);
    n++
  }
  if (n) {
    touchW(w);
    render();
    toast(n === 1 ? 'Added' : 'Added ' + n);
    uploadMedia()
  }
}
async function getBlob(m) {
  let b = null;
  try {
    b = await idb.get(m.id)
  } catch (e) {}
  if (!b && m.synced && gh) {
    const r = await ghFetch(ghUrl('media/' + m.file), {
      headers: ghHeaders({
        Accept: 'application/vnd.github.raw+json'
      })
    });
    if (r.ok) {
      b = await r.blob();
      b = new Blob([b], {
        type: m.mime
      });
      try {
        await idb.put(m.id, b)
      } catch (e) {}
    }
  }
  return b
}
let viewURL = null;
async function viewMedia(id) {
  const f = findMedia(id);
  if (!f) return;
  sheetCtx = {
    type: 'media',
    id
  };
  const where = f.set ? `${esc(exName(f.exId))} · set ${f.setNo}` : 'Progress check';
  openSheet(`<div class="mv" id="mv">Loading…</div><div class="row" style="margin:10px 2px"><b>${where}</b><span class="mut sm">${prettyDate(f.w.date)}</span></div>
  <button class="ghost" data-a="shareMedia" data-id="${id}">Save to Photos / share</button><button class="link red center block" data-a="delMedia" data-id="${id}">Delete ${f.m.type}</button>`);
  let b = null;
  try {
    b = await getBlob(f.m)
  } catch (e) {}
  const el = $('#mv');
  if (!el || !sheetCtx || sheetCtx.id !== id) return;
  if (!b) {
    el.innerHTML = `<div class="sm" style="padding:30px;text-align:center">This ${f.m.type} is saved on the phone it was added from${f.m.type==='video'&&!f.m.synced?' (videos only back up to GitHub if you turn that on in Settings)':''}.</div>`;
    return
  }
  if (viewURL) URL.revokeObjectURL(viewURL);
  viewURL = URL.createObjectURL(b);
  el.innerHTML = f.m.type === 'video' ? `<video src="${viewURL}" controls playsinline autoplay></video>` : `<img src="${viewURL}" alt="">`
}
async function deleteMedia(id) {
  const f = findMedia(id);
  if (!f) return;
  f.arr.splice(f.arr.indexOf(f.m), 1);
  touchW(f.w);
  try {
    await idb.del(id)
  } catch (e) {}
  if (f.m.synced && gh) {
    try {
      const r = await ghFetch(ghUrl('media/' + f.m.file), {
        headers: ghHeaders({
          Accept: 'application/vnd.github+json'
        })
      });
      if (r.ok) {
        const sha = (await r.json()).sha;
        await ghFetch(ghUrl('media/' + f.m.file), {
          method: 'DELETE',
          headers: ghHeaders({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            message: 'Delete ' + f.m.file,
            sha
          })
        })
      }
    } catch (e) {}
  }
}

function blobB64(b) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b)
  })
}
const syncVideosOn = () => {
  try {
    return localStorage.getItem('liftlog.syncvid') === '1'
  } catch (e) {
    return false
  }
};
let mediaBusy = false;
async function uploadMedia() {
  if (!gh || mediaBusy) return;
  mediaBusy = true;
  try {
    for (const {
        m,
        w
      }
      of [...allMedia()]) {
      if (m.synced) continue;
      if (m.type === 'video' && (!syncVideosOn() || m.size > 40e6)) continue;
      const b = await idb.get(m.id).catch(() => null);
      if (!b) continue;
      const content = await blobB64(b);
      const r = await ghFetch(ghUrl('media/' + m.file), {
        method: 'PUT',
        headers: ghHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          message: 'Add ' + m.file,
          content
        })
      });
      if (r.ok || r.status === 422) {
        m.synced = true;
        touchW(w)
      } else break
    }
  } catch (e) {} finally {
    mediaBusy = false
  }
}
