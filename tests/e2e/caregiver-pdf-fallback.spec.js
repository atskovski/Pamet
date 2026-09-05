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
  const legacyModal = page.locator('#careUxModalRoot .care-share-modal');
  await expect(legacyModal).toBeVisible();
  await expect(legacyModal.locator('#caregiverPdfDownload')).toBeVisible();
  await expect(legacyModal.locator('#caregiverPdfDownload')).toHaveText('Download caregiver PDF');
  await expect(legacyModal.locator('[data-care-status]')).toContainText('Ultra can download the caregiver summary as a local PDF');
  await expect(legacyModal.locator('#careShareSubmit')).toBeDisabled();

  await page.evaluate(() => {
    window.__pametCaregiverPdfPrinted = false;
    window.open = () => ({
      opener:null,
      document:{ write:() => {}, close:() => {} },
      focus:() => {},
      print:() => { window.__pametCaregiverPdfPrinted = true; }
    });
  });
  await legacyModal.locator('#caregiverPdfDownload').click();
  await expect(legacyModal.locator('[data-care-status]')).toContainText('Caregiver PDF opened locally');
  await expect.poll(async () => page.evaluate(() => window.__pametCaregiverPdfPrinted)).toBe(true);

  verifiedPlan = 'pro';
  await page.evaluate(() => window.PametEntitlements.refresh());
  await expect.poll(async () => page.evaluate(() => window.PametEntitlements?.snapshot?.().plan)).toBe('pro');
  await expect(legacyModal.locator('#caregiverPdfDownload')).toHaveCount(0);

  await legacyModal.getByRole('button', { name:'Close' }).click();
  await page.evaluate(() => window.PametCareSharingEnhancements.open('caregiver'));
  const enhancedModal = page.locator('#careSharingEnhancedRoot .enhanced-share-modal');
  await expect(enhancedModal).toBeVisible();
  await expect(enhancedModal.locator('#enhancedSharePdf')).toBeHidden();
  await expect(enhancedModal.locator('[data-enhanced-status]')).toContainText('Secure invitations will be available after Pamet has a verified sending domain');

  verifiedPlan = 'ultra';
  await page.evaluate(() => window.PametEntitlements.refresh());
  await expect(enhancedModal.locator('#enhancedSharePdf')).toBeVisible();
  await expect(enhancedModal.locator('#enhancedSharePdf')).toHaveText('Download caregiver PDF');
});
