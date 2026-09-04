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

## Reconciliation job

`.github/workflows/stripe-reconcile.yml` calls the production reconciliation endpoint daily and can also be run manually. GitHub Actions needs a `PAMET_CRON_SECRET` repository secret that matches the production `PAMET_CRON_SECRET` stored in Wasmer. The production application URL is intentionally fixed in the workflow because it is public configuration, not a secret.

If the workflow reports that `PAMET_CRON_SECRET` is not configured, add the same high-entropy secret to GitHub Actions and Wasmer, then run the workflow manually.

## Common response codes

- `2xx`: Stripe accepted and Pamet processed the event, or recognized it as an already processed duplicate.
- `400 Invalid Stripe webhook.`: missing/invalid Stripe signature, commonly a signing-secret mismatch for a real Stripe delivery.
- `503 Stripe webhook not configured.`: missing `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in the deployed runtime.
- `500 Webhook processing failed.`: signature validation succeeded, but database/subscription processing failed. Inspect Pamet logs for `stripe_webhook_processing_failed` and retry after the dependency issue is fixed.
