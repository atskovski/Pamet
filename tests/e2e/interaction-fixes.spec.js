'use strict';

const { test, expect } = require('@playwright/test');

async function startSyntheticFreeSession(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.addInitScript(({ id }) => {
    const user = {
      id: `interaction-${id}`,
      firstName: 'Interaction',
      lastName: 'Fixes',
      email: `interaction-${id}@pamet.test`,
      plan: 'free',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: `interaction-session-${id}`, at: Date.now() }));
  }, { id: unique });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => typeof window.PametLoadAuthenticatedFeatures === 'function');
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

async function addCustomSymptom(page, name) {
  await page.locator('#addSymptomPlus').click();
  await page.locator('[data-log-custom-input]').fill(name);
  await page.locator('[data-log-custom-save]').click();
  await expect(page.locator('#pametLogPlanDialog')).toHaveCount(0);
}

async function seedPatternHistory(page) {
  await page.evaluate(() => {
    const store = window.PametStore;
    const now = new Date();
    [0, 10, 40, 70].forEach((offset, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      store.addEntry({
        id: `pattern-${Date.now()}-${index}`,
        date: date.toISOString(),
        symptoms: ['Headache'],
        severity: 4 + index,
        sleepHours: 7,
        stressLevel: 4,
        waterGlasses: 6,
        energyLevel: 6,
        mood: 'Okay',
        activity: 'Walk',
        medications: [],
        notes: ''
      });
    });
  });
}

test('@production Patterns windows, finding details, evidence, archive actions, and Free long-history locks are functional', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);
  await seedPatternHistory(page);
  await page.locator('[data-tab="patterns"]').click();

  const windows = page.locator('#screen-patterns [data-insights-days]');
  await expect(windows).toHaveCount(7);
  await expect(page.locator('[data-insights-days="7"]')).toHaveClass(/active/);
  await expect(page.locator('#screen-patterns .insights-window-summary')).toContainText('last 7 days');
  await expect(page.locator('#screen-patterns .insights-findings-card .pamet-eyebrow')).toContainText('7-day window');
  await expect(page.locator('[data-insights-days="180"]')).toHaveClass(/history-locked/);
  await expect(page.locator('[data-insights-days="365"]')).toHaveClass(/history-locked/);
  await expect(page.locator('#screen-patterns [data-pattern-count]')).toHaveText('0');
  await expect(page.locator('#screen-patterns .insights-chart-card')).toBeVisible();
  await expect(page.locator('#screen-patterns [data-chart-mode="advanced"]')).toContainText('Pro+');

  for (const days of [14, 30, 60, 90, 7]) {
    await page.locator(`[data-insights-days="${days}"]`).click();
    await expect(page.locator(`[data-insights-days="${days}"]`)).toHaveClass(/active/);
    await expect(page.locator('#screen-patterns .insights-window-summary')).toContainText(`last ${days} days`);
    await expect(page.locator('#screen-patterns .insights-findings-card .pamet-eyebrow')).toContainText(`${days}-day window`);
    await expect(page.locator('#screen-patterns .tracking-quality-card .pamet-eyebrow').first()).toContainText(`last ${days} days`);
    await expect(page.locator('#screen-patterns .insights-chart-card')).toHaveAttribute('data-chart-window', String(days));
  }

  await page.locator('[data-insights-days="180"]').click();
  await expect(page.locator('#pametEntitlementLockTitle')).toContainText('Long-term insights is included with Pro and Ultra');
  await expect(page.locator('[data-insights-days="7"]')).toHaveClass(/active/);
  await page.locator('[data-entitlement-close]').click();

  await page.locator('[data-insights-days="30"]').click();
  await expect(page.locator('#screen-patterns [data-pattern-count]')).toHaveText('1');
  const preview = page.locator('#screen-patterns .finding-preview').first();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Headache is your most frequently recorded symptom');
  await expect(preview).toContainText('2 supporting entries');

  const card = page.locator('#screen-patterns .observation-card').first();
  await expect(card).toBeVisible();
  await card.locator('[data-observation-evidence]').click();
  await expect(card.locator('.observation-evidence')).toBeVisible();
  await expect(card.locator('.observation-evidence')).toContainText('Why Pamet surfaced this');
  await expect(card.locator('.observation-evidence')).toContainText('30-day window');

  await card.locator('[data-observation-archive]').click();
  await expect(page.locator('#screen-patterns .insights-action-status')).toContainText('Observation archived');
  await expect(page.locator('#screen-patterns [data-pattern-count]')).toHaveText('0');
  const archivedToggle = page.locator('#screen-patterns .archived-toggle');
  await expect(archivedToggle).toContainText('Archived (1)');
  await archivedToggle.click();
  await expect(page.locator('#screen-patterns .observation-card').first()).toBeVisible();
  await expect(page.locator('#screen-patterns .observation-card').first().locator('[data-observation-archive]')).toContainText('Restore');
});

