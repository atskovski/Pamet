/* Pamet v1.2.0 auth — server session cookies with a local journal-unlock verifier. */
(function(global){
  "use strict";
  const USER_KEY="pamet_user_v1",SESSION_KEY="pamet_session_v2",LEGACY_SESSION_KEY="pamet_session_v1",ROUNDS=600000,MIN_PASSWORD_LENGTH=12;
  const subtle=()=>global.crypto&&global.crypto.subtle?global.crypto.subtle:null;
  function requireCrypto(){if(!subtle()||!global.crypto?.getRandomValues)throw new Error("Pamet requires a secure HTTPS connection in this browser.")}
  function randomHex(n){requireCrypto();const a=new Uint8Array(n);global.crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("")}
  function uuid(){requireCrypto();return global.crypto.randomUUID?global.crypto.randomUUID():"local-"+randomHex(16)}
  function utf8(v){return new TextEncoder().encode(String(v))}
  async function pbkdf2(password,saltHex,iterations){const salt=new Uint8Array(saltHex.match(/.{2}/g).map(b=>parseInt(b,16))),key=await subtle().importKey("raw",utf8(password),"PBKDF2",false,["deriveBits"]),bits=await subtle().deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,"0")).join("")}
  function fnv(str,seed){let h=seed>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,"0")}
  function fallback(password,salt){let h="00000000";for(let i=0;i<5000;i++)h=fnv(password+salt+h,parseInt(h,16));return h+fnv(salt+password+"pamet",0x811c9dc5)}
  async function derive(password,salt,iterations=ROUNDS){requireCrypto();return{algo:"pbkdf2",iterations,hash:await pbkdf2(password,salt,iterations)}}
  function sameHash(a,b){a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
  async function verify(password,user){if(user.algo==="fnv1a")return sameHash(fallback(password,user.salt),user.hash);const d=await derive(password,user.salt,user.iterations||120000);return sameHash(d.hash,user.hash)}
  function loadUser(){try{return JSON.parse(localStorage.getItem(USER_KEY))}catch{return null}}
  function saveUser(u){localStorage.setItem(USER_KEY,JSON.stringify(u))}
  function migrateUser(){const u=loadUser();if(!u)return null;let changed=false;if(!u.id){u.id=uuid();changed=true}if(changed)saveUser(u);return u}
  function loadSession(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY));if(s?.token)return s}catch{}try{const old=JSON.parse(sessionStorage.getItem(LEGACY_SESSION_KEY));if(old?.token&&loadUser()){const s={token:old.token,at:old.at||Date.now(),migratedFrom:"v1.0.1"};localStorage.setItem(SESSION_KEY,JSON.stringify(s));sessionStorage.removeItem(LEGACY_SESSION_KEY);return s}}catch{}return null}
  function emit(name,detail){try{global.dispatchEvent(new CustomEvent(name,{detail}))}catch{}}
  async function json(path,options={}){const response=await fetch(path,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Pamet could not complete this request.");return body}
  async function bootstrapAccount(){const c=Auth.getBackendCredential();if(!c?.deviceKey)return;const{deviceKey,...profile}=c;try{await json("/api/account/bootstrap",{method:"POST",headers:{Authorization:`Bearer ${deviceKey}`},body:JSON.stringify({...profile,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"})})}catch{/* legacy migration is retried after the next sign-in */}}
  async function localRecord(profile,password,existing={}){const salt=randomHex(16),d=await derive(password,salt);return{...existing,id:existing.id||profile.id||uuid(),firstName:profile.firstName||"",lastName:profile.lastName||"",email:String(profile.email||"").toLowerCase(),salt,hash:d.hash,iterations:d.iterations,algo:d.algo,plan:profile.plan||existing.plan||"free",createdAt:existing.createdAt||new Date().toISOString()}}
  migrateUser();
  const Auth={
    isSecure:!!subtle(),
    getUser(){const u=migrateUser();if(!u)return null;const{hash,iterations,salt,deviceKey,...rest}=u;return rest},
    getBackendCredential(){const u=migrateUser();return u?{localUserId:u.id,deviceKey:u.deviceKey,email:u.email,firstName:u.firstName||"",lastName:u.lastName||""}:null},
    hasAccount(){return!!loadUser()},
    async register({firstName,lastName,email,password}){requireCrypto();if(loadUser())throw new Error("An account already exists on this device.");if(String(password||"").length<MIN_PASSWORD_LENGTH)throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);const out=await json("/api/auth/register",{method:"POST",body:JSON.stringify({firstName:(firstName||"").trim(),lastName:(lastName||"").trim(),email:(email||"").trim().toLowerCase(),password,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"})});const u=await localRecord(out.user,password);saveUser(u);this.startSession();emit("pamet:registered",this.getUser());return u},
    newDeviceCredential(){return randomHex(32)},
    async adoptRecovered({profile,deviceKey,password}){requireCrypto();if(String(password||"").length<MIN_PASSWORD_LENGTH)throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);const salt=randomHex(16),d=await derive(password,salt),u={id:uuid(),deviceKey,firstName:String(profile.firstName||"").trim(),lastName:String(profile.lastName||"").trim(),email:String(profile.email||"").trim().toLowerCase(),salt,hash:d.hash,iterations:d.iterations,algo:d.algo,plan:"free",createdAt:new Date().toISOString(),recovered:true};saveUser(u);this.startSession();emit("pamet:login",this.getUser());return u},
    async adoptReset({profile,password}){const u=await localRecord(profile,password,{});saveUser(u);this.startSession();emit("pamet:login",this.getUser());return u},
    async login(email,password){requireCrypto();const normalized=(email||"").trim().toLowerCase();let out;try{out=await json("/api/auth/login",{method:"POST",body:JSON.stringify({email:normalized,password})})}catch(error){const legacy=loadUser();if(!legacy?.deviceKey||normalized!==legacy.email||!(await verify(password,legacy)))throw error;await bootstrapAccount();throw new Error("This account still uses legacy device access. Use account recovery once to enable cross-device sign-in.")}const u=await localRecord(out.user,password,loadUser()||{});delete u.deviceKey;saveUser(u);this.startSession();emit("pamet:login",this.getUser());return u},
    startSession(){localStorage.setItem(SESSION_KEY,JSON.stringify({token:randomHex(16),at:Date.now()}));try{sessionStorage.removeItem(LEGACY_SESSION_KEY)}catch{}},
    endSession(){fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"}).catch(()=>{});localStorage.removeItem(SESSION_KEY);try{sessionStorage.removeItem(LEGACY_SESSION_KEY)}catch{}emit("pamet:logout")},
    deleteLocalAccount(){localStorage.removeItem(USER_KEY);localStorage.removeItem(SESSION_KEY);try{sessionStorage.removeItem(LEGACY_SESSION_KEY)}catch{}const link=document.querySelector("#loginForm .welcome-switch");if(link)link.hidden=false;emit("pamet:account-deleted")},
    isAuthed(){return!!loadUser()&&!!loadSession()},
    updateProfile({firstName,lastName,email}){const u=loadUser();if(!u)return null;if(firstName!==undefined)u.firstName=String(firstName).trim();if(lastName!==undefined)u.lastName=String(lastName).trim();if(email!==undefined)u.email=String(email).trim().toLowerCase();saveUser(u);emit("pamet:profile-updated",this.getUser());setTimeout(bootstrapAccount,0);return u},
    async changePassword(oldPassword,newPassword){requireCrypto();const u=loadUser();if(!u)throw new Error("No account found.");if(String(newPassword||"").length<MIN_PASSWORD_LENGTH)throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);await json("/api/auth/password",{method:"POST",body:JSON.stringify({currentPassword:oldPassword,newPassword})});const salt=randomHex(16),d=await derive(newPassword,salt);u.salt=salt;u.hash=d.hash;u.iterations=d.iterations;u.algo=d.algo;saveUser(u)}
  };
  global.PametAuth=Auth;
})(window);
