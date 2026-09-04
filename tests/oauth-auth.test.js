'use strict';

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const oauthServer = fs.readFileSync('routes/oauth-auth.js', 'utf8');
const oauthClient = fs.readFileSync('js/oauth-login.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const cssMain = fs.readFileSync('css/main.css', 'utf8');
const migration = fs.readFileSync('db/migrations/2026-09-03-oauth-identities.sql', 'utf8');

test('OAuth uses signed state, nonce validation, JWKS verification, and server sessions', () => {
  assert.match(oauthServer, /createHmac\('sha256'/);
  assert.match(oauthServer, /timingSafeEqual/);
  assert.match(oauthServer, /claims\.nonce !== nonce/);
  assert.match(oauthServer, /crypto\.verify\('RSA-SHA256'/);
  assert.match(oauthServer, /https:\/\/www\.googleapis\.com\/oauth2\/v3\/certs/);
  assert.match(oauthServer, /https:\/\/appleid\.apple\.com\/auth\/keys/);
  assert.match(oauthServer, /HttpOnly; SameSite=Lax/);
});

test('Google and Apple provider tokens are not persisted', () => {
  assert.doesNotMatch(oauthServer, /INSERT[^\n]+access_token/i);
  assert.doesNotMatch(oauthServer, /INSERT[^\n]+refresh_token/i);
  assert.match(migration, /provider VARCHAR\(16\)/);
  assert.match(migration, /subject VARCHAR\(255\)/);
  assert.match(migration, /UNIQUE KEY uniq_user_provider/);
});

test('existing accounts only auto-link when provider email authority is strong', () => {
  assert.match(oauthServer, /providerEmailIsAuthoritative/);
  assert.match(oauthServer, /email\.endsWith\('@gmail\.com'\)/);
  assert.match(oauthServer, /!!claims\.hd/);
  assert.match(oauthServer, /provider === 'apple'/);
  assert.match(oauthServer, /account_link_required/);
});

test('login page keeps password registration plus optional Google and Apple paths', () => {
  assert.match(main, /\.\/oauth-login\.js/);
  assert.match(cssMain, /\.\/oauth-login\.css/);
  assert.match(oauthClient, /Continue with Google/);
  assert.match(oauthClient, /Continue with Apple/);
  assert.match(oauthClient, /New to Pamet\? Signing in with Google or Apple can create your account/);
  assert.match(oauthClient, /Use a different account/);
});
