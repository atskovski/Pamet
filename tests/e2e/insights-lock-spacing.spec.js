'use strict';

const { test, expect } = require('@playwright/test');

async function startSyntheticFreeSession(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.addInitScript(({ id }) => {
    const user = {
      id: `spacing-${id}`,
      firstName: 'Spacing',
      lastName: 'Check',
      email: `spacing-${id}@pamet.test`,
      plan: 'free',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: `spacing-session-${id}`, at: Date.now() }));
  }, { id: unique });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => typeof window.PametLoadAuthenticatedFeatures === 'function');
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
}

for (const days of [180, 360]) {
  test(`@production locked ${days}-day Insights control visibly separates Pro+`, async ({ page }, testInfo) => {
    await startSyntheticFreeSession(page, testInfo);
    await page.locator('[data-tab="patterns"]').click();

    const button = page.locator(`[data-insights-days="${days}"]`);
    const pro = button.locator('.insights-window-lock');

    await expect(button).toBeVisible();
    await expect(pro).toHaveText('Pro+');

    const metrics = await button.evaluate((element) => {
      const label = element.querySelector('span:first-child').getBoundingClientRect();
      const pro = element.querySelector('.insights-window-lock').getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        labelRight: label.right,
        proLeft: pro.left,
        display: style.display,
        gap: Number.parseFloat(style.columnGap || style.gap || '0')
      };
    });

    expect(['inline-flex', 'flex']).toContain(metrics.display);
    expect(metrics.gap).toBeGreaterThanOrEqual(4);
    expect(metrics.proLeft - metrics.labelRight).toBeGreaterThanOrEqual(4);
  });
}