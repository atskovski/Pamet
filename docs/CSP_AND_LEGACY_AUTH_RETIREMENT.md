# CSP and Legacy Authentication Retirement

## Current CSP state

Pamet's production edge now enforces a strict Content Security Policy for both scripts and styles. The hardened wrapper removes `unsafe-inline`, adds `script-src-attr 'none'` and `style-src-attr 'none'`, and limits active JavaScript to the same-origin production bundle plus the explicitly required Stripe origins.

The production build also rejects active browser modules that reintroduce inline `style=` attributes or presentation-only CSSOM mutations. Static presentation that previously depended on inline styles is normalized to named classes before the server renders the application shell.

The remaining CSP work is verification, not policy migration: keep the live HTTP smoke check and UI hardening tests green so a future change cannot silently reopen inline execution.

### Ongoing CSP acceptance

1. Keep static presentation in named CSS classes.
2. Keep runtime presentation state in classes, data attributes, or semantic elements such as `progress`.
3. Reject production browser bundles that contain active inline-style attributes or direct presentation CSSOM mutation.
4. Require `script-src-attr 'none'` and `style-src-attr 'none'` in the deployed CSP.
5. Require the deployed CSP to contain no `unsafe-inline` token.
6. Run the mobile/dialog regression suite and production lifecycle matrix after UI changes that affect modals, charts, or dynamic state.

Pamet may describe the production CSP as strict only while these automated and deployed checks continue to pass.

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

## Legacy bearer retirement criteria

Before deleting legacy bearer fallback from protected routes:

1. Run `scripts/legacy-auth-readiness.sql` against production read-only.
2. Confirm essentially all active accounts have `password_hash` and `password_salt` populated.
3. Review the 30-day trend of `identity.legacy_password_upgraded` events.
4. Define an acceptable residual threshold and a support/recovery path for remaining dormant installations.
5. Announce the retirement window if existing users may be affected.
6. Remove legacy bearer fallback in a dedicated PR.
7. Prove login, password reset, session revocation, device revocation, sharing, billing, and sync in CI after removal.
8. Monitor authentication failure and recovery-request rates after deployment.

The CSP hardening portion is complete and automated. Legacy bearer retirement remains a separate production-migration task until the telemetry criteria above are satisfied.
