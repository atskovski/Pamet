'use strict';

const { test, expect } = require('@playwright/test');

const PRO_CAPABILITIES = {
  correlations:true,
  unlimitedHistory:true,
  sharing:true,
  appointmentWorkspace:false,
  multipleProfiles:false,
  advancedVisitBrief:false,
  encryptedSync:false
};

async function installProSession(page, testInfo) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.addInitScript(({ sessionId }) => {
    localStorage.setItem('pamet_user_v1', JSON.stringify({
      id:`chart-${sessionId}`,
      firstName:'Chart',
      lastName:'Tester',
      email:`chart-${sessionId}@pamet.test`,
      plan:'pro',
      createdAt:new Date().toISOString()
    }));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token:`chart-session-${sessionId}`, at:Date.now() }));
  }, { sessionId:id });
  await page.route('**/api/entitlements', async (route) => {
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ plan:'pro', capabilities:PRO_CAPABILITIES }) });
  });
  await page.goto('/', { waitUntil:'commit' });
  await page.waitForFunction(() => window.PametEntitlements?.snapshot?.().verified === true);
}

async function seedChartHistory(page) {
  await page.evaluate(() => {
    const store = window.PametStore;
    store._entries = [];
    const now = new Date();
    now.setHours(12,0,0,0);
    for (let offset = 119; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const sequence = 120 - offset;
      const clear = sequence % 5 === 0;
      const headache = !clear && sequence % 2 === 0;
      const fatigue = !clear && sequence % 3 === 0;
      const symptoms = [];
      if (headache) symptoms.push('Headache');
      if (fatigue) symptoms.push('Fatigue');
      if (!clear && !symptoms.length) symptoms.push('Headache');
      store._entries.unshift({
        id:`chart-history-${sequence}`,
        date:date.toISOString(),
        symptoms,
        severity:clear ? 0 : (headache ? 6 : 4),
        sleepHours:headache ? 5.5 : 7.2,
        stressLevel:headache ? 7 : 3,
        waterGlasses:fatigue ? 4 : 7,
        energyLevel:fatigue ? 4 : 7,
        mood:headache ? 'Tired 😴' : 'Okay 😐',
        activity:sequence % 4 === 0 ? 'Cycling' : 'Walk',
        medications:headache ? ['Ibuprofen'] : [],
        notes:`Chart fixture ${sequence}`
      });
    }
    store.persistEntries();
  });
}

test('@production Pro Patterns charting moves from simple frequency to advanced raw-factor comparisons and follows the selected history window', async ({ page }, testInfo) => {
  await installProSession(page, testInfo);
  await seedChartHistory(page);
  await page.locator('[data-tab="patterns"]').click();

  const chart = page.locator('#screen-patterns .insights-chart-card');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('data-chart-mode-current','basic');
  await expect(chart).toHaveAttribute('data-chart-window','7');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','1');
  await expect(chart.locator('.insights-chart-svg')).toBeVisible();
  await expect(chart.locator('.chart-summary-grid')).toBeVisible();
  await expect(chart.locator('.chart-method-note')).toContainText('Missing days remain missing');
  const symptomSelect = chart.locator('[data-chart-symptom]');
  await expect(symptomSelect.locator('option', { hasText:'Any symptom' })).toHaveCount(1);
  await expect(symptomSelect.locator('option', { hasText:'Headache' })).toHaveCount(1);
  await expect(symptomSelect.locator('option', { hasText:'Fatigue' })).toHaveCount(1);

  await page.locator('[data-insights-days="30"]').click();
  await expect(chart).toHaveAttribute('data-chart-window','30');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','3');
  await expect(chart.locator('.chart-window-explain')).toContainText('3-day grouped view');

  await chart.locator('[data-chart-mode="advanced"]').click();
  await expect(chart).toHaveAttribute('data-chart-mode-current','advanced');
  await expect(chart.locator('.advanced-chart-controls')).toBeVisible();
  await expect(chart.locator('.advanced-comparison-grid .advanced-comparison-card')).toHaveCount(3);
  await expect(chart.locator('.chart-metric-btn')).toHaveCount(5);

  await chart.locator('[data-chart-metric="sleep"]').click();
  await expect(chart.locator('#insightsChartTitle')).toHaveText('Recorded sleep');
  await expect(chart.locator('.legend-secondary')).toContainText('Any symptom days');
  await expect(chart.locator('.chart-series-secondary')).toBeVisible();
  await expect(chart.locator('.chart-series-trend')).toBeVisible();

  await chart.locator('[data-chart-symptom]').selectOption('Headache');
  await expect(chart.locator('#insightsChartTitle')).toHaveText('Recorded sleep');
  await expect(chart.locator('.legend-secondary')).toContainText('Headache days');
  await expect(chart.locator('.advanced-comparison-head h4')).toContainText('Headache days compared with other logged days');

  await page.locator('[data-insights-days="90"]').click();
  await expect(chart).toHaveAttribute('data-chart-window','90');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','10');
  await expect(chart.locator('.advanced-chart-context')).toContainText('10-day buckets');

  await page.locator('[data-insights-days="360"]').click();
  await expect(chart).toHaveAttribute('data-chart-window','360');
  await expect(chart).toHaveAttribute('data-chart-bucket-days','30');
  await expect(chart.locator('.advanced-chart-context')).toContainText('30-day buckets');

  const layout = await chart.evaluate((element) => ({ clientWidth:element.clientWidth, scrollWidth:element.scrollWidth, viewport:window.innerWidth }));
  expect(layout.clientWidth).toBeGreaterThan(0);
  if (layout.viewport > 760) expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 2);
});