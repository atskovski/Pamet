# Pamet legacy device bearer authentication sunset

Pamet v1.2.0 provides an automatic migration path from pre-session device credentials to normal password-authenticated, revocable server sessions. The compatibility path must not remain indefinitely, but it also must not be removed before affected users have a supported migration path.

## Telemetry

The secure entry point emits `identity.legacy_bearer_observed` only when an interactive `/api/*` request presents a 64-hex device bearer. The event contains only method, route path, app version, and timestamp. It does **not** record the credential, a credential hash, email, user id, IP address, health data, or request body.

Successful one-time migration is separately recorded in the account audit log as `identity.legacy_password_upgraded`.

## Retirement criteria

Do not remove the compatibility bearer path until all of these are true:

1. the migration build has been broadly deployed for at least 30 days;
2. there are 30 consecutive days with no unresolved legacy-migration defect;
3. interactive legacy-bearer traffic is below 0.1% of authenticated interactive API requests for that same 30-day window;
4. support/recovery documentation has been validated for users who missed the migration window; and
5. a release rollback plan exists.

**Earliest review date:** December 1, 2026. This is a review date, not an unconditional removal date. If the criteria above are not met, the compatibility path remains until they are.

## Removal release

When the criteria are met:

- remove device-key bearer authentication from ordinary interactive application routes;
- remove automatic legacy `device_key_hash` promotion/fallback;
- retain server session cookies for interactive use;
- retain the separate `CRON_SECRET` Bearer scheme only for `/api/jobs/*`;
- preserve explicit account recovery and device-management flows;
- run the full auth/device/sharing/sync integration matrix before release; and
- monitor authentication failures and recovery demand after deployment.

The retirement decision and measured traffic window must be recorded in the release notes before Issue #8 is closed.
