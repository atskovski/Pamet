/* Pamet v1.3.0 care-workspace DOM safeguards. */
(() => {
  'use strict';

  function normalize(root = document) {
    root.querySelectorAll?.('#appointmentForm .pamet-form-actions .btn-primary:not([type])').forEach((button) => {
      button.type = 'submit';
    });
    root.querySelectorAll?.('#phase2ShareForm #phase2ShareSubmit:not([type])').forEach((button) => {
      button.type = 'submit';
    });
    root.querySelectorAll?.('#addProfileForm .btn-primary:not([type])').forEach((button) => {
      button.type = 'submit';
    });
  }

  const refresh = () => normalize(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();

  /* These forms are rendered by known Pamet lifecycle actions; avoid rescanning the full DOM after every mutation. */
  document.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:login', refresh);
  window.addEventListener('pamet:registered', refresh);
  window.addEventListener('pamet:profile-updated', refresh);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-tab], [data-nav], #addProfile, #setCaregiver, #setPrimaryCare')) {
      requestAnimationFrame(refresh);
    }
  });
})();
