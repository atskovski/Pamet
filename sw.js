/* Pamet v1.6.5 service worker: release-specific shell caching plus user-approved Web Push; API/share data is never cached. */
const CACHE="pamet-shell-v165-3";
const SHELL=["/","/index.html","/dist/pamet.min.css?v=165","/dist/pamet.min.js?v=165","/manifest.webmanifest","/assets/pamet-mark.svg?v=165","/assets/icon-192.png","/assets/icon-512.png","/assets/icon-maskable-512.png","/assets/login-sunrise.jpg"];
const PATHS=new Set(SHELL.map(path=>new URL(path,self.location.origin).pathname));
const STATIC_PREFIXES=["/dist/","/assets/"];
const isStaticPath=(pathname)=>STATIC_PREFIXES.some(prefix=>pathname.startsWith(prefix))||pathname==="/manifest.webmanifest";
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("push",e=>{let data={};try{data=e.data?e.data.json():{}}catch{}e.waitUntil(self.registration.showNotification(data.title||"Pamet reminder",{body:data.body||"Open Pamet to review your health journal.",icon:"/assets/icon-192.png",badge:"/assets/icon-192.png",tag:data.tag||"pamet-reminder",data:{url:data.url||"/"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{const existing=windows.find(item=>item.url.startsWith(self.location.origin));return existing?existing.focus():clients.openWindow(e.notification.data?.url||"/")}))});
self.addEventListener("fetch",e=>{
  const r=e.request;
  if(r.method!=="GET"||!r.url.startsWith(self.location.origin))return;
  const u=new URL(r.url);
  if(u.pathname.startsWith("/api/")||u.pathname.startsWith("/share"))return;
  const nav=r.mode==="navigate";
  const shell=PATHS.has(u.pathname);
  const staticAsset=isStaticPath(u.pathname);
  if(!nav&&!shell&&!staticAsset)return;

  if(staticAsset||(!nav&&shell)){
    /* Match the complete request URL. Never ignore ?v= for release assets: doing so can pin a client to an older CSS/JS bundle. */
    e.respondWith(caches.match(r).then(cached=>{
      if(cached)return cached;
      return fetch(r,{cache:"no-store"}).then(res=>{
        if(res?.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy)).catch(()=>{})}
        return res;
      });
    }));
    return;
  }

  e.respondWith(fetch(r,{cache:"no-store"}).then(res=>{
    if(res?.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put("/index.html",copy)).catch(()=>{})}
    return res;
  }).catch(()=>caches.match("/index.html",{ignoreSearch:true}).then(cached=>cached||Response.error())));
});