'use strict';
const { test, expect } = require('@playwright/test');
const CAPS = {
  pro:{correlations:true,unlimitedHistory:true,sharing:true,appointmentWorkspace:false,multipleProfiles:false,advancedVisitBrief:false,encryptedSync:false},
  ultra:{correlations:true,unlimitedHistory:true,sharing:true,appointmentWorkspace:true,multipleProfiles:true,advancedVisitBrief:true,encryptedSync:true}
};
async function install(page, plan) {
  await page.addInitScript(({plan}) => {
    const now=Date.now(), entries=[];
    for(let i=0;i<72;i++){
      const headache=i<14 ? i%2===0 : i<28 ? i%5===0 : i%4===0;
      const dizzy=i%9===0;
      entries.push({id:`avb-${i}`,date:new Date(now-i*86400000).toISOString(),symptoms:[...(headache?['Headache']:[]),...(dizzy?['Dizziness']:[])],severity:headache?Math.min(8,4+(i%5)):dizzy?5:0,sleepHours:i%3===0?5.5:7.2,stressLevel:i%4===0?8:4,waterGlasses:i%3===0?4:7,energyLevel:i%3===0?4:7,mood:i%4===0?'Tired 😴':'Okay 😐',activity:i%2===0?'Walk':'None',medications:i%3===0?['Ibuprofen']:[],notes:i%11===0?'Headache affected concentration at work.':''});
    }
    localStorage.setItem('pamet_entries_v2_primary',JSON.stringify(entries));
    localStorage.setItem('pamet_user_v1',JSON.stringify({id:'avb-user',firstName:'Visit',lastName:'Brief',email:'visit-brief@pamet.test',plan:'free',createdAt:new Date().toISOString()}));
    localStorage.setItem('pamet_session_v2',JSON.stringify({token:'avb-session',at:Date.now()}));
  }, {plan});
  await page.route('**/api/entitlements',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({plan,capabilities:CAPS[plan]})}));
}
async function ready(page, plan){await page.goto('/',{waitUntil:'commit'});await page.waitForFunction(()=>window.PametAuthenticatedFeaturesLoaded===true&&!!window.PametAdvancedVisitBrief);await expect.poll(()=>page.evaluate(()=>window.PametEntitlements?.snapshot?.().plan)).toBe(plan)}

test('@production Ultra Advanced Visit Brief renders clinician intelligence, evidence traceability, ranges, and PDF', async ({page}) => {
  await install(page,'ultra');
  const now=Date.now();
  await page.route('**/api/appointments',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appointments:[
    {id:'prior',profileId:'primary',clinician:'Dr. Rivera',startsAt:new Date(now-40*86400000).toISOString(),reason:'Headache follow-up',concerns:['Headache frequency'],questions:['Could medication timing matter?'],status:'completed'},
    {id:'next',profileId:'primary',clinician:'Dr. Rivera',startsAt:new Date(now+10*86400000).toISOString(),reason:'Neurology follow-up',concerns:['Worsening headache frequency'],questions:['What changed since my last visit?','What should I keep tracking?'],status:'scheduled'}
  ]})}));
  await ready(page,'ultra');
  expect(await page.evaluate(()=>window.PametAdvancedVisitBrief.open())).toBe(true);
  await expect(page.locator('#screen-report')).toHaveClass(/active/);
  await expect(page.locator('#advancedVisitBriefToolbar')).toBeVisible();
  await expect(page.getByText('Clinician snapshot',{exact:true})).toBeVisible();
  for(const text of ['Patient priorities and current picture','What changed','Symptoms and trends','Medication history recorded in Pamet','Recorded associations for clinician review','Key recorded events','Preparation checklist','Where this information came from','Not inferred by Pamet']) await expect(page.getByText(text,{exact:true})).toBeVisible();
  await expect(page.locator('#reportDoc')).toContainText('Dose: not recorded');
  await expect(page.locator('#reportDoc')).toContainText('Evidence traceability');
  await expect(page.locator('#reportDoc')).not.toContainText('confidence');
  const snapshot=await page.evaluate(()=>window.PametAdvancedVisitBrief.snapshot());
  expect(snapshot.version).toBe('2.0'); expect(snapshot.symptomInsights.length).toBeGreaterThan(0); expect(Array.isArray(snapshot.symptoms[0])).toBe(true); expect(Array.isArray(snapshot.medications[0])).toBe(true); expect(snapshot.sinceLastVisit).not.toBeNull();
  await page.locator('#advancedVisitBriefRange').selectOption('30');
  await expect.poll(()=>page.evaluate(()=>window.PametAdvancedVisitBrief.rangeDays)).toBe(30);
  await expect(page.locator('#reportDoc')).toContainText('Most recent 30 days');
  await page.evaluate(()=>{window.__avbPrinted=false;window.__avbHtml='';window.open=()=>({opener:null,document:{write:v=>window.__avbHtml=v,close:()=>{}},focus:()=>{},print:()=>{window.__avbPrinted=true}})});
  await page.locator('#downloadPdf').click();
  await expect.poll(()=>page.evaluate(()=>window.__avbPrinted)).toBe(true);
  expect(await page.evaluate(()=>window.__avbHtml.includes('Advanced Visit Brief'))).toBe(true);
});

test('@production Pro keeps standard Visit Brief and Advanced control fails closed to Ultra', async ({page}) => {
  await install(page,'pro'); await ready(page,'pro');
  await page.locator('[data-nav="report"]').first().click();
  await expect(page.locator('#advancedVisitBriefToolbar')).toBeVisible();
  await expect(page.locator('#reportDoc')).toContainText('Symptom report');
  await page.getByRole('button',{name:'Advanced · Ultra'}).click();
  const lock=page.locator('#pametEntitlementModalRoot .entitlement-lock-modal');
  await expect(lock).toBeVisible();
  await expect(lock.getByRole('heading',{name:'Advanced Visit Brief is included with Ultra',exact:true})).toBeVisible();
  await expect(page.locator('#reportDoc')).toContainText('Symptom report');
  expect(await page.evaluate(()=>window.PametAdvancedVisitBrief.active)).toBe(false);
});
