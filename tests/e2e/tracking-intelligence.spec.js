'use strict';

const { test, expect } = require('@playwright/test');

async function registerAccount(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#showRegister').click();
  await page.locator('#regFirstName').fill('Tracking');
  await page.locator('#regLastName').fill('Test');
  await page.locator('#regEmail').fill(`tracking-${unique}@example.com`);
  await page.locator('#regPassword').fill(`Pamet-Tracking-${unique}-Password!`);
  await page.locator('#registerForm button[type="submit"]').click();
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

async function openLog(page) {
  await page.locator('#openLog').click();
  await expect(page.locator('#logBackdrop')).toHaveClass(/open/);
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('@production Log explains multi-select, plan limits, intensity, and optional context', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await openLog(page);

  await expect(page.getByText('Select all that apply. You can also choose “No symptoms today.”')).toBeVisible();
  await expect(page.getByText('How intense are your symptoms right now?')).toBeVisible();
  await expect(page.getByText(/0 means none; 10 means as severe as you can imagine/)).toBeVisible();
  await expect(page.getByText('Context that may help Pamet compare days')).toBeVisible();
  await expect(page.locator('#pametExtraContext')).toBeVisible();
  await expect(page.locator('#autoSummarizeLog')).toBeVisible();
  await expect(page.locator('[data-plan-cap="symptoms"]')).toHaveText('Free · 0 of 3 custom symptoms');
  await expect(page.locator('[data-plan-cap="moods"]')).toHaveText('Free · 0 of 3 custom moods');
  await expect(page.locator('[data-plan-cap="activities"]')).toHaveText('Free · 0 of 3 custom activities');
  await expect(page.locator('[data-plan-cap="meds"]')).toHaveText('Free · Built-in medications only');

  await page.locator('#addSymptomPlus').click();
  await expect(page.locator('#customFieldPlanDialog')).toBeVisible();
  await expect(page.locator('#customFieldPlanDialog')).toContainText('Your Free plan includes up to 3 custom symptoms');
  await page.keyboard.press('Escape');
  await expect(page.locator('#customFieldPlanDialog')).toBeHidden();

  await page.locator('#addMedPlus').click();
  await expect(page.locator('#customFieldPlanDialog')).toBeVisible();
  await expect(page.locator('#customFieldPlanDialog')).toContainText('Custom medication names are a paid feature');
  await expect(page.locator('#customFieldPlanDialog')).toContainText('Pro lets you save up to 10 specific medication names');
});

test('@production Free custom limits stop at three and Pro/Ultra policies scale up', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);

  const policy = await page.evaluate(() => {
    const S = window.PametStore;
    S.setPlan('free');
    const free = {
      symptoms: S.customLimit('symptoms'),
      moods: S.customLimit('moods'),
      activities: S.customLimit('activities'),
      meds: S.customLimit('meds')
    };
    const add = [
      S.addCustomField('symptoms', 'Custom one'),
      S.addCustomField('symptoms', 'Custom two'),
      S.addCustomField('symptoms', 'Custom three'),
      S.addCustomField('symptoms', 'Custom four')
    ];
    S.setPlan('pro');
    const pro = { symptoms: S.customLimit('symptoms'), meds: S.customLimit('meds') };
    S.setPlan('ultra');
    const ultra = {
      symptomsUnlimited: !Number.isFinite(S.customLimit('symptoms')),
      medsUnlimited: !Number.isFinite(S.customLimit('meds'))
    };
    S.setPlan('free');
    return { free, add, pro, ultra };
  });

  expect(policy.free).toEqual({ symptoms: 3, moods: 3, activities: 3, meds: 0 });
  expect(policy.add).toEqual([true, true, true, false]);
  expect(policy.pro).toEqual({ symptoms: 10, meds: 10 });
  expect(policy.ultra).toEqual({ symptomsUnlimited: true, medsUnlimited: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openLog(page);
  await expect(page.locator('[data-plan-cap="symptoms"]')).toHaveText('Free · 3 of 3 custom symptoms');
  await page.locator('#addSymptomPlus').click();
  await expect(page.locator('#customFieldPlanDialog')).toContainText('You’ve reached the Free plan limit of 3 custom symptoms');
  await expect(page.locator('#customFieldPlanDialog [data-custom-plan-compare]')).toBeVisible();
});

test('@production Auto-summarize remains opt-in and persists richer context with the saved entry', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await openLog(page);

  await expect(page.locator('#notesInput')).toHaveValue('');
  await expect(page.locator('#notesInput')).toHaveAttribute('placeholder', /When did it start\? What were you doing\?/);

  await page.getByRole('button', { name: 'Headache', exact: true }).click();
  await setRange(page, '#severityRange', 6);
  await page.locator('#moodFlow .chip').filter({ hasText: 'Good' }).first().click();
  await page.locator('#activityFlow .chip').filter({ hasText: /^Walk$/ }).click();
  await page.locator('#medFlow .chip').filter({ hasText: /^Ibuprofen$/ }).click();

  await page.locator('#pametExtraContext summary').click();
  await page.locator('[data-context-group="sleepQuality"] [data-context-value="8"]').click();
  await page.locator('[data-context-group="caffeineServings"] [data-context-value="1"]').click();
  await page.locator('[data-context-tag="Busy / demanding day"]').click();

  await page.locator('#autoSummarizeLog').click();
  await expect(page.locator('#notesInput')).toHaveValue(/Headache/);
  await expect(page.locator('#notesInput')).toHaveValue(/6\/10/);
  await expect(page.locator('#notesInput')).toHaveValue(/sleep quality 8\/10/);
  await expect(page.locator('#notesInput')).toHaveValue(/Ibuprofen/);

  await page.locator('#saveEntry').click();
  await expect.poll(async () => page.evaluate(() => window.PametStore.entries.length)).toBe(1);
  const saved = await page.evaluate(() => {
    const entry = window.PametStore.entries[0];
    return {
      symptoms: entry.symptoms,
      severity: entry.severity,
      mood: entry.mood,
      activity: entry.activity,
      medications: entry.medications,
      notes: entry.notes,
      schemaVersion: entry.schemaVersion,
      context: entry.context
    };
  });
  expect(saved.symptoms).toContain('Headache');
  expect(saved.severity).toBe(6);
  expect(saved.medications).toContain('Ibuprofen');
  expect(saved.notes).toContain('Headache');
  expect(saved.schemaVersion).toBe(2);
  expect(saved.context.sleepQuality).toBe(8);
  expect(saved.context.caffeineServings).toBe(1);
  expect(saved.context.tags).toContain('Busy / demanding day');
});

