# Pamet Google + Apple sign-in setup

Pamet supports optional server-side Google and Sign in with Apple authentication. Email/password remains available, and the public login page always keeps the **Create an account** entry point.

## Security model

- OAuth uses the authorization-code flow.
- `state` is HMAC-signed, time-limited, and bound to the browser that initiated sign-in with an HttpOnly OAuth-state cookie.
- OpenID Connect `nonce` is checked against the provider ID token.
- Provider JWT signatures are verified against the provider JWKS and issuer, audience, expiry, issued-at, and authorized-party claims are checked.
- Provider access and refresh tokens are not stored.
- Pamet stores only provider, stable provider subject, linked Pamet user ID, and provider email.
- A different OAuth identity cannot overwrite browser-local Pamet health data. The user must use **Use a different account** first.

## Production callback URLs

Google:

`https://pamet.wasmer.app/api/auth/oauth/google/callback`

Apple:

`https://pamet.wasmer.app/api/auth/oauth/apple/callback`

These values must match the provider configuration exactly.

## Deployment secrets

Pamet uses `IDENTITY_ENCRYPTION_KEY` as the OAuth-state signing secret when it is already configured. You may instead set a separate `OAUTH_STATE_SECRET` containing at least 32 characters.

Google requires:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Apple requires:

- `APPLE_OAUTH_CLIENT_ID` — the Apple Services ID used for the website
- `APPLE_OAUTH_TEAM_ID`
- `APPLE_OAUTH_KEY_ID`
- `APPLE_OAUTH_PRIVATE_KEY` — the Sign in with Apple `.p8` private key, stored as a deployment secret

The login page only shows a provider when every required value for that provider is configured.

## Google configuration

1. Create or select the Google Cloud project used by Pamet.
2. Configure the OAuth consent/branding information for Pamet.
3. Create an OAuth 2.0 client of type **Web application**.
4. Add the exact authorized redirect URI:
   `https://pamet.wasmer.app/api/auth/oauth/google/callback`
5. Store the generated client ID and client secret in the Wasmer production secrets named above.
6. Do not commit the downloaded client secret file.

Pamet requests only `openid email profile` for sign-in.

## Apple configuration

1. In the Apple Developer account, enable **Sign in with Apple** on the primary App ID associated with Pamet.
2. Register a **Services ID** for the Pamet website and associate it with the primary App ID.
3. Configure the Pamet website domain and exact return URL:
   `https://pamet.wasmer.app/api/auth/oauth/apple/callback`
4. Create a Sign in with Apple private key and record its Key ID.
5. Store the Services ID, Team ID, Key ID, and downloaded `.p8` private key in the Wasmer production secrets named above.
6. Keep the `.p8` key private; it must never be committed to GitHub.

## Database migration

Before enabling either provider in production, apply:

`db/migrations/2026-09-03-oauth-identities.sql`

The same table is also included in the canonical `db/schema.sql` baseline.

The migration creates `pamet_external_identities`, which links a provider's stable subject identifier to an existing Pamet user without storing provider tokens.

## Acceptance checklist

After secrets and the migration are applied:

1. `GET /api/auth/oauth/providers` returns the expected provider flags.
2. The login page shows **Continue with Google** and/or **Continue with Apple**.
3. A brand-new provider identity creates a Pamet account and returns to the app signed in.
4. A matching existing account is linked only when provider email authority meets Pamet's safety rule; ambiguous matches fail closed.
5. Canceling a provider flow returns to Pamet without creating a session.
6. Replayed or browser-mismatched OAuth state is rejected.
7. Signing in to a different account while local data belongs to another user is blocked until **Use a different account** clears the local identity/data boundary.
8. Email/password login, password reset, and **Create an account** still work.

## What cannot be committed

Google and Apple credentials are external account resources. They must be created in the respective provider consoles and stored only in deployment secrets. The repository intentionally contains configuration names and validation logic, never live credentials or Apple private-key material.
