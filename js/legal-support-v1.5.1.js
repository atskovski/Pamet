/* Pamet v1.5.1 in-app safety, privacy, and troubleshooting guidance. */
(() => {
  'use strict';

  const VERSION = window.PametVersion || '1.5.1';
  const SAFETY = 'Pamet is not emergency monitoring, a diagnostic service, a clinical decision tool, or a replacement for professional medical care.';

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function openDialog(dialog, section) {
    if (!dialog) return;
    if (section) {
      const target = dialog.querySelector(`[data-support-section="${section}"]`);
      if (target) target.scrollIntoView({ block: 'start' });
    }
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    dialog.querySelector('[data-support-close]')?.focus();
  }

  function buildDialog() {
    if (document.querySelector('#pametSafetyDialog')) return document.querySelector('#pametSafetyDialog');
    const dialog = document.createElement('dialog');
    dialog.id = 'pametSafetyDialog';
    dialog.className = 'pamet-support-dialog';
    dialog.setAttribute('aria-labelledby', 'pametSafetyTitle');
    dialog.innerHTML = `
      <div class="pamet-support-shell">
        <div class="pamet-support-head">
          <div>
            <p class="pamet-support-kicker">PRIVACY, SAFETY &amp; SUPPORT</p>
            <h2 id="pametSafetyTitle">Pamet observes. Pamet does not diagnose.</h2>
          </div>
          <button type="button" class="pamet-support-close" data-support-close aria-label="Close">×</button>
        </div>

        <section data-support-section="scope">
          <h3>What Pamet is</h3>
          <p>Pamet is a personal health journal. It organizes information that <strong>you enter</strong>—such as symptoms, medications, mood, activity, lifestyle factors, notes, and appointments—so you can review your history and prepare for healthcare conversations.</p>
          <p>Pamet may show recorded associations, frequencies, changes, and trends. Those observations are based on your entries and are not medical conclusions.</p>
        </section>

        <section>
          <h3>What Pamet does not do</h3>
          <ul>
            <li>It does not diagnose a condition or determine a cause.</li>
            <li>It does not recommend, start, stop, or change medication or treatment.</li>
            <li>It does not replace a physician, pharmacist, therapist, emergency service, or other qualified professional.</li>
            <li>It does not continuously monitor you or guarantee that a concerning change will be detected.</li>
            <li>It is not an emergency alerting service.</li>
          </ul>
          <p class="pamet-support-callout">If you think you may be experiencing a medical emergency, use your local emergency services or seek immediate professional care. Do not wait for Pamet.</p>
        </section>

        <section data-support-section="privacy">
          <h3>Privacy and HIPAA information</h3>
          <p>Pamet is designed with privacy and data minimization in mind, but the presence of health information does not by itself make an application HIPAA compliant or make every user relationship subject to HIPAA. Whether HIPAA applies depends on the parties, use case, contracts, and legal role involved.</p>
          <p>Pamet does not claim HIPAA, SOC 2, or other independent compliance certification unless and until the applicable external legal, security, contractual, and audit requirements have been completed and documented.</p>
          <p>Journal information remains local-first by default. Explicit sharing, account services, subscription services, reminders, and optional encrypted sync use the backend only as described by the product and privacy controls.</p>
        </section>

        <section data-support-section="troubleshooting">
          <h3>Having trouble?</h3>
          <ol>
            <li>Check that you are online, then try the action once more.</li>
            <li>Refresh Pamet. Your local journal should remain on this browser/device.</li>
            <li>If an account or entitlement screen looks stale, log out and sign back in.</li>
            <li>For notifications, confirm browser/device notification permission is enabled.</li>
            <li>For billing, sharing, or sync issues, wait a moment and retry rather than submitting the same action repeatedly.</li>
          </ol>
          <p>If the problem continues, use <strong>Help improve Pamet</strong> in Settings and choose “Something isn’t working.” Do not include medical details, passwords, recovery keys, payment-card data, or other secrets in feedback.</p>
        </section>

        <section>
          <h3>Your role in the record</h3>
          <p>Pamet can only work with the information you provide. Missing, incorrect, incomplete, or delayed entries can change what Pamet displays. Review important information before sharing it with a healthcare professional.</p>
        </section>

        <div class="pamet-support-foot">
          <strong>${SAFETY}</strong>
          <span>Pamet v${VERSION} · Your health history, finally useful.</span>
        </div>
      </div>`;

    dialog.querySelector('[data-support-close]')?.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function installSettingsFooter() {
    const col = document.querySelector('#screen-settings .settings-col');
    if (!col || col.querySelector('.pamet-legal-footer')) return;

    const oldFooter = col.querySelector('.footer-line');
    if (oldFooter) oldFooter.hidden = true;

    const footer = document.createElement('section');
    footer.className = 'pamet-legal-footer';
    footer.setAttribute('aria-label', 'Pamet safety and legal information');
    footer.innerHTML = `
      <p>${SAFETY}</p>
      <button type="button" class="link-btn pamet-legal-link" data-open-safety>Privacy, safety &amp; HIPAA information</button>
      <p class="footer-line">Pamet v${VERSION} · Your health history, finally useful.</p>`;
    col.appendChild(footer);
    footer.querySelector('[data-open-safety]')?.addEventListener('click', () => openDialog(buildDialog(), 'scope'));
  }

  function installTroubleshootingLinks() {
    document.querySelectorAll('.form-error').forEach((error) => {
      if (error.parentElement?.querySelector('.pamet-troubleshoot-link')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-btn pamet-troubleshoot-link';
      button.textContent = 'Troubleshooting steps';
      button.addEventListener('click', () => openDialog(buildDialog(), 'troubleshooting'));
      error.insertAdjacentElement('afterend', button);
    });
  }

  function install() {
    buildDialog();
    installSettingsFooter();
    installTroubleshootingLinks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  document.addEventListener('pamet:settings-rendered', installSettingsFooter);

  const observer = new MutationObserver(() => {
    installSettingsFooter();
    installTroubleshootingLinks();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
