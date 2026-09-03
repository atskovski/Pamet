'use strict';

const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const planning = fs.readFileSync('js/care-planning.js', 'utf8');
const careWorkspace = fs.readFileSync('js/care-workspace.js', 'utf8');
const theme = fs.readFileSync('css/care-planning.css', 'utf8');
const releaseTheme = fs.readFileSync('css/theme.css', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const schema = fs.readFileSync('db/schema.sql', 'utf8');

function check(condition, message) { if (!condition) throw new Error(message); }
function luminance(hex) { const values = hex.match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; }
function contrast(a, b) { const first = luminance(a), second = luminance(b); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); }

check(html.includes('dist/pamet.min.css') && html.includes('dist/pamet.min.js'), 'The production bundle must load.');
check(['removeSymptomMinus','removeMoodMinus','removeActivityMinus','removeMedMinus'].every((id) => html.includes(`id="${id}"`)), 'Every log category must expose a remove control.');
check(store.includes('pamet_profiles_v2') && store.includes('addProfile(name') && store.includes('switchProfile(id)') && store.includes('saveRaw([], profile.id)'), 'Ultra profiles must persist separately and new profiles must start with zero entries.');
check(app.includes('S.removeCustomField(category, value)') && app.includes('confirm(`Remove “${value}”'), 'Custom-field removal must identify and confirm the selected item.');
check(planning.includes('Currently viewing') && planning.includes('Fresh profile · 0 entries') && planning.includes('Create &amp; switch'), 'Settings must show the active profile and confirm a fresh profile before switching.');
check(planning.includes('Existing profiles and health data are preserved') && planning.includes('S.switchProfile(profile.id)'), 'Creating a profile must preserve existing data and explicitly switch only after approval.');
check(planning.includes('Appointment workspace') && planning.includes('Discussion guide') && planning.includes('Local planning mode') && planning.includes('Save draft on this device'), 'Appointment preparation must remain usable when server authentication needs reconnection.');
check(planning.includes('Visit type') && planning.includes('Reminder timing') && planning.includes('Patterns to mention') && planning.includes('Before the visit'), 'Appointment workspace must provide visit planning, reminder timing, patterns, and a discussion checklist.');
check(careWorkspace.includes("#appointmentForm .pamet-form-actions .btn-primary:not([type])") && careWorkspace.includes("button.type = 'submit'"), 'Appointment form submit semantics must be explicit after dynamic rendering.');
check(planning.includes('Invitation sent') && planning.includes('Sending a secure invitation') && planning.includes('emailEnabled'), 'Advanced sharing must keep send progress and confirmation inside the sharing window and verify email configuration.');
check(planning.includes('/api/sharing/invites') && server.includes("app.post('/api/sharing/invites'") && server.includes('await mail(recipient'), 'Advanced sharing must use the real backend email invitation route.');
check(server.includes("app.get('/api/appointments', auth") && server.includes("app.post('/api/appointments'") && server.includes("app.delete('/api/appointments/:id'"), 'Appointment workspace must use authenticated Ultra backend persistence.');
check(server.includes('permission_level') && schema.includes('permission_level') && schema.includes('pamet_appointments'), 'Sharing permissions and appointments must remain persisted in MySQL.');
check(theme.includes('.phase2-profile-switcher') && theme.includes('.phase2-appointment-grid') && theme.includes('.phase2-share-result'), 'Profile, appointment, and sharing surfaces must have dedicated responsive layouts.');
check(releaseTheme.includes('--app-background: #182326') && releaseTheme.includes('--border-color: #7C8F93') && releaseTheme.includes('--text-primary: #F5F8F7'), 'The neutral dark palette must remain active.');
check(contrast('F5F8F7', '263438') >= 4.5 && contrast('D5DEDC', '263438') >= 4.5 && contrast('7C8F93', '263438') >= 3, 'Dark text and control boundaries must meet WCAG AA contrast targets.');

console.log('Pamet care workspace checks passed.');
