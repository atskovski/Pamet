'use strict';

const { test, expect } = require('@playwright/test');

async function startSyntheticFreeSession(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.addInitScript(({ id }) => {
    const user = {
      id: `home-${id}`,
      firstName: 'Home',
      lastName: 'Dashboard',
      email: `home-${id}@pamet.test`,
      plan: 'free',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: `home-session-${id}`, at: Date.now() }));
  }, { id: unique });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

async function expectWithinViewport(page, locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
}

async function addRecentHistory(page) {
  await page.evaluate(() => {
    const store = window.PametStore;
    const atNoon = (daysAgo) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - daysAgo);
      return date.toISOString();
    };
    const entries = [
      { daysAgo: 0, symptoms: ['Headache'], severity: 4, sleepHours: 6, stressLevel: 6 },
      { daysAgo: 1, symptoms: [], severity: 0, sleepHours: 7, stressLevel: 4 },
      { daysAgo: 2, symptoms: ['Headache'], severity: 6, sleepHours: 5, stressLevel: 7 },
      { daysAgo: 4, symptoms: ['Fatigue'], severity: 3, sleepHours: 6, stressLevel: 5 },
      { daysAgo: 7, symptoms: ['Headache'], severity: 5, sleepHours: 6, stressLevel: 6 },
      { daysAgo: 9, symptoms: [], severity: 0, sleepHours: 8, stressLevel: 3 }
    ];
    entries.reverse().forEach((item, index) => store.addEntry({
      date: atNoon(item.daysAgo),
      symptoms: item.symptoms,
      severity: item.severity,
      sleepHours: item.sleepHours,
      stressLevel: item.stressLevel,
      waterGlasses: 6,
      energyLevel: 5,
      mood: 'Okay 😐',
      activity: 'Walk',
      medications: [],
      notes: index === 0 ? 'Dashboard fixture' : ''
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

test('@production Home gives first-use CTA a real action and keeps it in bounds', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);

  await expect(page.locator('#homeEmptyPlus')).toBeVisible();
  await expect(page.locator('#homeEmptyPlus')).toHaveAttribute('aria-label', 'Log your first entry');
  await expect(page.locator('#emptyLogEntry')).toBeVisible();
  await expect(page.locator('#streakCard')).toBeVisible();
  await expect(page.locator('#streakDays')).toHaveText('0');
  await expect(page.locator('#homeStarterGuide')).toBeVisible();
  await expect(page.locator('#homeStarterGuide .home-starter-item')).toHaveCount(2);
  await expect(page.locator('.home-visit-brief')).toBeVisible();
  await expectWithinViewport(page, page.locator('#homeEmptyState'));
  await expectWithinViewport(page, page.locator('#emptyLogEntry'));

  await page.locator('#homeEmptyPlus').click();
  await expect(page.locator('#logBackdrop')).toHaveClass(/open/);
  await page.locator('#closeLog').click();
  await expect(page.locator('#logBackdrop')).not.toHaveClass(/open/);
});

test('@production Home shows a compact seven-day dashboard without legacy metric clutter', async ({ page }, testInfo) => {
  await startSyntheticFreeSession(page, testInfo);
  await addRecentHistory(page);

  await expect(page.locator('#homeWeekCard')).toBeVisible();
  await expect(page.locator('#homeWeekLogged')).toHaveText('4/7');
  await expect(page.locator('#homeWeekSymptoms')).toHaveText('3');
  await expect(page.locator('#homeWeekTrend .home-trend-day')).toHaveCount(7);
  await expect(page.locator('#insightBanner')).toBeVisible();
  await expect(page.locator('#insightBanner')).toContainText('OBSERVATION — BASED ON YOUR LOGS');
  await expect(page.locator('#insightText')).toContainText(/Headache|symptom days/i);
  await expect(page.locator('#homeEmptyState')).toBeHidden();
  await expect(page.locator('#homeStarterGuide')).toBeHidden();
  await expect(page.locator('.home-visit-brief')).toBeVisible();
  await expect(page.locator('#metricsGrid')).toBeHidden();
  await expect(page.locator('#recentEntries .entry-row:visible')).toHaveCount(3);

  await expectWithinViewport(page, page.locator('#homeWeekCard'));
  await expectWithinViewport(page, page.locator('#homeWeekTrend'));
  await expectWithinViewport(page, page.locator('#homeWeekLog'));

  const overflow = await page.locator('#screen-home').evaluate((home) => {
    const scroll = home.querySelector('.scroll-area');
    return scroll ? scroll.scrollWidth - scroll.clientWidth : 0;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});