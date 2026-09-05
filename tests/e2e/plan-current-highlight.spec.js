'use strict';

const { test, expect } = require('@playwright/test');

async function installSyntheticSession(page) {
  await page.addInitScript(() => {
    const user = {
      id: 'plan-highlight-synthetic',
      firstName: 'Plan',
      lastName: 'Highlight',
      email: 'plan-highlight@pamet.test',
      plan: 'free',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('pamet_user_v1', JSON.stringify(user));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token: 'plan-highlight-session', at: Date.now() }));
  });
}

const CAPABILITIES = {
  free: {
    correlations:false,
    unlimitedHistory:false,
    sharing:false,
    appointmentWorkspace:false,
    multipleProfiles:false,
    advancedVisitBrief:false,
    encryptedSync:false
  },
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

test('@production Settings follows the server-verified plan after upgrade or plan change', async ({ page }) => {
  await installSyntheticSession(page);
  let verifiedPlan = 'free';

  await page.route('**/api/entitlements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plan: verifiedPlan, capabilities: CAPABILITIES[verifiedPlan] })
    });
  });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => typeof window.PametLoadAuthenticatedFeatures === 'function');
  await expect(page.locator('#welcome')).toHaveClass(/hidden/);
  await page.locator('.tab[data-tab="settings"]').click();

  const free = page.locator('#planCompare [data-plan-card="free"]');
  const pro = page.locator('#planCompare [data-plan-card="pro"]');
  const ultra = page.locator('#planCompare [data-plan-card="ultra"]');
  const planLine = page.locator('#planLineText');
  const planAction = page.locator('#upgradeBtn');

  await expect(free).toHaveClass(/active/);
  await expect(free.locator('.plan-current-badge')).toHaveText('Current plan');
  await expect(planLine).toHaveText('Free · Track');
  await expect(planAction).toHaveText('Upgrade your plan');

  verifiedPlan = 'pro';
  await page.evaluate(() => window.PametEntitlements.refresh());
  await expect(pro).toHaveClass(/active/);
  await expect(pro.locator('.plan-current-badge')).toHaveText('Current plan');
  await expect(free).not.toHaveClass(/active/);
  await expect(planLine).toHaveText('Pro · Understand');
  await expect(planAction).toHaveText('Manage your plan');

  verifiedPlan = 'ultra';
  await page.evaluate(() => window.PametEntitlements.refresh());
  await expect(ultra).toHaveClass(/active/);
  await expect(ultra.locator('.plan-current-badge')).toHaveText('Current plan');
  await expect(pro).not.toHaveClass(/active/);
  await expect(planLine).toHaveText('Ultra · Prepare');
  await expect(planAction).toHaveText('Manage your plan');
});
