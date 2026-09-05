/* Pamet v1.6.9 service worker: manifest-driven immutable shell caching plus Web Push. */
const CACHE="pamet-shell-v169-3";
const BASE_SHELL=["/","/index.html","/manifest.webmanifest","/assets/pamet-mark.svg?v=169","/assets/icon-192.png","/assets/icon-512.png","/assets/icon-maskable-512.png","/assets/login-sunrise.jpg"];
const STATIC_PREFIXES=["/dist/","/assets/"];
const isStaticPath=(pathname)=>STATIC_PREFIXES.some(prefix=>pathname.startsWith(prefix))||pathname==="/manifest.webmanifest";

async function releaseAssets(){
  try{
    const response=await fetch('/dist/asset-manifest.json',{cache:'no-store'});
    if(!response.ok)return[];
    const manifest=await response.json();
    return [manifest.bootstrapJs,manifest.featuresJs,manifest.bootstrapCss,manifest.featuresCss].filter(value=>typeof value==='string'&&value.startsWith('/dist/'));
  }catch{return[]}
}
async function installShell(){
  const cache=await caches.open(CACHE);
  await Promise.all(BASE_SHELL.map(async url=>{try{const response=await fetch(url,{cache:'no-store'});if(response.ok)await cache.put(url,response)}catch{}}));
  const assets=await releaseAssets();
  await Promise.all(assets.map(async url=>{try{const response=await fetch(url,{cache:'no-store'});if(response.ok)await cache.put(url,response)}catch{}}));
}
self.addEventListener('install',event=>event.waitUntil(installShell().then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('push',event=>{let data={};try{data=event.data?event.data.json():{}}catch{}event.waitUntil(self.registration.showNotification(data.title||'Pamet reminder',{body:data.body||'Open Pamet to review your health journal.',icon:'/assets/icon-192.png',badge:'/assets/icon-192.png',tag:data.tag||'pamet-reminder',data:{url:data.url||'/'}}))});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{const existing=windows.find(item=>item.url.startsWith(self.location.origin));return existing?existing.focus():clients.openWindow(event.notification.data?.url||'/')}))});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(self.location.origin))return;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/share'))return;
  if(url.pathname==='/dist/asset-manifest.json')return;
  const navigation=request.mode==='navigate';
  const staticAsset=isStaticPath(url.pathname);
  if(!navigation&&!staticAsset)return;
  if(staticAsset){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{})}
      return response;
    })));
    return;
  }
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
    if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/index.html',copy)).catch(()=>{})}
    return response;
  }).catch(()=>caches.match('/index.html',{ignoreSearch:true}).then(cached=>cached||Response.error())));
});