test('@production Pattern count and named findings recompute when the selected window changes', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);
  await page.evaluate(() => {
    const store = window.PametStore;
    const now = new Date();
    [10, 20].forEach((offset, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      store.addEntry({
        id: `window-pattern-${Date.now()}-${index}`,
        date: date.toISOString(),
        symptoms: ['Headache'],
        severity: 5,
        sleepHours: 7,
        stressLevel: 3,
        waterGlasses: 6,
        energyLevel: 6,
        mood: 'Okay',
        activity: 'Walk',
        medications: [],
        notes: 'Window-specific pattern fixture'
      });
    });
  });

  await page.locator('[data-tab="patterns"]').click();
  await expect(page.locator('#screen-patterns [data-pattern-count]')).toHaveText('0');
  await expect(page.locator('#screen-patterns #findingsTitle')).toHaveText('Start your baseline');
  await expect(page.locator('#screen-patterns .finding-preview')).toHaveCount(0);

  await page.locator('[data-insights-days="30"]').click();
  await expect(page.locator('#screen-patterns [data-pattern-count]')).toHaveText('1');
  await expect(page.locator('#screen-patterns #findingsTitle')).toHaveText('1 pattern worth reviewing');
  await expect(page.locator('#screen-patterns .finding-preview')).toHaveCount(1);
  await expect(page.locator('#screen-patterns .finding-preview').first()).toContainText('Headache');

  await page.locator('[data-insights-days="7"]').click();
  await expect(page.locator('#screen-patterns [data-pattern-count]')).toHaveText('0');
  await expect(page.locator('#screen-patterns .finding-preview')).toHaveCount(0);
});

test('@production Tracking quality separates logging consistency, entry detail, baseline mix, and field coverage', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);
  await page.evaluate(() => {
    const store = window.PametStore;
    store.addEntry({
      id: `completeness-${Date.now()}`,
      date: new Date().toISOString(),
      symptoms: ['Headache'],
      severity: 4,
      sleepHours: 7,
      stressLevel: 3,
      waterGlasses: 7,
      energyLevel: 6,
      mood: 'Okay',
      activity: 'Walk',
      medications: [],
      notes: 'Complete entry fixture'
    });
  });
  await page.locator('[data-tab="patterns"]').click();

  const quality = page.locator('#screen-patterns .tracking-quality-card');
  await expect(quality).toBeVisible();
  await expect(quality.locator('.tracking-quality-head .pamet-eyebrow')).toHaveText('Tracking quality · last 7 days');
  await expect(quality.locator('#trackingQualityTitle')).toHaveText('Limited tracking foundation');
  await expect(quality.locator('[data-quality-metric="consistency"] strong')).toHaveText('14%');
  await expect(quality.locator('[data-quality-metric="consistency"]')).toContainText('1 of 7 calendar days logged');
  await expect(quality.locator('[data-quality-metric="detail"] strong')).toHaveText('100%');
  await expect(quality.locator('[data-quality-metric="baseline"] strong')).toHaveText('1 / 0');
  await expect(quality.locator('[data-quality-next]')).toContainText('Log 2 more days');
  await expect(quality.locator('.quality-field')).toHaveCount(7);
  await expect(quality.locator('[data-quality-field="notes"]')).toContainText('1 of 1 logged entry');
  await expect(quality.locator('.quality-footnote')).toContainText('does not measure diagnostic certainty');

  const layout = await quality.evaluate((element) => {
    const metrics = element.querySelector('.quality-metrics');
    const fields = element.querySelector('.quality-fields-grid');
    return {
      metricTracks: getComputedStyle(metrics).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      fieldTracks: getComputedStyle(fields).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      viewportWidth: window.innerWidth
    };
  });

  if (layout.viewportWidth > 980) {
    expect(layout.metricTracks).toBe(3);
    expect(layout.fieldTracks).toBe(4);
  } else if (layout.viewportWidth > 620) {
    expect(layout.metricTracks).toBe(2);
    expect(layout.fieldTracks).toBe(2);
  } else {
    expect(layout.metricTracks).toBe(1);
    expect(layout.fieldTracks).toBe(1);
  }

  await page.locator('[data-insights-days="30"]').click();
  await expect(quality.locator('.tracking-quality-head .pamet-eyebrow')).toHaveText('Tracking quality · last 30 days');
  await expect(quality.locator('[data-quality-metric="consistency"] strong')).toHaveText('3%');
  await expect(quality.locator('[data-quality-metric="consistency"]')).toContainText('1 of 30 calendar days logged');
  await expect(quality.locator('[data-quality-field="sleep"]')).toContainText('1 of 1 logged entry');
});

