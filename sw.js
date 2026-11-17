// Bump the version number together with APP_VERSION in js/core.js. List every file the app needs offline.
const C='liftlog-v25',F=['./','index.html','styles.css','js/core.js','js/sync.js','js/media.js','js/views.js','js/sheets.js','js/motion.js','js/import.js','js/actions.js','js/app.js','manifest.json','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(f=>fetch(f,{cache:'no-cache'}).then(r=>c.put(f,r)))))) ;self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
// Always ask the server for the latest page (skipping the browser's 10-minute cache); fall back to the saved copy when offline.
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
  e.respondWith(fetch(u.href,{cache:'no-cache'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))))});
