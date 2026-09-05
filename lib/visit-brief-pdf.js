'use strict';

const clean = (value, max = 1000) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const ascii = (value) => clean(value, 4000)
  .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, '-').replace(/•/g, '-')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
const pdfEscape = (value) => ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function wrap(text, width = 92) {
  const source = ascii(text);
  if (!source) return [''];
  const words = source.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) { current = word; continue; }
    if ((current + ' ' + word).length <= width) { current += ' ' + word; continue; }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function addText(lines, text, options = {}) {
  const { bold = false, size = 10, indent = 0, gapBefore = 0, width = 92 } = options;
  wrap(text, Math.max(30, width - Math.round(indent / 5))).forEach((part, index) => lines.push({ text: part, bold, size, indent, gapBefore: index === 0 ? gapBefore : 0 }));
}
function addHeading(lines, text) { addText(lines, text, { bold: true, size: 12, gapBefore: 10, width: 82 }); }
function addBullet(lines, text) { addText(lines, `- ${text}`, { indent: 10, width: 88 }); }
function fmt(value) { if (!value) return 'Not recorded'; const d = new Date(value); return Number.isNaN(+d) ? 'Not recorded' : d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }

function standardLines(snapshot = {}) {
  const lines = [];
  addText(lines, 'Pamet Visit Brief', { bold:true, size:18 });
  addText(lines, `${clean(snapshot.profileName || 'Pamet profile', 100)} | ${clean(snapshot.rangeLabel || 'Recorded history', 100)}`, { size:10, gapBefore:4 });
  addText(lines, `Generated ${fmt(snapshot.generatedAt || new Date())}`, { size:9 });
  addText(lines, 'Patient-generated summary for discussion with a care team. This document is not a diagnosis or clinical assessment.', { size:9, gapBefore:6 });

  addHeading(lines, 'Overview');
  (Array.isArray(snapshot.overview) ? snapshot.overview : []).slice(0, 20).forEach((row) => addBullet(lines, `${clean(row?.[0], 120)}: ${clean(row?.[1], 500)}`));

  if (Array.isArray(snapshot.breakdown) && snapshot.breakdown.length) {
    addHeading(lines, 'Symptom breakdown');
    snapshot.breakdown.slice(0, 20).forEach((row) => addBullet(lines, `${clean(row?.[0], 120)}: ${clean(row?.[1], 500)}`));
  }
  if (Array.isArray(snapshot.patterns) && snapshot.patterns.length) {
    addHeading(lines, 'Pamet observations');
    snapshot.patterns.slice(0, 12).forEach((item) => addBullet(lines, typeof item === 'string' ? clean(item, 900) : `${clean(item?.title, 180)}: ${clean(item?.detail, 800)}`));
  }
  if (Array.isArray(snapshot.medications) && snapshot.medications.length) {
    addHeading(lines, 'Medications recorded');
    snapshot.medications.slice(0, 20).forEach((row) => addBullet(lines, `${clean(row?.[0], 160)}: ${clean(row?.[1], 500)}`));
  }
  if (Array.isArray(snapshot.notes) && snapshot.notes.length) {
    addHeading(lines, 'Selected patient notes');
    snapshot.notes.slice(0, 12).forEach((note) => addBullet(lines, `${fmt(note?.date)}: ${clean(note?.notes, 900)}`));
  }
  return lines;
}

