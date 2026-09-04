'use strict';

const { test, expect } = require('@playwright/test');

async function registerAccount(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#showRegister').click();
  await page.locator('#regFirstName').fill('Interaction');
  await page.locator('#regLastName').fill('Fixes');
  await page.locator('#regEmail').fill(`interaction-${unique}@example.com`);
  await page.locator('#regPassword').fill(`Pamet-Interaction-${unique}-Password!`);
  await page.locator('#registerForm button[type="submit"]').click();
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

test('@production Patterns windows, evidence, and archive actions are functional', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await seedPatternHistory(page);
  await page.locator('[data-tab="patterns"]').click();

  const windows = page.locator('#screen-patterns [data-insights-days]');
  await expect(windows).toHaveCount(4);
  await expect(page.locator('[data-insights-days="7"]')).toHaveClass(/active/);
  await expect(page.locator('#screen-patterns .insights-window-summary')).toContainText('last 7 days');
  await expect(page.locator('#screen-patterns .readiness-copy')).toContainText('7-day window');

  for (const days of [30, 60, 90, 7]) {
    await page.locator(`[data-insights-days="${days}"]`).click();
    await expect(page.locator(`[data-insights-days="${days}"]`)).toHaveClass(/active/);
    await expect(page.locator('#screen-patterns .insights-window-summary')).toContainText(`last ${days} days`);
    await expect(page.locator('#screen-patterns .readiness-copy')).toContainText(`${days}-day window`);
  }

  const card = page.locator('#screen-patterns .observation-card').first();
  await expect(card).toBeVisible();
  await card.locator('[data-observation-evidence]').click();
  await expect(card.locator('.observation-evidence')).toBeVisible();
  await expect(card.locator('.observation-evidence')).toContainText('Why Pamet surfaced this');
  await expect(card.locator('.observation-evidence')).toContainText('7-day window');

  await card.locator('[data-observation-archive]').click();
  await expect(page.locator('#screen-patterns .insights-action-status')).toContainText('Observation archived');
  const archivedToggle = page.locator('#screen-patterns .archived-toggle');
  await expect(archivedToggle).toContainText('Archived (1)');
  await archivedToggle.click();
  await expect(page.locator('#screen-patterns .observation-card').first()).toBeVisible();
  await expect(page.locator('#screen-patterns .observation-card').first().locator('[data-observation-archive]')).toContainText('Restore');
});

test('@production Log counters react to selections while preserving custom-field quotas', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
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

test('@production Reward badge and Security note stay centered and aligned', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);

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
    return { marginLeft: style.marginLeft, textAlign: style.textAlign };
  });
  expect(alignment.marginLeft).toBe('0px');
  expect(alignment.textAlign).toBe('left');
});
