/* Pamet v1.3.0 care-workspace DOM safeguards. */
(() => {
  'use strict';

  function normalize() {
    document.querySelectorAll('#appointmentForm .pamet-form-actions .btn-primary:not([type])').forEach((button) => {
      button.type = 'submit';
    });
    document.querySelectorAll('#phase2ShareForm #phase2ShareSubmit:not([type])').forEach((button) => {
      button.type = 'submit';
    });
    document.querySelectorAll('#addProfileForm .btn-primary:not([type])').forEach((button) => {
      button.type = 'submit';
    });
  }

  normalize();
  new MutationObserver(normalize).observe(document.body, { childList: true, subtree: true });
})();
