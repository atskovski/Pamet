# Stripe production webhook recovery

Production endpoint: `https://pamet.wasmer.app/api/stripe/webhook`

## Expected behavior

Pamet verifies Stripe webhook signatures against `STRIPE_WEBHOOK_SECRET` before processing an event. A valid event returns HTTP 2xx after idempotent processing. An unsigned request should return HTTP 400 `Invalid Stripe webhook.`. HTTP 503 `Stripe webhook not configured.` means either `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing from the deployed environment.

Never make the endpoint return 2xx for an unsigned, invalid, or unconfigured event just to stop retries. That would silently discard billing state changes.

## Production configuration

In Stripe live mode, open the webhook destination for the production URL and copy that destination's signing secret. Store it only in the Wasmer production environment as `STRIPE_WEBHOOK_SECRET`. It must be the live destination's current `whsec_...` value, not a test-mode secret, Stripe CLI secret, or a signing secret from a different webhook destination.

Also confirm Wasmer production has the matching live `STRIPE_SECRET_KEY` and the approved live price IDs. Secrets must not be committed to GitHub.

After changing Wasmer environment variables, save and redeploy before retrying events.

## Verification

1. Confirm `/api/health` and `/api/ready` return healthy responses.
2. Run `PAMET_BASE_URL=https://pamet.wasmer.app npm run check:live`. The live checker sends an unsigned webhook probe and expects HTTP 400, proving the deployed endpoint has Stripe plus a webhook signing secret configured without exposing either value.
3. In Stripe live mode, resend one failed webhook delivery and require HTTP 2xx.
4. Retry the remaining failed deliveries after one succeeds.
5. Review recent successful Checkout sessions/subscriptions against Pamet entitlements.
6. Run the Stripe reconciliation job after webhook recovery.

Production recovery was verified on September 3, 2026 with a manually resent live Stripe event-destination ping returning HTTP 200 and `{ "received": true }`.

## Reconciliation job

`.github/workflows/stripe-reconcile.yml` calls the production reconciliation endpoint daily and can also be run manually. Scheduled production jobs authenticate with short-lived GitHub Actions OIDC identity tokens scoped to this repository, `main`, the exact approved workflow, and the `pamet-production-jobs` audience. No long-lived GitHub-to-Pamet shared secret is required.

`CRON_SECRET` remains supported by the application as an optional emergency/manual bearer credential, but it is no longer required by the GitHub Actions schedules. Keep it only in the Wasmer secret store if that fallback is needed; never commit it.

The same OIDC pattern is used for reminder delivery and weekly digests. `.github/workflows/job-auth-acceptance.yml` verifies the production OIDC trust path after relevant changes without executing reminder, digest, or reconciliation work.

## Common response codes

- `2xx`: Stripe accepted and Pamet processed the event, or recognized it as an already processed duplicate.
- `400 Invalid Stripe webhook.`: missing/invalid Stripe signature, commonly a signing-secret mismatch for a real Stripe delivery.
- `503 Stripe webhook not configured.`: missing `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in the deployed runtime.
- `500 Webhook processing failed.`: signature validation succeeded, but database/subscription processing failed. Inspect Pamet logs for `stripe_webhook_processing_failed` and retry after the dependency issue is fixed.