function advancedLines(snapshot = {}) {
  const lines = [];
  addText(lines, 'Pamet Advanced Visit Brief', { bold:true, size:18 });
  addText(lines, `${clean(snapshot.profileName || 'Pamet profile', 100)} | ${clean(snapshot.rangeLabel || 'Recorded history', 100)}`, { size:10, gapBefore:4 });
  addText(lines, `Generated ${fmt(snapshot.generatedAt || new Date())}`, { size:9 });
  addText(lines, clean(snapshot.disclaimer || 'Patient-generated Advanced Visit Brief from user-recorded information. Pamet organizes recorded history and associations; it does not establish diagnosis, cause, prognosis, or treatment effect.', 1200), { size:9, gapBefore:6 });

  const next = snapshot.appointment?.next;
  addHeading(lines, 'Next visit');
  addBullet(lines, `Date: ${fmt(next?.startsAt)}`);
  addBullet(lines, `Clinician or practice: ${clean(next?.clinician || 'Not entered', 180)}`);
  addBullet(lines, `Reason: ${clean(next?.reason || 'Not entered', 900)}`);

  addHeading(lines, 'Patient priorities');
  (Array.isArray(snapshot.priorities) && snapshot.priorities.length ? snapshot.priorities : ['Not entered in Appointment Workspace.']).slice(0, 8).forEach((item) => addBullet(lines, clean(item, 900)));
  addHeading(lines, 'Questions for the visit');
  (Array.isArray(snapshot.questions) && snapshot.questions.length ? snapshot.questions : ['Not entered in Appointment Workspace.']).slice(0, 10).forEach((item) => addBullet(lines, clean(item, 900)));

  if (snapshot.sinceLastVisit) {
    addHeading(lines, 'Since last recorded visit');
    addBullet(lines, `Since ${fmt(snapshot.sinceLastVisit.startsAt)}: ${Number(snapshot.sinceLastVisit.days || 0)} logged days and ${Number(snapshot.sinceLastVisit.entries || 0)} entries.`);
  }

  if (Array.isArray(snapshot.symptomInsights) && snapshot.symptomInsights.length) {
    addHeading(lines, 'Symptoms and trends');
    snapshot.symptomInsights.slice(0, 16).forEach((item) => addBullet(lines, `${clean(item?.name, 140)}: ${Number(item?.days || 0)} recorded days; average severity ${Number.isFinite(Number(item?.avg)) ? Number(item.avg).toFixed(1) + '/10' : 'not recorded'}; ${clean(item?.trend || 'No recent comparison', 300)}.`));
  }
  if (Array.isArray(snapshot.medicationInsights) && snapshot.medicationInsights.length) {
    addHeading(lines, 'Medication reconciliation support');
    snapshot.medicationInsights.slice(0, 20).forEach((item) => addBullet(lines, `${clean(item?.name, 160)}: ${Number(item?.occurrences || 0)} recorded instance(s); last recorded ${fmt(item?.last)}; dose and schedule not recorded.`));
  }
  if (Array.isArray(snapshot.patterns) && snapshot.patterns.length) {
    addHeading(lines, 'Pamet recorded associations');
    snapshot.patterns.slice(0, 12).forEach((item) => addBullet(lines, `${clean(item?.title, 180)}: ${clean(item?.detail, 800)} ${clean(item?.trackingSupport || '', 140)}`));
  }
  if (snapshot.recentContext) {
    addHeading(lines, 'Recorded context');
    addBullet(lines, `Average sleep: ${clean(snapshot.recentContext.averageSleepHours ?? 'Not recorded', 80)} hours`);
    addBullet(lines, `Average stress: ${clean(snapshot.recentContext.averageStress ?? 'Not recorded', 80)} / 10`);
    addBullet(lines, `Average hydration: ${clean(snapshot.recentContext.averageHydrationGlasses ?? 'Not recorded', 80)} glasses`);
    addBullet(lines, `Activity: ${clean(snapshot.recentContext.activity || 'Not recorded', 220)}`);
  }
  if (Array.isArray(snapshot.timeline) && snapshot.timeline.length) {
    addHeading(lines, 'Clinical timeline');
    snapshot.timeline.slice(0, 18).forEach((item) => addBullet(lines, `${fmt(item?.date)}: ${clean(item?.label, 700)} (${clean(item?.source, 180)})`));
  }
  if (Array.isArray(snapshot.provenance) && snapshot.provenance.length) {
    addHeading(lines, 'Data provenance');
    snapshot.provenance.slice(0, 12).forEach((row) => addBullet(lines, `${clean(row?.[0], 500)}: ${clean(row?.[1], 400)}`));
  }
  if (Array.isArray(snapshot.dataGaps) && snapshot.dataGaps.length) {
    addHeading(lines, 'Known data gaps');
    snapshot.dataGaps.slice(0, 12).forEach((item) => addBullet(lines, clean(item, 900)));
  }
  return lines;
}

function paginate(lines) {
  const pages = [];
  let page = [];
  let y = 756;
  for (const line of lines) {
    const leading = Math.max(12, line.size + 3);
    const needed = leading + (line.gapBefore || 0);
    if (y - needed < 54 && page.length) { pages.push(page); page = []; y = 756; }
    y -= line.gapBefore || 0;
    page.push({ ...line, y });
    y -= leading;
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function renderPdf(lines) {
  const pages = paginate(lines);
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalogRef = add('');
  const pagesRef = add('');
  const regularFontRef = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontRef = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageRefs = [];

  for (const pageLines of pages) {
    const stream = pageLines.map((line) => `BT /F${line.bold ? 'B' : 'R'} ${line.size} Tf 1 0 0 1 ${50 + (line.indent || 0)} ${line.y} Tm (${pdfEscape(line.text)}) Tj ET`).join('\n');
    const streamRef = add(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    const pageRef = add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /FR ${regularFontRef} 0 R /FB ${boldFontRef} 0 R >> >> /Contents ${streamRef} 0 R >>`);
    pageRefs.push(pageRef);
  }
  objects[catalogRef - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
  objects[pagesRef - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

  let output = '%PDF-1.4\n%Pamet\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'utf8');
}

function createVisitBriefPdf(snapshot, mode = 'standard') {
  return renderPdf(mode === 'advanced' ? advancedLines(snapshot) : standardLines(snapshot));
}

module.exports = { createVisitBriefPdf, standardLines, advancedLines, renderPdf };
