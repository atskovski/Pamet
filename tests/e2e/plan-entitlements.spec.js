'use strict';

const { test, expect } = require('@playwright/test');

async function registerFreeAccount(page, testInfo) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}-${testInfo.project.name.replace(/\W+/g, '-')}`;
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await page.locator('#showRegister').click();
  await page.locator('#regFirstName').fill('Plan');
  await page.locator('#regLastName').fill('Boundary');
  await page.locator('#regEmail').fill(`plan-boundary-${unique}@example.com`);
  await page.locator('#regPassword').fill(`Pamet-Plan-${unique}-Password!`);
  await page.locator('#registerForm button[type="submit"]').click();
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await expect.poll(async () => page.evaluate(() => window.PametEntitlements?.snapshot?.().verified === true)).toBe(true);
}

test.describe('Pamet plan entitlement boundaries', () => {
  test('Free cannot elevate itself through local plan state or open paid care workflows', async ({ page }, testInfo) => {
    await registerFreeAccount(page, testInfo);

    const before = await page.evaluate(() => window.PametEntitlements.snapshot());
    expect(before.plan).toBe('free');
    expect(before.capabilities.correlations).toBe(false);
    expect(before.capabilities.sharing).toBe(false);
    expect(before.capabilities.multipleProfiles).toBe(false);
    expect(before.capabilities.appointmentWorkspace).toBe(false);

    const tamper = await page.evaluate(() => {
      const S = window.PametStore;
      try { localStorage.setItem('pamet_settings_v1', JSON.stringify({ ...S.settings, plan:'ultra' })); } catch {}
      try { S._settings.plan = 'ultra'; } catch {}
      try { S.setPlan('ultra'); } catch {}
      return {
        runtimePlan:S.settings.plan,
        isPro:S.isPro(),
        isUltra:S.isUltra(),
        addProfile:S.addProfile('Should not exist', 'Other'),
        patterns:S.patterns(),
        entitlements:window.PametEntitlements.snapshot()
      };
    });

    expect(tamper.runtimePlan).toBe('free');
    expect(tamper.isPro).toBe(false);
    expect(tamper.isUltra).toBe(false);
    expect(tamper.addProfile).toBeNull();
    expect(tamper.patterns).toEqual([]);
    expect(tamper.entitlements.plan).toBe('free');

    await page.locator('.tab[data-tab="settings"]').click();
    const share = page.locator('[data-care-share="caregiver"],[data-enhanced-care-share="caregiver"]').first();
    if (await share.isVisible().catch(() => false)) {
      await share.click();
      await expect(page.locator('.care-share-modal')).toHaveCount(0);
      await expect(page.getByRole('dialog').filter({ hasText:/Pro|Ultra/i }).first()).toBeVisible();
    }

    const prep = page.locator('[data-phase2="prep"]').first();
    if (await prep.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await prep.click();
      await expect(page.locator('.care-appointment-modal')).toHaveCount(0);
      await expect(page.getByRole('dialog').filter({ hasText:/Pro|Ultra/i }).first()).toBeVisible();
    }
  });
});