test('@production Home observation toggle and six-level rewards stay synchronized', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await openLog(page);

  await page.getByRole('button', { name: 'Headache', exact: true }).click();
  await page.locator('#moodFlow .chip').filter({ hasText: 'Okay' }).first().click();
  await page.locator('#activityFlow .chip').filter({ hasText: /^Walk$/ }).click();
  await page.locator('#saveEntry').click();
  await expect.poll(async () => page.evaluate(() => window.PametStore.entries.length)).toBe(1);
  await expect(page.locator('#logBackdrop')).not.toHaveClass(/open/, { timeout: 3000 });

  await expect(page.locator('#insightBanner')).toBeVisible();
  await expect(page.locator('#insightBanner')).toContainText('PAMET OBSERVATION');
  await expect(page.locator('#homeRewards .home-reward-level')).toHaveCount(6);
  await expect(page.locator('#homeRewards')).toContainText('Bronze');
  await expect(page.locator('#homeRewards')).toContainText('Diamond');
  await expect(page.locator('#homeRewards')).toContainText('Beast');

  await page.locator('.tab[data-tab="settings"]').click();
  await expect(page.locator('#setShowInsight')).toBeChecked();
  await page.locator('#setShowInsight').uncheck();
  await page.locator('.tab[data-tab="home"]').click();
  await expect(page.locator('#insightBanner')).toBeHidden();

  await page.locator('.tab[data-tab="settings"]').click();
  await page.locator('#setShowInsight').check();
  await page.locator('.tab[data-tab="home"]').click();
  await expect(page.locator('#insightBanner')).toBeVisible();
});

test('@production Fresh Home uses Pamet wording and shows the complete reward ladder without clutter', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await expect(page.locator('#homeStarterGuide .home-dashboard-kicker')).toHaveText('WHAT PAMET WILL BUILD');
  await expect(page.locator('#homeRewards .home-reward-level')).toHaveCount(6);
  await expect(page.locator('#homeRewards .home-reward-level.earned')).toHaveCount(0);
  await expect(page.locator('#homeRewards')).toContainText('Start with Bronze');

  const overflow = await page.locator('#screen-home').evaluate((home) => {
    const scroll = home.querySelector('.scroll-area');
    return scroll ? scroll.scrollWidth - scroll.clientWidth : 0;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});
