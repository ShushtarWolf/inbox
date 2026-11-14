#!/usr/bin/env bash
# Resolve a Postgres URL for Liara inbox-db using LIARA_API_TOKEN (same secret as backup-db.yml).
# Writes DATABASE_URL to GITHUB_ENV when set; never prints credentials.
set -euo pipefail

: "${LIARA_TOKEN:?LIARA_TOKEN is required}"

API="https://api.liara.ir"
API_IR="https://api.iran.liara.ir"
AUTH="Authorization: Bearer ${LIARA_TOKEN}"
DB_HOSTNAME="inbox-db"

api_get() {
  local base="$1" path="$2" out="$3"
  curl -sS -o "$out" -w '%{http_code}' -H "$AUTH" --max-time 60 "${base}/${path}" || echo 000
}

DB_ID=$(curl -sS -H "$AUTH" --max-time 60 "${API}/v1/databases" \
  | jq -r --arg d "$DB_HOSTNAME" '.databases[]? | select(.hostname == $d) | ._id' | head -1)

if [ -z "$DB_ID" ] || [ "$DB_ID" = "null" ]; then
  echo "::error::Liara database ${DB_HOSTNAME} not found"
  exit 1
fi

MERGED='{}'
for base in "$API" "$API_IR"; do
  for path in "v1/databases/${DB_ID}" "v1/databases/${DB_HOSTNAME}"; do
    code=$(api_get "$base" "$path" /tmp/inbox-db-detail.json)
    if [ "$code" = "200" ] && jq -e 'type == "object"' /tmp/inbox-db-detail.json >/dev/null 2>&1; then
      FLAT=$(jq -c 'if .database then (. * .database) else . end' /tmp/inbox-db-detail.json)
      MERGED=$(jq -c -n --argjson a "$MERGED" --argjson b "$FLAT" '$a * $b')
    fi
  done
done

pick() { echo "$MERGED" | jq -r "$1 // empty"; }

DB_USER=$(pick '.username // .user // .rootUser // "root"')
DB_PASS=$(pick '.root_password // .password // .rootPassword // .dbPassword')
DB_PORT=$(pick '.internalPort // .privatePort // .port // 5432')
DB_NAME_PG=$(pick '.databaseName // .dbName // .db_name // "postgres"')

DATABASE_URL=""
for field in \
  publicNetworkUri publicUri externalUri uri connectionUri privateNetworkUri privateUri
do
  candidate=$(pick ".${field}")
  if [ -n "$candidate" ] && [ "$candidate" != "null" ]; then
    DATABASE_URL="$candidate"
    echo "Using Liara DB connection from API field ${field} (host redacted)"
    break
  fi
done

if [ -z "$DATABASE_URL" ] && [ -n "$DB_PASS" ] && [ "$DB_PASS" != "null" ]; then
  ENC_PASS=$(DB_PASS="$DB_PASS" python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['DB_PASS'], safe=''))")
  DATABASE_URL="postgresql://${DB_USER}:${ENC_PASS}@${DB_HOSTNAME}:${DB_PORT}/${DB_NAME_PG}?sslmode=disable"
  echo "Constructed DATABASE_URL from Liara API credentials (private network host)"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "::error::Could not resolve DATABASE_URL for ${DB_HOSTNAME}"
  exit 1
fi

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "DATABASE_URL=${DATABASE_URL}" >>"$GITHUB_ENV"
fi

echo "::add-mask::${DATABASE_URL}"
# Mask password substring if present (postgresql://user:pass@host/…)
if [[ "$DATABASE_URL" =~ postgres(ql)?://([^:]+):([^@]+)@ ]]; then
  echo "::add-mask::${BASH_REMATCH[3]}"
fi
export DATABASE_URL
