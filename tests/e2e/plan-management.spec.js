'use strict';

const { test, expect } = require('@playwright/test');

const PRO_CAPS = {
  correlations:true,
  unlimitedHistory:true,
  sharing:true,
  appointmentWorkspace:false,
  multipleProfiles:false,
  advancedVisitBrief:false,
  encryptedSync:false
};

async function installPro(page) {
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem('pamet_user_v1', JSON.stringify({
      id:'plan-management-user',
      firstName:'Plan',
      lastName:'Member',
      email:'plan-member@pamet.test',
      plan:'free',
      createdAt:new Date(now - 42 * 86400000).toISOString()
    }));
    localStorage.setItem('pamet_session_v2', JSON.stringify({ token:'plan-management-session', at:now }));
    localStorage.setItem('pamet_entries_v2_primary', JSON.stringify([
      {id:'pm-1',date:new Date(now - 4 * 86400000).toISOString(),symptoms:['Headache'],severity:4},
      {id:'pm-2',date:new Date(now - 2 * 86400000).toISOString(),symptoms:['Headache'],severity:5},
      {id:'pm-3',date:new Date(now - 2 * 86400000 + 3600000).toISOString(),symptoms:[],severity:0}
    ]));
  });
  await page.route('**/api/entitlements', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({plan:'pro',capabilities:PRO_CAPS})
  }));
  await page.route('**/api/billing/status', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({user:{plan:'pro',subscriptionStatus:'active'}})
  }));
}

async function ready(page) {
  await page.goto('/', { waitUntil:'commit' });
  await page.waitForFunction(() => window.PametAuthenticatedFeaturesLoaded === true && !!window.PametPlanManagementLoader && !!window.PametPlanComparison);
  await expect.poll(() => page.evaluate(() => window.PametEntitlements?.snapshot?.().plan)).toBe('pro');
  await page.locator('.tab[data-tab="settings"]').click();
}

test('@production Pro Manage your plan is upgrade-first and does not open billing until explicitly chosen', async ({page}) => {
  await installPro(page);
  let portalCalls = 0;
  await page.route('**/api/billing/portal', route => {
    portalCalls += 1;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://billing.example.test/session'})});
  });
  await ready(page);

  await expect(page.getByRole('button',{name:'Upgrade to Ultra',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Upgrade to Ultra',exact:true}).click();
  const modal = page.locator('#pametPlanManagementRoot .plan-management-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading',{name:'Manage your plan'})).toBeVisible();
  await expect(modal).toContainText('Pro · Understand');
  await expect(modal).toContainText('Plan Member');
  await expect(modal).toContainText('plan-member@pamet.test');
  await expect(modal).toContainText('42 days with Pamet');
  await expect(modal).toContainText('Subscription status: active');
  expect(portalCalls).toBe(0);

  const included = modal.locator('.plan-management-features li');
  await expect(included).toHaveCount(14);
  await expect(modal.getByRole('button',{name:'Compare all Pamet features'})).toBeVisible();
  await expect(modal.getByRole('button',{name:'Upgrade to Ultra'})).toBeVisible();
  await expect(modal.getByRole('button',{name:'Billing & invoices'})).toBeVisible();
  await expect(modal.getByText('Open Stripe billing portal')).toHaveCount(0);

  await modal.getByRole('button',{name:'Upgrade to Ultra'}).click();
  await expect(modal.getByRole('heading',{name:'Upgrade to Ultra'})).toBeVisible();
  await expect(modal.locator('.plan-management-upgrade-card')).toHaveCount(1);
  await expect(modal.locator('.plan-management-upgrade-card')).toContainText('Ultra · Prepare');
  await expect(modal.locator('.plan-management-upgrade-card')).not.toContainText('Pro · Understand');
  expect(portalCalls).toBe(0);

  await modal.getByRole('button',{name:'Continue to Ultra'}).click();
  await expect.poll(() => portalCalls).toBe(1);
});

test('@production full comparison renders every canonical feature across Free Pro and Ultra', async ({page}) => {
  await installPro(page);
  await ready(page);
  await page.getByRole('button',{name:'Compare all plans',exact:true}).first().click();

  const dialog = page.locator('#pametPlanMatrixDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading',{name:'Compare all Pamet features'})).toBeVisible();
  await expect(dialog.locator('.plan-matrix-plan')).toHaveCount(3);
  await expect(dialog.locator('thead th')).toContainText(['Feature','Free','Pro','Ultra']);
  await expect(dialog.locator('tbody [data-plan-feature]')).toHaveCount(18);
  await expect(dialog.locator('.plan-matrix-group')).toHaveCount(4);
  await expect(dialog.locator('.plan-matrix-foot > span')).toBeHidden();
  await expect(dialog.getByRole('button',{name:'Manage your current plan'})).toBeVisible();
});
