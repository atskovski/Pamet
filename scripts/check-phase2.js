'use strict';

const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const phase2 = fs.readFileSync('js/phase2.js', 'utf8');
const theme = fs.readFileSync('css/phase2.css', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const schema = fs.readFileSync('db/schema.sql', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }
function luminance(hex) { const values = hex.match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; }
function contrast(a, b) { const first = luminance(a), second = luminance(b); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); }

check(html.includes('css/phase2.css') && html.includes('js/phase2.js'), 'Phase 2 assets must load.');
check(['removeSymptomMinus','removeMoodMinus','removeActivityMinus','removeMedMinus'].every((id) => html.includes(`id="${id}"`)), 'Every log category must expose a remove control.');
check(store.includes('const SYMPTOMS = ["Headache","Migraine","Fatigue","Back pain","Joint pain","Nausea","Dizziness","Stomach pain","Brain fog","Shortness of breath"]'), 'The researched ten-symptom starter set must remain stable.');
check(store.includes('pamet_profiles_v2') && store.includes('addProfile(name') && store.includes('switchProfile(id)'), 'Ultra profiles must have separate local persistence.');
check(app.includes('S.removeCustomField(category, value)') && app.includes('confirm(`Remove “${value}”'), 'Custom-field removal must identify and confirm the selected item.');
check(phase2.includes('Appointment preparation') && phase2.includes('Longitudinal analysis') && phase2.includes('Advanced Visit Brief') && phase2.includes('Advanced sharing'), 'All Ultra preparation tools must be implemented.');
check(theme.includes('--app-background: #1B3434') && theme.includes('--border-color: #82A19B') && theme.includes('--text-primary: #F7FAF8'), 'The accessible layered dark palette must remain active.');
check(contrast('F7FAF8', '294846') >= 4.5 && contrast('D9E5E0', '294846') >= 4.5 && contrast('82A19B', '294846') >= 3, 'Dark text and control boundaries must meet WCAG AA contrast targets.');
check(server.includes("app.delete('/api/account',auth") && server.includes('stripe.subscriptions.cancel'), 'Account deletion must remove backend data and cancel active billing.');
check(server.includes('permission_level') && schema.includes('permission_level'), 'Advanced sharing permissions must be persisted by the backend.');
check(server.includes("version:'2.0.0'"), 'The health endpoint must report v2.0.0.');

console.log('Pamet Phase 2 checks passed.');
