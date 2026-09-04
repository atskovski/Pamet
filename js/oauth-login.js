/* Pamet v1.6.3 — optional Google and Apple sign-in. */
(function () {
  'use strict';

  const USER_KEY = 'pamet_user_v1';
  const SESSION_KEY = 'pamet_session_v2';

  function randomHex(bytes) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  function existingLocalUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  function authMessage(message, isError = false) {
    let node = document.querySelector('#oauthLoginStatus');
    const loginForm = document.querySelector('#loginForm');
    if (!loginForm) return;
    if (!node) {
      node = document.createElement('p');
      node.id = 'oauthLoginStatus';
      node.className = 'oauth-login-status';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      loginForm.appendChild(node);
    }
    node.textContent = message || '';
    node.classList.toggle('error', !!isError);
    node.hidden = !message;
  }

  function createProviderButton(provider, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `oauth-provider-button oauth-provider-${provider}`;
    button.dataset.oauthProvider = provider;
    button.setAttribute('aria-label', `${label} to Pamet`);
    const mark = document.createElement('span');
    mark.className = 'oauth-provider-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = provider === 'google' ? 'G' : '';
    const text = document.createElement('span');
    text.textContent = label;
    button.append(mark, text);
    button.addEventListener('click', () => {
      button.disabled = true;
      authMessage(`Opening ${provider === 'google' ? 'Google' : 'Apple'} sign-in…`);
      location.assign(`/api/auth/oauth/${provider}/start`);
    });
    return button;
  }

  async function renderProviders() {
    const loginForm = document.querySelector('#loginForm');
    if (!loginForm || loginForm.querySelector('.oauth-login')) return;
    let providers;
    try {
      const response = await fetch('/api/auth/oauth/providers', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return;
      providers = await response.json();
    } catch { return; }
    if (!providers?.google && !providers?.apple) return;

    const section = document.createElement('section');
    section.className = 'oauth-login';
    section.setAttribute('aria-label', 'Other ways to sign in');
    section.innerHTML = '<div class="oauth-divider"><span>or continue with</span></div><div class="oauth-provider-list"></div><p class="oauth-account-note">New to Pamet? Signing in with Google or Apple can create your account. Your journal remains stored locally unless you choose a Pamet sync feature.</p>';
    const list = section.querySelector('.oauth-provider-list');
    if (providers.google) list.appendChild(createProviderButton('google', 'Continue with Google'));
    if (providers.apple) list.appendChild(createProviderButton('apple', 'Continue with Apple'));
    const registration = loginForm.querySelector('.welcome-switch');
    if (registration) registration.insertAdjacentElement('beforebegin', section);
    else loginForm.appendChild(section);
  }

  async function finishOAuthLogin(provider) {
    authMessage(`Finishing ${provider === 'apple' ? 'Apple' : 'Google'} sign-in…`);
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.user?.email) throw new Error(body.error || 'Pamet could not finish sign-in.');
      const existing = existingLocalUser();
      const email = String(body.user.email).trim().toLowerCase();
      if (existing?.email && String(existing.email).toLowerCase() !== email) {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        throw new Error('This browser contains local Pamet data for another account. Choose “Use a different account” before signing in with this provider so health data is not mixed between accounts.');
      }
      const local = {
        ...(existing || {}),
        id: existing?.id || body.user.id || crypto.randomUUID(),
        serverId: body.user.id || existing?.serverId || '',
        firstName: body.user.firstName || existing?.firstName || '',
        lastName: body.user.lastName || existing?.lastName || '',
        email,
        plan: body.user.plan || existing?.plan || 'free',
        authProvider: provider,
        createdAt: existing?.createdAt || new Date().toISOString()
      };
      delete local.deviceKey;
      localStorage.setItem(USER_KEY, JSON.stringify(local));
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: randomHex(16), at: Date.now(), provider }));
      window.dispatchEvent(new CustomEvent('pamet:login', { detail: window.PametAuth?.getUser?.() || local }));
      history.replaceState({}, document.title, '/');
      location.replace('/');
    } catch (error) {
      history.replaceState({}, document.title, '/');
      authMessage(error.message || 'Pamet could not finish sign-in.', true);
    }
  }

  function showOAuthError(code, provider) {
    const label = provider === 'apple' ? 'Apple' : 'Google';
    if (code === 'account_link_required') {
      authMessage(`This email already has a Pamet account. Log in with your Pamet password first before linking ${label}.`, true);
    } else {
      authMessage(`${label} sign-in could not be completed. You can try again or use your Pamet email and password.`, true);
    }
    history.replaceState({}, document.title, '/');
  }

  const params = new URLSearchParams(location.search);
  const completedProvider = params.get('oauth');
  const oauthError = params.get('oauth_error');
  const errorProvider = params.get('provider');

  if (completedProvider === 'google' || completedProvider === 'apple') finishOAuthLogin(completedProvider);
  else if (oauthError) showOAuthError(oauthError, errorProvider);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderProviders, { once: true });
  else renderProviders();
  window.addEventListener('pageshow', renderProviders);
})();
