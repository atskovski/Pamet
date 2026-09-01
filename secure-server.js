'use strict';
// Security wrapper for Pamet v1.0.2 billing entitlement checks.
const express=require('express');
const crypto=require('crypto');
const mysql=require('mysql2/promise');
const Stripe=require('stripe');
const core=require('./server');
const app=express();
const stripe=process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null;
const prices={pro:[process.env.STRIPE_PRICE_PRO_MONTHLY,process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean),ultra:[process.env.STRIPE_PRICE_ULTRA_MONTHLY,process.env.STRIPE_PRICE_ULTRA_ANNUAL].filter(Boolean)};
let pool;
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
async function db(){if(pool)return pool;pool=mysql.createPool(process.env.DATABASE_URL||{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:undefined,waitForConnections:true,connectionLimit:5});return pool}
function planForPrice(id){if(prices.pro.includes(id))return'pro';if(prices.ultra.includes(id))return'ultra';return'free'}
function entitled(sub){if(sub.status==='active')return true;if(sub.status!=='trialing')return false;if(sub.default_payment_method)return true;return sub.pending_setup_intent&&sub.pending_setup_intent.status==='succeeded'}
async function syncSub(sub){const p=await db(),uid=sub.metadata&&sub.metadata.pamet_user_id;let rows;if(uid)[rows]=await p.execute('SELECT * FROM pamet_users WHERE id=? LIMIT 1',[uid]);else[rows]=await p.execute('SELECT * FROM pamet_users WHERE stripe_customer_id=? LIMIT 1',[String(sub.customer)]);if(!rows.length)return null;const item=sub.items?.data?.[0],plan=entitled(sub)?planForPrice(item?.price?.id):'free';await p.execute('UPDATE pamet_users SET plan=?,subscription_status=?,stripe_customer_id=?,stripe_subscription_id=? WHERE id=?',[plan,sub.status,String(sub.customer),sub.id,rows[0].id]);return plan}
app.post('/api/stripe/webhook',express.raw({type:'application/json'}),async(req,res)=>{if(!stripe||!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).json({error:'Stripe webhook not configured.'});try{const ev=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);if(ev.type.startsWith('customer.subscription.')){let sub=ev.data.object;if(sub.status==='trialing'&&!sub.default_payment_method)sub=await stripe.subscriptions.retrieve(sub.id,{expand:['pending_setup_intent','default_payment_method']});await syncSub(sub)}res.json({received:true})}catch(e){res.status(400).json({error:e.message})}});
app.use(express.json({limit:'256kb'}));
app.post('/api/billing/sync',async(req,res,next)=>{try{const a=String(req.headers.authorization||''),key=a.startsWith('Bearer ')?a.slice(7).trim():'';if(key.length<40)return res.status(401).json({error:'Authentication required.'});const p=await db(),[rows]=await p.execute('SELECT * FROM pamet_users WHERE device_key_hash=? LIMIT 1',[sha(key)]);if(!rows.length)return res.status(401).json({error:'Authentication required.'});const user=rows[0];if(stripe&&user.stripe_subscription_id){const sub=await stripe.subscriptions.retrieve(user.stripe_subscription_id,{expand:['pending_setup_intent','default_payment_method']});await syncSub(sub)}const [fresh]=await p.execute('SELECT * FROM pamet_users WHERE id=?',[user.id]);const u=fresh[0];res.json({user:{id:String(u.id),email:u.email,firstName:u.first_name,lastName:u.last_name,plan:u.plan||'free',subscriptionStatus:u.subscription_status||'none',weeklyDigest:!!u.weekly_digest_enabled}})}catch(e){next(e)}});
app.use(core);
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:process.env.NODE_ENV==='production'?'Pamet could not complete that request.':err.message})});
const PORT=Number(process.env.PORT||8080);
app.listen(PORT,()=>console.log(`Pamet v1.0.2 listening securely on ${PORT}`));
