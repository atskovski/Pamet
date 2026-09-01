/* Pamet local-first auth — v1.0.3 */
(function(global){
  "use strict";
  const USER_KEY="pamet_user_v1",SESSION_KEY="pamet_session_v2",LEGACY_SESSION_KEY="pamet_session_v1",ROUNDS=120000;
  const subtle=()=>global.crypto&&global.crypto.subtle?global.crypto.subtle:null;
  function randomHex(n){const a=new Uint8Array(n);if(global.crypto?.getRandomValues)global.crypto.getRandomValues(a);else for(let i=0;i<n;i++)a[i]=Math.floor(Math.random()*256);return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("")}
  function uuid(){return global.crypto?.randomUUID?global.crypto.randomUUID():"local-"+randomHex(16)}
  function utf8(v){return new TextEncoder().encode(String(v))}
  async function pbkdf2(password,saltHex,iterations){const salt=new Uint8Array(saltHex.match(/.{2}/g).map(b=>parseInt(b,16))),key=await subtle().importKey("raw",utf8(password),"PBKDF2",false,["deriveBits"]),bits=await subtle().deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,"0")).join("")}
  function fnv(str,seed){let h=seed>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,"0")}
  function fallback(password,salt){let h="00000000";for(let i=0;i<5000;i++)h=fnv(password+salt+h,parseInt(h,16));return h+fnv(salt+password+"pamet",0x811c9dc5)}
  async function derive(password,salt,iterations=ROUNDS){if(subtle()){try{return{algo:"pbkdf2",iterations,hash:await pbkdf2(password,salt,iterations)}}catch{}}return{algo:"fnv1a",iterations:0,hash:fallback(password,salt)}}
  function loadUser(){try{return JSON.parse(localStorage.getItem(USER_KEY))}catch{return null}}
  function saveUser(u){localStorage.setItem(USER_KEY,JSON.stringify(u))}
  function migrateUser(){const u=loadUser();if(!u)return null;let changed=false;if(!u.id){u.id=uuid();changed=true}if(!u.deviceKey){u.deviceKey=randomHex(32);changed=true}if(changed)saveUser(u);return u}
  function loadSession(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY));if(s?.token)return s}catch{}try{const old=JSON.parse(sessionStorage.getItem(LEGACY_SESSION_KEY));if(old?.token&&loadUser()){const s={token:old.token,at:old.at||Date.now(),migratedFrom:"v1.0.1"};localStorage.setItem(SESSION_KEY,JSON.stringify(s));sessionStorage.removeItem(LEGACY_SESSION_KEY);return s}}catch{}return null}
  function emit(name,detail){try{global.dispatchEvent(new CustomEvent(name,{detail}))}catch{}}
  async function bootstrapAccount(){const c=Auth.getBackendCredential();if(!c)return;try{await fetch("/api/account/bootstrap",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${c.deviceKey}`},body:JSON.stringify({...c,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"})})}catch{/* optional service: local journal still works */}}
  migrateUser();
  const Auth={
    isSecure:!!subtle(),
    getUser(){const u=migrateUser();if(!u)return null;const{hash,iterations,salt,deviceKey,...rest}=u;return rest},
    getBackendCredential(){const u=migrateUser();return u?{localUserId:u.id,deviceKey:u.deviceKey,email:u.email,firstName:u.firstName||"",lastName:u.lastName||""}:null},
    hasAccount(){return!!loadUser()},
    async register({firstName,lastName,email,password}){if(loadUser())throw new Error("An account already exists on this device.");const salt=randomHex(16),d=await derive(password,salt),u={id:uuid(),deviceKey:randomHex(32),firstName:(firstName||"").trim(),lastName:(lastName||"").trim(),email:(email||"").trim().toLowerCase(),salt,hash:d.hash,iterations:d.iterations,algo:d.algo,plan:"free",createdAt:new Date().toISOString()};saveUser(u);this.startSession();emit("pamet:registered",this.getUser());setTimeout(bootstrapAccount,0);return u},
    async login(email,password){const u=loadUser();if(!u)throw new Error("No account found on this device.");if((email||"").trim().toLowerCase()!==u.email)throw new Error("Email not recognized.");const d=await derive(password,u.salt,u.iterations||ROUNDS);if(d.hash!==u.hash)throw new Error("Incorrect password.");this.startSession();emit("pamet:login",this.getUser());setTimeout(bootstrapAccount,0);return u},
    startSession(){localStorage.setItem(SESSION_KEY,JSON.stringify({token:randomHex(16),at:Date.now()}));try{sessionStorage.removeItem(LEGACY_SESSION_KEY)}catch{}},
    endSession(){localStorage.removeItem(SESSION_KEY);try{sessionStorage.removeItem(LEGACY_SESSION_KEY)}catch{}emit("pamet:logout")},
    deleteLocalAccount(){localStorage.removeItem(USER_KEY);localStorage.removeItem(SESSION_KEY);try{sessionStorage.removeItem(LEGACY_SESSION_KEY)}catch{}emit("pamet:account-deleted")},
    isAuthed(){return!!loadUser()&&!!loadSession()},
    updateProfile({firstName,lastName,email}){const u=loadUser();if(!u)return null;if(firstName!==undefined)u.firstName=String(firstName).trim();if(lastName!==undefined)u.lastName=String(lastName).trim();if(email!==undefined)u.email=String(email).trim().toLowerCase();saveUser(u);emit("pamet:profile-updated",this.getUser());setTimeout(bootstrapAccount,0);return u},
    async changePassword(oldPassword,newPassword){const u=loadUser();if(!u)throw new Error("No account found.");if(String(newPassword||"").length<8)throw new Error("New password must be at least 8 characters.");const check=await derive(oldPassword,u.salt,u.iterations||ROUNDS);if(check.hash!==u.hash)throw new Error("Current password is incorrect.");const salt=randomHex(16),d=await derive(newPassword,salt);u.salt=salt;u.hash=d.hash;u.iterations=d.iterations;u.algo=d.algo;saveUser(u)}
  };
  global.PametAuth=Auth;
  global.addEventListener("DOMContentLoaded",()=>{if(!document.querySelector('link[data-pamet-brand-v103]')){const l=document.createElement("link");l.rel="stylesheet";l.href="css/brand-v1.0.3.css";l.dataset.pametBrandV103="true";document.head.appendChild(l)}});
  global.addEventListener("load",()=>{if(!document.querySelector('script[data-pamet-v103]')){const s=document.createElement("script");s.src="js/v1.0.3.js";s.dataset.pametV103="true";document.body.appendChild(s)}});
})(window);
