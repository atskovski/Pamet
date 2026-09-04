'use strict';

const { test, expect } = require('@playwright/test');

async function installSyntheticFreeSession(page) {
  await page.addInitScript(() => {
    const user = {
      id: 'plan-layout-synthetic',
      firstName: 'Plan',
      lastName: 'Layout',
      email: 'plan-layout@pamet.test',
      plan: 'free',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: 'plan-layout-session', at: Date.now() }));
  });
}

async function width(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box.width;
}

test('@production Settings plan actions, legal version, and upgrade chooser stay aligned', async ({ page }, testInfo) => {
  await installSyntheticFreeSession(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await page.locator('.tab[data-tab="settings"]').click();

  const legalFooter = page.locator('.pamet-legal-footer .footer-line');
  await expect(legalFooter).toContainText('Pamet v1.6.5');
  await expect(legalFooter).not.toContainText('Pamet v1.6.4');
  await page.getByRole('button', { name: 'Privacy, safety & HIPAA information' }).click();
  const safetyDialog = page.locator('#pametSafetyDialog');
  await expect(safetyDialog).toBeVisible();
  await expect(safetyDialog.locator('.pamet-support-foot')).toContainText('Pamet v1.6.5');
  await expect(safetyDialog.locator('.pamet-support-foot')).not.toContainText('Pamet v1.6.4');
  await safetyDialog.getByRole('button', { name: 'Close' }).click();
  await expect(safetyDialog).not.toBeVisible();

  const compare = page.getByRole('button', { name: 'Compare all plans', exact: true });
  const upgrade = page.getByRole('button', { name: 'Upgrade your plan', exact: true });
  await expect(compare).toBeVisible();
  await expect(upgrade).toBeVisible();

  const planCards = page.locator('#planCompare .plan-card');
  await expect(planCards).toHaveCount(3);
  const settingsCard = upgrade.locator('xpath=ancestor::*[contains(@class,"settings-card")][1]');
  const cardBox = await settingsCard.boundingBox();
  expect(cardBox).not.toBeNull();
  const compareBox = await compare.boundingBox();
  const upgradeBox = await upgrade.boundingBox();
  expect(compareBox).not.toBeNull();
  expect(upgradeBox).not.toBeNull();
  expect(Math.abs(compareBox.width - upgradeBox.width)).toBeLessThanOrEqual(3);
  expect(compareBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(compareBox.x + compareBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);

  await upgrade.click();
  const modal = page.locator('.plan-upgrade-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Compare Pamet plans' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Annual · Best value' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Monthly' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Choose Pro' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Choose Ultra' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Compare all plan features' })).toBeVisible();

  const viewport = page.viewportSize();
  const modalBox = await modal.boundingBox();
  expect(viewport).not.toBeNull();
  expect(modalBox).not.toBeNull();
  expect(modalBox.x).toBeGreaterThanOrEqual(0);
  expect(modalBox.y).toBeGreaterThanOrEqual(0);
  expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(viewport.height + 1);

  const pro = modal.locator('.pamet-compare-card').filter({ hasText: 'Pro · Understand' });
  const ultra = modal.locator('.pamet-compare-card').filter({ hasText: 'Ultra · Prepare' });
  const proBox = await pro.boundingBox();
  const ultraBox = await ultra.boundingBox();
  expect(proBox).not.toBeNull();
  expect(ultraBox).not.toBeNull();

  if (testInfo.project.name.includes('mobile')) {
    expect(ultraBox.y).toBeGreaterThan(proBox.y);
  } else {
    expect(Math.abs(proBox.y - ultraBox.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(proBox.width - ultraBox.width)).toBeLessThanOrEqual(4);
  }

  expect(await width(modal.getByRole('button', { name: 'Choose Pro' }))).toBeGreaterThan(180);
  expect(await width(modal.getByRole('button', { name: 'Choose Ultra' }))).toBeGreaterThan(180);
});

test('@production Free paid feature entry points show the correct plan lock instead of opening paid workflows', async ({ page }) => {
  await installSyntheticFreeSession(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await page.locator('.tab[data-tab="settings"]').click();

  const tools = page.locator('#phase2UltraTools');
  await expect(tools).toBeVisible();
  const lock = page.locator('#pametEntitlementModalRoot .entitlement-lock-modal');

  const ultraCases = [
    ['profiles', 'Multiple health profiles is included with Ultra'],
    ['prep', 'Appointment Workspace is included with Ultra'],
    ['longitudinal', 'Health history over time is included with Ultra'],
    ['brief', 'Advanced Visit Brief is included with Ultra'],
    ['sharing', 'Advanced sharing is included with Ultra']
  ];

  for (const [feature, heading] of ultraCases) {
    await tools.locator(`[data-phase2="${feature}"]`).click();
    await expect(lock).toBeVisible();
    await expect(lock.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(lock.getByRole('button', { name: 'See Pro & Ultra', exact: true })).toBeVisible();
    await expect(page.locator('#careUxModalRoot .care-appointment-modal')).not.toBeVisible();
    await expect(page.locator('#phase2ModalRoot .pamet-modal')).not.toBeVisible();
    await lock.getByRole('button', { name: 'Close' }).click();
    await expect(lock).not.toBeVisible();
  }

  const caregiver = page.locator('[data-enhanced-care-share="caregiver"], [data-care-share="caregiver"]').first();
  await expect(caregiver).toBeVisible();
  await caregiver.click();
  await expect(lock).toBeVisible();
  await expect(lock.getByRole('heading', { name: 'Caregiver sharing is included with Pro and Ultra', exact: true })).toBeVisible();
  await expect(lock.getByRole('button', { name: 'See Pro & Ultra', exact: true })).toBeVisible();
  await expect(page.locator('#careSharingEnhancedRoot .enhanced-share-modal')).not.toBeVisible();
  await expect(page.locator('#careUxModalRoot .care-share-modal')).not.toBeVisible();
});