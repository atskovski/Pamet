#!/usr/bin/env bash
set -euo pipefail

SOURCE_DB="${DB_NAME:-pamet_test}"
RESTORE_DB="${RESTORE_DB_NAME:-pamet_restore_drill}"
ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
CONTAINER="$(docker ps --filter ancestor=mysql:8.4 --format '{{.ID}}' | head -n 1)"

if [[ -z "${CONTAINER}" ]]; then
  echo "No MySQL 8.4 service container found." >&2
  exit 1
fi

BACKUP="$(mktemp -t pamet-backup-XXXXXX.sql)"
trap 'rm -f "${BACKUP}"' EXIT

started_at="$(date +%s)"
echo "Creating logical backup of ${SOURCE_DB}..."
docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysqldump \
  -uroot --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF "${SOURCE_DB}" > "${BACKUP}"

[[ -s "${BACKUP}" ]] || { echo "Backup file is empty." >&2; exit 1; }
grep -q 'CREATE TABLE.*pamet_users' "${BACKUP}" || { echo "Backup is missing pamet_users." >&2; exit 1; }
grep -q 'CREATE TABLE.*pamet_sessions' "${BACKUP}" || { echo "Backup is missing pamet_sessions." >&2; exit 1; }
grep -q 'CREATE TABLE.*pamet_sync_blobs' "${BACKUP}" || { echo "Backup is missing pamet_sync_blobs." >&2; exit 1; }

before_tables="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${SOURCE_DB}'")"
before_users="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM ${SOURCE_DB}.pamet_users")"

# Restore into a separate schema. The source remains untouched so this validates
# recoverability rather than simply proving that SQL can be re-applied in place.
docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -uroot -e "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`; CREATE DATABASE \`${RESTORE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
docker exec -i -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -uroot "${RESTORE_DB}" < "${BACKUP}"

after_tables="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RESTORE_DB}'")"
after_users="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM ${RESTORE_DB}.pamet_users")"

[[ "${before_tables}" == "${after_tables}" ]] || { echo "Restore table-count mismatch: source=${before_tables}, restored=${after_tables}" >&2; exit 1; }
[[ "${before_users}" == "${after_users}" ]] || { echo "Restore user-count mismatch: source=${before_users}, restored=${after_users}" >&2; exit 1; }

for table in pamet_users pamet_sessions pamet_devices pamet_mfa pamet_sharing_invites pamet_stripe_events pamet_sync_blobs pamet_recovery_tokens pamet_feedback; do
  exists="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RESTORE_DB}' AND table_name='${table}'")"
  [[ "${exists}" == "1" ]] || { echo "Restored schema is missing ${table}." >&2; exit 1; }
done

# Basic referential/integrity reads against the restored copy.
docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -uroot -e "SELECT COUNT(*) AS sessions FROM ${RESTORE_DB}.pamet_sessions; SELECT COUNT(*) AS devices FROM ${RESTORE_DB}.pamet_devices; SELECT COUNT(*) AS sync_blobs FROM ${RESTORE_DB}.pamet_sync_blobs;" >/dev/null

finished_at="$(date +%s)"
echo "Pamet backup/restore drill passed: tables=${after_tables}, users=${after_users}, duration=$((finished_at-started_at))s"
