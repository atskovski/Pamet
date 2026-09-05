'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisitBriefPdf } = require('../lib/visit-brief-pdf');
const { buildIcs, googleEvent, signedCalendarState, readCalendarState, sendVisitBriefEmail, calendarConfig, visitBriefEmailStatus } = require('../routes/visit-workflow');

const appointment = {
  id:'123e4567-e89b-12d3-a456-426614174000',
  clinician:'Dr. Rivera',
  startsAt:'2026-09-18T16:30:00.000Z',
  reason:'Neurology follow-up - headache review',
  questions:['What changed since my last visit?','What should I keep tracking?'],
  reminderMinutes:1440
};

test('Advanced Visit Brief PDF is a real PDF and includes clinician-facing sections', () => {
  const pdf = createVisitBriefPdf({
    profileName:'Visit Brief Test',rangeLabel:'Most recent 90 days',generatedAt:'2026-09-05T05:00:00.000Z',
    appointment:{next:appointment},priorities:['Review headache frequency'],questions:appointment.questions,
    symptomInsights:[{name:'Headache',days:12,avg:6.25,trend:'Increasing in the recent period'}],
    medicationInsights:[{name:'Ibuprofen',occurrences:4,last:'2026-09-01T00:00:00.000Z'}],
    patterns:[{title:'Headache and short sleep',detail:'Repeated recorded association.',trackingSupport:'Moderate tracking support'}],
    timeline:[{date:'2026-09-01T00:00:00.000Z',label:'Headache recorded at 8/10',source:'Patient-entered journal'}],
    provenance:[['Symptoms','Patient-entered']],dataGaps:['Medication dose is not recorded.']
  }, 'advanced');
  assert.ok(Buffer.isBuffer(pdf));
  assert.match(pdf.subarray(0, 12).toString('utf8'), /^%PDF-1\.4/);
  const text = pdf.toString('latin1');
  assert.match(text, /Pamet Advanced Visit Brief/);
  assert.match(text, /Symptoms and trends/);
  assert.match(text, /Medication reconciliation support/);
  assert.ok(pdf.length > 1000);
});

test('Apple Calendar export is a standards-based ICS with reminder and visit details', () => {
  const ics = buildIcs(appointment, 'pamet.test');
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:pamet-123e4567-e89b-12d3-a456-426614174000@pamet\.test/);
  assert.match(ics, /DTSTART:20260918T163000Z/);
  assert.match(ics, /SUMMARY:Appointment with Dr\. Rivera/);
  assert.match(ics, /TRIGGER:-PT1440M/);
  assert.match(ics, /What changed since my last visit\?/);
  assert.match(ics, /END:VCALENDAR/);
});

test('Google Calendar event is private, deterministic, and carries the Pamet reminder', () => {
  const event = googleEvent(appointment);
  assert.match(event.id, /^pamet[0-9a-f]{40}$/);
  assert.equal(event.visibility, 'private');
  assert.equal(event.summary, 'Appointment with Dr. Rivera');
  assert.equal(event.reminders.useDefault, false);
  assert.deepEqual(event.reminders.overrides, [{method:'popup',minutes:1440}]);
  assert.equal(event.extendedProperties.private.pametAppointmentId, appointment.id);
  assert.match(event.description, /headache review/);
});

test('Direct Google Calendar OAuth remains disabled until explicitly enabled', () => {
  const previous = {
    flag:process.env.GOOGLE_CALENDAR_ENABLED,
    client:process.env.GOOGLE_OAUTH_CLIENT_ID,
    secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    state:process.env.OAUTH_STATE_SECRET
  };
  try {
    process.env.GOOGLE_OAUTH_CLIENT_ID='client';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET='secret';
    process.env.OAUTH_STATE_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef';
    delete process.env.GOOGLE_CALENDAR_ENABLED;
    assert.equal(calendarConfig('https://pamet.example').googleEnabled,false);
    process.env.GOOGLE_CALENDAR_ENABLED='true';
    assert.equal(calendarConfig('https://pamet.example').googleEnabled,true);
  } finally {
    if(previous.flag===undefined)delete process.env.GOOGLE_CALENDAR_ENABLED;else process.env.GOOGLE_CALENDAR_ENABLED=previous.flag;
    if(previous.client===undefined)delete process.env.GOOGLE_OAUTH_CLIENT_ID;else process.env.GOOGLE_OAUTH_CLIENT_ID=previous.client;
    if(previous.secret===undefined)delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;else process.env.GOOGLE_OAUTH_CLIENT_SECRET=previous.secret;
    if(previous.state===undefined)delete process.env.OAUTH_STATE_SECRET;else process.env.OAUTH_STATE_SECRET=previous.state;
  }
});

