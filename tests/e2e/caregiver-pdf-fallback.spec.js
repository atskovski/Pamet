'use strict';

const { test, expect } = require('@playwright/test');

const CAPABILITIES = {
  pro: {
    correlations:true,
    unlimitedHistory:true,
    sharing:true,
    appointmentWorkspace:false,
    multipleProfiles:false,
    advancedVisitBrief:false,
    encryptedSync:false
  },
  ultra: {
    correlations:true,
    unlimitedHistory:true,
    sharing:true,
    appointmentWorkspace:true,
    multipleProfiles:true,
    advancedVisitBrief:true,
    encryptedSync:true
  }
};

async function installSyntheticSession(page) {
  await page.addInitScript(() => {
    const user = {
      id: 'caregiver-pdf-synthetic',
      firstName: 'Caregiver',
      lastName: 'PDF',
      email: 'caregiver-pdf@pamet.test',
      plan: 'free',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: 'caregiver-pdf-session', at: Date.now() }));
  });
}

test('@production Ultra caregiver access has a local PDF fallback while email is unavailable', async ({ page }) => {
  await installSyntheticSession(page);
  let verifiedPlan = 'ultra';

  await page.route('**/api/entitlements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plan: verifiedPlan, capabilities: CAPABILITIES[verifiedPlan] })
    });
  });

  await page.route('**/api/billing/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publishableKey:'', proEnabled:false, ultraEnabled:false, emailEnabled:false })
    });
  });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.PametAuthenticatedFeaturesLoaded === true);
  await expect.poll(async () => page.evaluate(() => window.PametEntitlements?.snapshot?.().plan)).toBe('ultra');

  await page.evaluate(() => window.PametCareUx.openShare('caregiver'));
  const modal = page.locator('#careUxModalRoot .care-share-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#caregiverPdfDownload')).toBeVisible();
  await expect(modal.locator('#caregiverPdfDownload')).toHaveText('Download caregiver PDF');
  await expect(modal.locator('[data-care-status]')).toContainText('Ultra can download the caregiver summary as a local PDF');
  await expect(modal.locator('#careShareSubmit')).toBeDisabled();

  await page.evaluate(() => {
    window.__pametCaregiverPdfPrinted = false;
    window.open = () => ({
      opener:null,
      document:{ write:() => {}, close:() => {} },
      focus:() => {},
      print:() => { window.__pametCaregiverPdfPrinted = true; }
    });
  });
  await modal.locator('#caregiverPdfDownload').click();
  await expect(modal.locator('[data-care-status]')).toContainText('Caregiver PDF opened locally');
  await expect.poll(async () => page.evaluate(() => window.__pametCaregiverPdfPrinted)).toBe(true);

  verifiedPlan = 'pro';
  await page.evaluate(() => window.PametEntitlements.refresh());
  await expect.poll(async () => page.evaluate(() => window.PametEntitlements?.snapshot?.().plan)).toBe('pro');
  await expect(modal.locator('#caregiverPdfDownload')).toHaveCount(0);
});
