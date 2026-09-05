'use strict';
const { test, expect } = require('@playwright/test');

const ULTRA = {correlations:true,unlimitedHistory:true,sharing:true,appointmentWorkspace:true,multipleProfiles:true,advancedVisitBrief:true,encryptedSync:true};
async function installUltra(page){
  await page.addInitScript(()=>{
    const now=Date.now(),entries=[];
    for(let i=0;i<35;i++) entries.push({id:`vw-${i}`,date:new Date(now-i*86400000).toISOString(),symptoms:i%2===0?['Headache']:[],severity:i%2===0?5+(i%3):0,sleepHours:7,stressLevel:4,waterGlasses:7,energyLevel:6,mood:'Okay',activity:'Walk',medications:i%4===0?['Ibuprofen']:[],notes:i%9===0?'Visit workflow note':''});
    localStorage.setItem('pamet_entries_v2_primary',JSON.stringify(entries));
    localStorage.setItem('pamet_user_v1',JSON.stringify({id:'visit-workflow-user',firstName:'Visit',lastName:'Workflow',email:'workflow@pamet.test',plan:'free',createdAt:new Date().toISOString()}));
    localStorage.setItem('pamet_session_v2',JSON.stringify({token:'visit-workflow-session',at:Date.now()}));
  });
  await page.route('**/api/entitlements',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({plan:'ultra',capabilities:ULTRA})}));
}
async function ready(page){
  await page.goto('/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.PametAuthenticatedFeaturesLoaded===true&&!!window.PametVisitWorkflow&&!!window.PametAdvancedVisitBrief&&!!window.PametCareUx);
  await expect.poll(()=>page.evaluate(()=>window.PametEntitlements?.snapshot?.().plan)).toBe('ultra');
}

test('@production Visit Brief explains Appointment Workspace dependency and back arrow returns to Settings',async({page})=>{
  await installUltra(page);
  await page.route('**/api/appointments',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appointments:[]})}));
  await ready(page);
  await page.evaluate(()=>window.PametAdvancedVisitBrief.open());
  await expect(page.locator('#screen-report')).toHaveClass(/active/);
  await expect(page.locator('#visitBriefBack')).toBeVisible();
  await expect(page.locator('#visitBriefWorkspaceHint')).toContainText('Complete Appointment Workspace first');
  await expect(page.locator('#visitBriefWorkspaceHint')).toContainText('visit date, clinician, reason, priorities, and questions');
  await page.locator('#visitBriefBack').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/active/);
});

test('Appointment Workspace saves to Pamet then asks which calendar should receive the appointment',async({page})=>{
  await installUltra(page);
  let appointments=[];
  await page.route('**/api/appointments',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      const body=request.postDataJSON();
      appointments=[{id:'appt-calendar-1',...body,status:'scheduled'}];
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({appointment:appointments[0]})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appointments})});
  });
  await ready(page);
  await page.evaluate(()=>window.PametCareUx.openAppointmentWorkspace());
  const form=page.locator('#careAppointmentForm');
  await expect(form).toBeVisible();
  const destination=page.locator('#careCalendarDestination');
  await expect(destination).toBeVisible();
  await expect(destination.locator('option')).toHaveText(['Ask me after saving','Google Calendar','Apple Calendar','Pamet only']);
  await destination.selectOption('ask');
  await page.locator('#careClinician').fill('Dr. Rivera');
  await page.locator('#careStarts').fill('2026-09-18T09:30');
  await page.locator('#careDateConfirmed').check();
  await page.locator('#careReason').fill('Review headache changes');
  await page.locator('#careQuestions').fill('What changed since my last visit?\nWhat should I keep tracking?');
  await page.locator('#careSaveAppointment').click();
  const chooser=page.locator('#visitWorkflowModalRoot .visit-calendar-modal');
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText('Appointment saved');
  await expect(chooser.getByRole('button',{name:'Google Calendar'})).toBeVisible();
  await expect(chooser.getByRole('button',{name:'Apple Calendar'})).toBeVisible();
  await expect(chooser.getByRole('button',{name:'Keep in Pamet only'})).toBeVisible();
  await chooser.getByRole('button',{name:'Keep in Pamet only'}).click();
  await expect(page.locator('#visitWorkflowNotice')).toContainText('Appointment saved in Pamet');
});

test('@production Email visit brief sends a PDF payload through Pamet instead of navigating to mailto',async({page})=>{
  await installUltra(page);
  await page.route('**/api/appointments',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appointments:[]})}));
  await page.route('**/api/visit-workflow/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({googleCalendarEnabled:false,googleCalendarFallback:true,appleCalendarEnabled:true,emailEnabled:true})}));
  let sent=null;
  await page.route('**/api/visit-brief/email',async route=>{
    sent=route.request().postDataJSON();
    await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({sent:true,filename:'Pamet-Visit-Brief.pdf'})});
  });
  await ready(page);
  await page.locator('[data-nav="report"]').first().click();
  const before=page.url();
  await page.locator('#emailReport').click();
  const modal=page.locator('#visitWorkflowModalRoot .visit-email-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('attached as a PDF');
  await expect(modal).toContainText('Health details are not copied into the email body');
  await page.locator('#visitBriefRecipient').fill('clinician@example.com');
  await page.locator('#visitBriefEmailSend').click();
  await expect(modal.locator('[data-visit-status]')).toContainText('Visit Brief PDF sent successfully');
  expect(sent.to).toBe('clinician@example.com');
  expect(sent.mode).toBe('standard');
  expect(sent.snapshot).toBeTruthy();
  expect(sent.body).toBeUndefined();
  expect(page.url()).toBe(before);
});

test('Advanced Visit Brief email posts Advanced snapshot for Ultra',async({page})=>{
  await installUltra(page);
  const now=Date.now();
  await page.route('**/api/appointments',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appointments:[{id:'future',profileId:'primary',clinician:'Dr. Rivera',startsAt:new Date(now+8*86400000).toISOString(),reason:'Neurology follow-up',concerns:['Headache frequency'],questions:['What changed?'],status:'scheduled'}]})}));
  await page.route('**/api/visit-workflow/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({googleCalendarEnabled:false,googleCalendarFallback:true,appleCalendarEnabled:true,emailEnabled:true})}));
  let sent=null;
  await page.route('**/api/visit-brief/email',async route=>{sent=route.request().postDataJSON();await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({sent:true})})});
  await ready(page);
  await page.evaluate(()=>window.PametAdvancedVisitBrief.open());
  await page.locator('#emailReport').click();
  await page.locator('#visitBriefRecipient').fill('doctor@example.com');
  await page.locator('#visitBriefEmailSend').click();
  await expect.poll(()=>sent?.mode).toBe('advanced');
  expect(sent.snapshot.version).toBe('2.0');
  expect(Array.isArray(sent.snapshot.symptomInsights)).toBe(true);
});
