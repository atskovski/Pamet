'use strict';

const { test, expect } = require('@playwright/test');

async function registerAccount(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#showRegister').click();
  await page.locator('#regFirstName').fill('Log');
  await page.locator('#regLastName').fill('Intelligence');
  await page.locator('#regEmail').fill(`log-${unique}@example.com`);
  await page.locator('#regPassword').fill(`Pamet-Log-${unique}-Password!`);
  await page.locator('#registerForm button[type="submit"]').click();
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

async function addCustomSymptom(page, name) {
  await page.locator('#addSymptomPlus').click();
  await expect(page.locator('#pametLogPlanDialog')).toBeVisible();
  await page.locator('[data-log-custom-input]').fill(name);
  await page.locator('[data-log-custom-save]').click();
  await expect(page.locator('#pametLogPlanDialog')).toHaveCount(0);
  await expect(page.locator('#symptomGrid .sym-btn', { hasText: name })).toBeVisible();
}

test('@production v1.6.6 Log a symptom explains the form, enforces Free limits, and auto-summarizes', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await page.locator('#openLog').click();
  await expect(page.locator('#logBackdrop')).toHaveClass(/open/);

  await expect(page.locator('[data-log-helper="symptoms"]')).toContainText('Select all that apply');
  await expect(page.getByText('How intense are your symptoms overall?', { exact: true })).toBeVisible();
  await expect(page.locator('[data-log-helper="severity"]')).toContainText('0 (none) to 10 (very severe)');
  await expect(page.getByText('Context that may help Pamet compare days', { exact: true })).toBeVisible();
  await expect(page.locator('#pametStructuredContext')).toBeVisible();
  await expect(page.getByText('Sleep quality last night', { exact: false })).toBeVisible();
  await expect(page.getByText('When did the symptoms start?', { exact: false })).toBeVisible();
  await expect(page.getByText('Anything unusual today?', { exact: false })).toBeVisible();

  await expect(page.locator('[data-plan-limit="symptoms"]')).toContainText('Free plan · 0 of 3 custom symptoms used.');
  await expect(page.locator('[data-plan-limit="moods"]')).toContainText('0 of 3 custom moods');
  await expect(page.locator('[data-plan-limit="activities"]')).toContainText('0 of 3 custom activities');
  await expect(page.locator('[data-plan-limit="meds"]')).toContainText('Specific medication names are available with Pro and Ultra');

  await addCustomSymptom(page, 'Sinus pressure');
  await addCustomSymptom(page, 'Jaw tension');
  await addCustomSymptom(page, 'Light sensitivity');
  await expect(page.locator('[data-plan-limit="symptoms"]')).toContainText('3 of 3 custom symptoms used.');
  await page.locator('#addSymptomPlus').click();
  await expect(page.locator('#pametLogPlanTitle')).toContainText('reached the Free limit');
  await expect(page.locator('[data-log-compare-plans]')).toBeVisible();
  await page.locator('[data-log-dialog-close]').last().click();

  await page.locator('#addMedPlus').click();
  await expect(page.locator('#pametLogPlanTitle')).toHaveText('Add specific medications with Pro or Ultra');
  await page.locator('[data-log-dialog-close]').last().click();

  await page.locator('#symptomGrid .sym-btn', { hasText: 'Headache' }).click();
  await page.locator('#severityRange').fill('6');
  await page.locator('.context-choice[data-context-value="Poor"]').click();
  await page.locator('.context-choice[data-context-value="Morning"]').click();
  await page.locator('.context-choice[data-context-value="More caffeine"]').click();
  await page.locator('#moodFlow .chip').filter({ hasText: 'Okay' }).first().click();
  await page.locator('#activityFlow .chip').filter({ hasText: 'Walk' }).first().click();
  await page.locator('#medFlow .chip').filter({ hasText: 'Ibuprofen' }).first().click();

  await expect(page.locator('#notesInput')).toHaveValue('');
  await expect(page.locator('#notesInput')).toHaveAttribute('placeholder', /When did it start\? What were you doing\?/);
  await page.locator('#pametAutoSummary').click();
  await expect(page.locator('#notesInput')).toHaveValue(/Headache/);
  await expect(page.locator('#notesInput')).toHaveValue(/overall intensity 6\/10/);
  await expect(page.locator('#notesInput')).toHaveValue(/Sleep quality was poor/);
  await expect(page.locator('#notesInput')).toHaveValue(/Symptoms started: morning/);
  await expect(page.locator('#notesInput')).toHaveValue(/More caffeine/);
});

test('@production v1.6.6 logging milestones and Home observation toggle stay in sync', async ({ page }, testInfo) => {
  await registerAccount(page, testInfo);
  await expect(page.locator('#pametRewardDays')).toHaveText('0');
  await expect(page.locator('#pametTierRow .logging-tier')).toHaveCount(6);
  await expect(page.locator('[data-tier-key="bronze"]')).toContainText('Bronze');
  await expect(page.locator('[data-tier-key="diamond"]')).toContainText('Diamond');
  await expect(page.locator('[data-tier-key="beast"]')).toContainText('Beast');
  await expect(page.locator('#homeStarterGuide .home-dashboard-kicker')).toHaveText('WHAT PAMET WILL BUILD');

  await page.locator('#openLog').click();
  await page.locator('#symptomGrid .sym-btn', { hasText: 'Headache' }).click();
  await page.locator('#moodFlow .chip').filter({ hasText: 'Okay' }).first().click();
  await page.locator('#activityFlow .chip').filter({ hasText: 'Walk' }).first().click();
  await page.locator('#saveEntry').click();
  await expect(page.locator('#logSuccess')).toBeVisible();
  await expect(page.locator('#pametRewardDays')).toHaveText('1');
  await expect(page.locator('[data-tier-key="bronze"]')).toHaveClass(/is-current/);
  await expect(page.locator('#insightBanner')).toBeVisible();
  await expect(page.locator('#logBackdrop')).not.toHaveClass(/open/);

  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator('#setShowInsight')).toBeChecked();
  await page.locator('#setShowInsight').uncheck();
  await page.locator('[data-tab="home"]').click();
  await expect(page.locator('#insightBanner')).toBeHidden();

  await page.locator('[data-tab="settings"]').click();
  await page.locator('#setShowInsight').check();
  await page.locator('[data-tab="home"]').click();
  await expect(page.locator('#insightBanner')).toBeVisible();
  await expect(page.locator('#insightBanner')).toContainText('OBSERVATION — BASED ON YOUR LOGS');
});