test('Google Calendar OAuth state is signed and tamper-evident', () => {
  const secret = '0123456789abcdef0123456789abcdef0123456789abcdef';
  const state = signedCalendarState('42', appointment.id, secret);
  assert.deepEqual(Object.assign({}, readCalendarState(state, secret), {nonce:'x',issuedAt:0}), {provider:'google-calendar',userId:'42',appointmentId:appointment.id,nonce:'x',issuedAt:0});
  assert.throws(() => readCalendarState(state + 'x', secret), /Invalid calendar authorization state/);
});

test('Visit Brief email fails closed until explicitly approved', async () => {
  const previous = {
    key:process.env.RESEND_API_KEY,
    from:process.env.EMAIL_FROM,
    flag:process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL
  };
  let attempted = false;
  try {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Pamet Test <test@example.com>';
    delete process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL;
    assert.deepEqual(visitBriefEmailStatus(), { providerConfigured:true, approved:false, enabled:false, reason:'privacy-review' });
    await assert.rejects(
      sendVisitBriefEmail({
        to:'recipient@example.com',subject:'Pamet Visit Brief',pdf:Buffer.from('%PDF-1.4'),filename:'visit-brief.pdf',
        fetchImpl:async () => { attempted=true; return {ok:true,status:200}; }
      }),
      (error) => error?.status === 503 && /temporarily unavailable/i.test(error.message)
    );
    assert.equal(attempted, false);
  } finally {
    if(previous.key===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous.key;
    if(previous.from===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=previous.from;
    if(previous.flag===undefined)delete process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL;else process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL=previous.flag;
  }
});

test('Visit Brief email reports provider-unconfigured after approval when Resend is missing', () => {
  const previous = {
    key:process.env.RESEND_API_KEY,
    from:process.env.EMAIL_FROM,
    flag:process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL
  };
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL='true';
    assert.deepEqual(visitBriefEmailStatus(), { providerConfigured:false, approved:true, enabled:false, reason:'provider-unconfigured' });
  } finally {
    if(previous.key===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous.key;
    if(previous.from===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=previous.from;
    if(previous.flag===undefined)delete process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL;else process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL=previous.flag;
  }
});

test('Resend email carries the Visit Brief as a PDF attachment and keeps health details out of the email body', async () => {
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  const oldFlag = process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL;
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'Pamet Test <test@example.com>';
  process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL = 'true';
  const pdf = createVisitBriefPdf({profileName:'Secret Patient',rangeLabel:'90 days',overview:[['Sensitive symptom','Private detail sentinel']]}, 'standard');
  let request;
  try {
    await sendVisitBriefEmail({
      to:'recipient@example.com',subject:'Pamet Visit Brief',pdf,filename:'visit-brief.pdf',
      fetchImpl:async (url, options) => { request={url,options}; return {ok:true,status:200}; }
    });
  } finally {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom;
    if (oldFlag === undefined) delete process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL; else process.env.PAMET_FEATURE_VISIT_BRIEF_EMAIL = oldFlag;
  }
  assert.equal(request.url, 'https://api.resend.com/emails');
  const body = JSON.parse(request.options.body);
  assert.equal(body.to[0], 'recipient@example.com');
  assert.equal(body.attachments[0].filename, 'visit-brief.pdf');
  assert.match(Buffer.from(body.attachments[0].content, 'base64').subarray(0, 12).toString('utf8'), /^%PDF-1\.4/);
  assert.doesNotMatch(body.html, /Private detail sentinel/);
  assert.match(body.html, /attached as a PDF/i);
});
