# Pamet database backup and restore runbook

**Status:** CI restore drill automated; production-provider restore remains a launch gate.

Pamet cannot claim recoverability merely because backups are enabled. A backup is useful only when a clean environment can restore it and the restored data passes integrity checks.

## Automated CI evidence

Every pull request now runs `scripts/backup-restore-drill.sh` against the disposable MySQL 8.4 integration database after the production lifecycle test matrix. The drill:

1. creates a transactional `mysqldump` of the populated test database;
2. verifies the dump contains identity, session, and encrypted-sync tables;
3. creates a separate `pamet_restore_drill` schema;
4. restores the dump into that separate schema;
5. compares source/restored table and user counts;
6. verifies critical Pamet tables exist; and
7. executes integrity reads against sessions, devices, and encrypted-sync blobs.

A PR fails if the restore cannot reproduce the expected schema/data. This catches schema changes that make routine logical backup/restore unusable.

## Production-provider drill

Run this against the actual database provider before broad production launch and at least quarterly thereafter. Never use the active production schema as the restore target.

### Preparation

- Confirm the provider's automated backup/PITR feature is enabled.
- Record the configured retention window.
- Record the earliest available restore point.
- Identify a temporary isolated restore destination with production-equivalent engine/version/settings.
- Confirm who is authorized to initiate a restore and who approves deletion of the temporary copy.
- Record the target RPO and RTO. Until business/legal review sets stricter targets, these are **provisional engineering targets only:** RPO <= 24 hours and RTO <= 4 hours.

### Drill

1. Record `started_at`, source database identifier, chosen restore point, and operator.
2. Create a provider-native point-in-time restore into the isolated destination.
3. Connect using a dedicated temporary credential; do not reuse application credentials where avoidable.
4. Verify engine version and character set/collation.
5. Verify presence and readable counts for at least:
   - `pamet_users`
   - `pamet_sessions`
   - `pamet_devices`
   - `pamet_mfa`
   - `pamet_recovery_tokens`
   - `pamet_sharing_invites`
   - `pamet_stripe_events`
   - `pamet_sync_blobs`
   - `pamet_feedback`
6. Validate representative foreign-key relationships and that no required table is empty unexpectedly relative to the source checkpoint.
7. Start a Pamet staging instance against the restored database with outbound email, Stripe writes, push delivery, and scheduled jobs disabled.
8. Verify `/api/health` and database portions of `/api/ready`.
9. Run read-only smoke tests for authentication lookup, device listing, entitlement lookup, share metadata lookup, and encrypted-sync blob retrieval using controlled test records only.
10. Record `completed_at`, measured restore duration, observed restore point, and any data gap.
11. Destroy the temporary restored database and temporary credentials after evidence is captured.

## Pass criteria

- Restore completes without manual SQL repair.
- Critical tables and constraints are present.
- Controlled records from at or before the selected restore point are present.
- No records newer than the selected restore point are expected to be recovered.
- Staging can read the restored schema without starting migrations or modifying data.
- Measured RPO/RTO are within the approved targets.
- Evidence contains no passwords, API keys, MFA secrets, recovery tokens, raw health snapshots, or other sensitive customer content.

## Evidence record

For every provider drill record:

- date/time;
- operator and approver;
- provider/region and engine version;
- source identifier and restore-point timestamp;
- restore destination identifier;
- backup/PITR retention window;
- measured RPO;
- measured RTO;
- verification commands/checklist outcome;
- failed checks and remediation owner;
- cleanup confirmation; and
- link to the restricted evidence location.

Do not commit provider screenshots, customer data, database dumps, credentials, or confidential incident material to GitHub.
