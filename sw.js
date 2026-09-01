/* Pamet — service worker (Phase 2 / v2.0.0): static shell only; API/share data is never cached. */
const CACHE="pamet-shell-v200";
const SHELL=["/","/index.html","/css/styles.css","/css/brand-v1.0.3.css","/css/release-v1.0.3.css","/css/phase2.css","/js/store.js","/js/auth.js","/js/app.js","/js/v1.0.3.js","/js/feedback-v1.0.3.js","/js/phase2.js","/manifest.webmanifest","/assets/pamet-mark.svg","/assets/icon-192.png","/assets/icon-512.png","/assets/icon-maskable-512.png"];
const PATHS=new Set(SHELL);
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET"||!r.url.startsWith(self.location.origin))return;const u=new URL(r.url);if(u.pathname.startsWith("/api/"))return;const nav=r.mode==="navigate",shell=PATHS.has(u.pathname);if(!nav&&!shell)return;e.respondWith(fetch(r).then(res=>{if(res?.ok&&shell){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy)).catch(()=>{})}return res}).catch(()=>shell?caches.match(r):nav?caches.match("/index.html"):Response.error()))});
