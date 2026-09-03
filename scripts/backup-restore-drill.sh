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

mysql_scalar() {
  local database="$1" query="$2"
  docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "USE \`${database}\`; ${query}"
}

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

declare -A before_counts
for table in pamet_users pamet_sessions pamet_devices pamet_mfa pamet_sharing_invites pamet_stripe_events pamet_sync_blobs pamet_recovery_tokens pamet_feedback pamet_push_subscriptions pamet_appointments; do
  before_counts["${table}"]="$(mysql_scalar "${SOURCE_DB}" "SELECT COUNT(*) FROM \`${table}\`;")"
done

# Restore into a separate schema. The source remains untouched so this validates
# recoverability rather than merely proving that schema SQL can be replayed.
docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -uroot -e "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`; CREATE DATABASE \`${RESTORE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
docker exec -i -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -uroot "${RESTORE_DB}" < "${BACKUP}"

after_tables="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RESTORE_DB}'")"
[[ "${before_tables}" == "${after_tables}" ]] || { echo "Restore table-count mismatch: source=${before_tables}, restored=${after_tables}" >&2; exit 1; }

for table in pamet_users pamet_sessions pamet_devices pamet_mfa pamet_sharing_invites pamet_stripe_events pamet_sync_blobs pamet_recovery_tokens pamet_feedback pamet_push_subscriptions pamet_appointments; do
  exists="$(docker exec -e MYSQL_PWD="${ROOT_PASSWORD}" "${CONTAINER}" mysql -N -uroot -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RESTORE_DB}' AND table_name='${table}'")"
  [[ "${exists}" == "1" ]] || { echo "Restored schema is missing ${table}." >&2; exit 1; }
  restored_count="$(mysql_scalar "${RESTORE_DB}" "SELECT COUNT(*) FROM \`${table}\`;")"
  [[ "${before_counts[${table}]}" == "${restored_count}" ]] || { echo "Restore row-count mismatch for ${table}: source=${before_counts[${table}]}, restored=${restored_count}" >&2; exit 1; }
done

# Validate representative relationships and encrypted data are readable as rows.
mysql_scalar "${RESTORE_DB}" "SELECT COUNT(*) FROM pamet_sessions s JOIN pamet_users u ON u.id=s.user_id;" >/dev/null
mysql_scalar "${RESTORE_DB}" "SELECT COUNT(*) FROM pamet_devices d JOIN pamet_users u ON u.id=d.user_id;" >/dev/null
mysql_scalar "${RESTORE_DB}" "SELECT COUNT(*) FROM pamet_sync_blobs b JOIN pamet_users u ON u.id=b.user_id WHERE OCTET_LENGTH(b.ciphertext)>0;" >/dev/null
mysql_scalar "${RESTORE_DB}" "CHECK TABLE pamet_users,pamet_sessions,pamet_devices,pamet_sharing_invites,pamet_sync_blobs;" >/dev/null

finished_at="$(date +%s)"
echo "Pamet backup/restore drill passed: tables=${after_tables}, users=${before_counts[pamet_users]}, duration=$((finished_at-started_at))s"
