'use strict';

// Loaded only by the CI integration child process through NODE_OPTIONS.
// It prevents test runs from sending real email or depending on external
// password-corpus availability while leaving localhost HTTP untouched.
const fs = require('fs');

const nativeFetch = globalThis.fetch;

if (typeof nativeFetch !== 'function') throw new Error('Integration tests require native fetch.');

globalThis.fetch = async function integrationFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);

  if (url === 'https://api.resend.com/emails') {
    const capture = process.env.PAMET_TEST_EMAIL_CAPTURE;
    if (!capture) throw new Error('PAMET_TEST_EMAIL_CAPTURE is required for integration email interception.');
    const body = typeof init.body === 'string' ? init.body : String(init.body || '{}');
    fs.appendFileSync(capture, `${body}\n`, 'utf8');
    return new Response(JSON.stringify({ id: 'email_ci_intercepted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (url.startsWith('https://api.pwnedpasswords.com/range/')) {
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return nativeFetch(input, init);
};