test('@production Log counters react to selections while preserving custom-field quotas', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);
  await page.locator('#openLog').click();

  const symptomHint = page.locator('[data-plan-limit="symptoms"]');
  await expect(symptomHint).toContainText('Free plan · 0 of 3 custom symptoms used');
  await expect(symptomHint).toContainText('0 selected today');

  await page.locator('#symptomGrid .sym-btn', { hasText: 'Headache' }).click();
  await expect(symptomHint).toContainText('1 selected today');

  await addCustomSymptom(page, 'Sinus pressure');
  await addCustomSymptom(page, 'Jaw tension');
  await addCustomSymptom(page, 'Light sensitivity');
  await expect(symptomHint).toContainText('3 of 3 custom symptoms used');

  await page.locator('#symptomGrid .sym-btn', { hasText: 'Sinus pressure' }).click();
  await expect(symptomHint).toContainText('2 selected today');

  await page.locator('#addSymptomPlus').click();
  await expect(page.locator('#pametLogPlanTitle')).toContainText('reached the Free limit');
});

test('@production Reward badge and Settings cleanup stay centered and aligned', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);

  const badge = page.locator('#pametCurrentTier .logging-current-badge');
  await expect(badge).toBeVisible();
  const metrics = await badge.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const icon = element.querySelector('.logging-tier-icon')?.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      badgeCenter: rect.left + rect.width / 2,
      iconCenter: icon ? icon.left + icon.width / 2 : null
    };
  });
  expect(Math.abs(metrics.width - metrics.height)).toBeLessThan(3);
  expect(Math.abs(metrics.badgeCenter - metrics.iconCenter)).toBeLessThan(3);

  await page.locator('[data-tab="settings"]').click();
  const note = page.locator('#securityCard .security-note');
  await expect(note).toBeVisible();
  const alignment = await note.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      marginLeft: style.marginLeft,
      marginRight: style.marginRight,
      textAlign: style.textAlign,
      borderTopWidth: style.borderTopWidth,
      paddingTop: Number.parseFloat(style.paddingTop)
    };
  });
  expect(alignment.marginLeft).toBe('12px');
  expect(alignment.marginRight).toBe('12px');
  expect(alignment.textAlign).toBe('left');
  expect(alignment.borderTopWidth).toBe('1px');
  expect(alignment.paddingTop).toBeGreaterThan(8);

  const accountCard = page.locator('.settings-card', { has: page.locator('#changePasswordBtn') });
  await expect(accountCard.locator('#exportCsv')).toBeHidden();
  await expect(accountCard.locator('#exportJson')).toBeHidden();
  const accountLabel = await accountCard.locator('.settings-section').evaluate((element) => getComputedStyle(element, '::after').content);
  expect(accountLabel.replace(/["']/g, '')).toBe('Account');
});
