# CSP and Legacy Authentication Retirement

## Current CSP state

The hardened production wrapper removes executable inline-script permission from the inner application's CSP and adds `script-src-attr 'none'`. This blocks inline event-handler execution such as `onclick=` and keeps production JavaScript in the bundled same-origin asset plus explicitly required Stripe origins.

The application still permits inline **style** execution because existing screens use style attributes and runtime `element.style` updates for presentation state. Removing style `unsafe-inline` before those uses are migrated would break visible state, chart/color accents, and layout behavior. Therefore issue #8 is **partially complete**, not closed.

### Exit plan for style CSP

1. Inventory `style=` attributes in `index.html`, `share.html`, and generated UI templates.
2. Replace static style attributes with named CSS classes.
3. Replace presentation-only `element.style.*` mutations with state classes/data attributes where practical.
4. For unavoidable dynamic values, use a reviewed CSS-variable strategy with a narrowly scoped policy rather than reopening executable script permissions.
5. Run the full mobile/dialog regression suite and production lifecycle matrix.
6. Remove `unsafe-inline` from `style-src` only after the deployed UI is verified under the stricter policy.
7. Add a CI assertion that no production CSP directive contains `unsafe-inline`.

No marketing/security claim should say Pamet has a fully nonce/hash-only CSP until this final style migration is completed.

## Legacy device authentication state

Pamet's normal identity model is password-backed, revocable HttpOnly server sessions. Older installations may still contain a device credential. The current compatibility path:

- validates the user's existing local password verifier on the authorized legacy browser
- bootstraps/locates the server account
- performs a one-time `/api/auth/legacy-upgrade`
- writes a server-side password verifier
- immediately retries normal `/api/auth/login`
- removes the legacy device key from the browser's saved account record
- records `identity.legacy_password_upgraded`

This removes the previous dead-end message telling the user to recover the account just to sign back in.

## Retirement criteria

Before deleting legacy bearer fallback from protected routes:

1. Run `scripts/legacy-auth-readiness.sql` against production read-only.
2. Confirm essentially all active accounts have `password_hash` and `password_salt` populated.
3. Review the 30-day trend of `identity.legacy_password_upgraded` events.
4. Define an acceptable residual threshold and a support/recovery path for remaining dormant installations.
5. Announce the retirement window if existing users may be affected.
6. Remove legacy bearer fallback in a dedicated PR.
7. Prove login, password reset, session revocation, device revocation, sharing, billing, and sync in CI after removal.
8. Monitor authentication failure and recovery-request rates after deployment.

Issue #8 should remain open until both the style CSP migration and legacy bearer retirement are complete and verified in production telemetry.
