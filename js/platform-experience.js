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
    if (health.permission === 'default') return 'Notifications have not been enabled on this device yet.';
    if (health.permission === 'granted' && !health.subscribed) return 'Permission is allowed, but this device is not subscribed to Pamet reminders.';
    return 'Notifications are ready on this device.';
  }

  function setStatus(health) {
    const output = document.querySelector('#pametNotificationHealthText');
    const repair = document.querySelector('#pametNotificationRepair');
    const checked = document.querySelector('#pametNotificationCheckedAt');
    if (!output) return;
    output.textContent = statusText(health);
    output.dataset.state = health?.needsAttention ? 'attention' : 'ok';
    if (checked && health) checked.textContent = `Checked ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    if (!repair) return;
    repair.hidden = !health?.needsAttention;
    if (health?.permission === 'default') repair.textContent = 'Enable notifications';
    else if (health?.permission === 'denied') repair.textContent = 'How to enable';
    else if (health?.permission === 'granted' && !health?.subscribed) repair.textContent = 'Repair subscription';
    else repair.textContent = 'Repair';
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
      const checked = document.querySelector('#pametNotificationCheckedAt');
      if (output) output.textContent = 'Allow notifications for Pamet in this browser or device’s site settings, return here, then choose Check again.';
      if (checked) checked.textContent = 'Pamet cannot change browser or operating-system permission settings for you.';
      return;
    }

    if (health.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* browser controls permission UX */ }
    }

    let next = await platform.notificationHealth();
    if (next.permission === 'granted' && !next.subscribed) {
      const daily = document.querySelector('#setDailyReminder');
      if (daily) {
        if (!daily.checked) daily.click();
        else daily.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
      next = await platform.notificationHealth();
    }
    setStatus(next);
  }

  async function recheckNotifications() {
    const button = document.querySelector('#pametNotificationRecheck');
    const output = document.querySelector('#pametNotificationHealthText');
    const checked = document.querySelector('#pametNotificationCheckedAt');
    if (button) button.disabled = true;
    if (output) output.textContent = 'Checking notification permission and device subscription…';
    if (checked) checked.textContent = '';
    try {
      const next = await window.PametPlatform?.notificationHealth?.();
      if (next) setStatus(next);
      else if (output) output.textContent = 'Notification status is not available yet.';
    } catch {
      if (output) output.textContent = 'Pamet could not refresh notification status. Try again.';
    } finally {
      if (button) button.disabled = false;
    }
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
          <p id="pametNotificationCheckedAt" class="platform-setting-help" aria-live="polite"></p>
          <p class="platform-setting-help">This checks whether the browser supports notifications, whether permission is allowed, and whether this device has an active Pamet push subscription. It does not read or send health-journal content.</p>
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
    section.querySelector('#pametNotificationRecheck')?.addEventListener('click', recheckNotifications);
    window.PametPlatform?.notificationHealth?.().then(setStatus).catch(() => {});
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
