'use strict';

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const auth = fs.readFileSync('js/auth.js', 'utf8');
const login = fs.readFileSync('js/login-experience.js', 'utf8');
const accountSwitch = fs.readFileSync('js/account-switch.js', 'utf8');
const edge = fs.readFileSync('secure-server.js', 'utf8');
const css = fs.readFileSync('css/remember-me.css', 'utf8');

test('login exposes an accessible Remember me preference with clear device guidance', () => {
  assert.match(login, /loginRemember/);
  assert.match(login, /checkbox\.type = "checkbox"/);
  assert.match(login, /Remember me/);
  assert.match(login, /30 days/);
  assert.match(login, /shared device/);
  assert.match(css, /\.remember-me-row/);
  assert.match(css, /focus-visible/);
});

test('remembered login persists a session marker, not a plain-text password', () => {
  assert.match(auth, /REMEMBERED_EMAIL_KEY="pamet_login_email_v1"/);
  assert.match(auth, /sessionStorage\.setItem\(SESSION_KEY/);
  assert.match(auth, /localStorage\.setItem\(SESSION_KEY/);
  assert.match(auth, /rememberMe:!!rememberMe/);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^\n]*(?:password|loginPassword)/i);
  assert.doesNotMatch(auth, /sessionStorage\.setItem\([^\n]*(?:password|loginPassword)/i);
});

test('server makes an explicitly non-remembered login cookie session-only', () => {
  assert.match(edge, /function applyLoginCookiePolicy/);
  assert.match(edge, /req\.body\.rememberMe !== false/);
  assert.match(edge, /pamet_session=/);
  assert.match(edge, /replace\(\/;\\s\*Max-Age=\\d\+\/i, ''\)/);
  assert.match(edge, /app\.post\('\/api\/auth\/login', parseAuthJson, accountLoginLimit, applyLoginCookiePolicy\)/);
});

test('account isolation guard forwards login persistence options', () => {
  assert.match(accountSwitch, /guardedLogin\(email, password, options\)/);
  assert.match(accountSwitch, /originalLogin\(email, password, options\)/);
});
