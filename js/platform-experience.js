/* Pamet platform experience: visible data portability and notification-health controls. */
(function () {
  'use strict';

  const PLATFORM_SECTION_ID = 'pametPlatformSettings';

  function settingsScope() {
    const anchor = document.querySelector('#settingsTier, #settingsEmail, #setDailyReminder');
    return anchor?.closest('[data-view], .view, .screen, .tab-panel, main') || document.querySelector('[data-view="settings"], #settings') || null;
  }

  function statusText(health) {
    if (!health) return 'Checking notification status…';
    if (!health.supported) return 'Closed-app notifications are not supported by this browser.';
    if (health.permission === 'denied') return 'Notifications are blocked in browser or device settings.';
    if (health.permission === 'default') return 'Notification permission has not been decided yet.';
    if (health.permission === 'granted' && !health.subscribed) return 'Permission is allowed, but this device is not subscribed.';
    return 'Notifications are available on this device.';
  }

  function setStatus(health) {
    const output = document.querySelector('#pametNotificationHealthText');
    const repair = document.querySelector('#pametNotificationRepair');
    if (!output) return;
    output.textContent = statusText(health);
    output.dataset.state = health?.needsAttention ? 'attention' : 'ok';
    if (repair) repair.hidden = !health?.needsAttention;
  }

  async function repairNotifications() {
    const platform = window.PametPlatform;
    const health = await platform?.notificationHealth?.();
    if (!health) return;

    if (!health.supported) {
      setStatus(health);
      return;
    }

    if (health.permission === 'denied') {
      const output = document.querySelector('#pametNotificationHealthText');
      if (output) output.textContent = 'Open your browser or device site settings, allow notifications for Pamet, then choose Check again.';
      return;
    }

    if (health.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* browser controls permission UX */ }
    }

    const next = await platform.notificationHealth();
    if (next.permission === 'granted' && !next.subscribed) {
      const daily = document.querySelector('#setDailyReminder');
      if (daily) {
        if (!daily.checked) daily.click();
        else daily.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    setTimeout(() => platform.notificationHealth(), 300);
  }

  function downloadData() {
    const output = document.querySelector('#pametExportStatus');
    try {
      const payload = window.PametPlatform?.downloadJson?.();
      if (output && payload) output.textContent = `Export prepared ${new Date(payload.exportedAt).toLocaleString()}.`;
    } catch {
      if (output) output.textContent = 'Pamet could not prepare the export on this device.';
    }
  }

  function buildSection() {
    if (document.getElementById(PLATFORM_SECTION_ID)) return document.getElementById(PLATFORM_SECTION_ID);
    const scope = settingsScope();
    if (!scope) return null;

    const section = document.createElement('section');
    section.id = PLATFORM_SECTION_ID;
    section.className = 'platform-settings-card';
    section.setAttribute('aria-labelledby', 'pametPlatformSettingsTitle');
    section.innerHTML = `
      <div class="platform-settings-head">
        <div>
          <p class="platform-settings-kicker">DATA &amp; DEVICE HEALTH</p>
          <h3 id="pametPlatformSettingsTitle">Portability and notifications</h3>
        </div>
      </div>
      <div class="platform-setting-row">
        <div>
          <strong>Download my Pamet data</strong>
          <p>Creates a JSON export of the profiles, settings, and journal entries stored on this device. The file is generated locally in your browser.</p>
          <p class="platform-setting-status" id="pametExportStatus" role="status"></p>
        </div>
        <button type="button" class="btn secondary platform-setting-action" id="pametDownloadData">Download JSON</button>
      </div>
      <div class="platform-setting-row">
        <div>
          <strong>Notification health</strong>
          <p id="pametNotificationHealthText" class="platform-setting-status" role="status">Checking notification status…</p>
          <p class="platform-setting-help">Pamet can check permission and subscription state, but browser or operating-system settings may still require a manual change.</p>
        </div>
        <div class="platform-setting-actions">
          <button type="button" class="btn secondary platform-setting-action" id="pametNotificationRepair" hidden>Repair</button>
          <button type="button" class="btn ghost platform-setting-action" id="pametNotificationRecheck">Check again</button>
        </div>
      </div>`;

    const footer = scope.querySelector('.footer-line, footer');
    if (footer?.parentNode) footer.parentNode.insertBefore(section, footer);
    else scope.appendChild(section);

    section.querySelector('#pametDownloadData')?.addEventListener('click', downloadData);
    section.querySelector('#pametNotificationRepair')?.addEventListener('click', repairNotifications);
    section.querySelector('#pametNotificationRecheck')?.addEventListener('click', () => window.PametPlatform?.notificationHealth?.());
    window.PametPlatform?.notificationHealth?.().then(setStatus);
    return section;
  }

  function refresh() {
    buildSection();
    if (window.PametNotificationHealth) setStatus(window.PametNotificationHealth);
  }

  window.addEventListener('pamet:notification-health', (event) => setStatus(event.detail));
  window.addEventListener('pamet:settings-rendered', refresh);
  window.addEventListener('pamet:capabilities', refresh);
  window.addEventListener('load', () => setTimeout(refresh, 0), { once: true });
})();
