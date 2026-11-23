#!/usr/bin/env bash
# Resolve a Postgres URL for Liara inbox-db using LIARA_API_TOKEN (same secret as backup-db.yml).
# GitHub Actions runners need the public network (network.node.host + port); inbox-db is private-only.
# Writes DATABASE_URL to GITHUB_ENV when set; never prints credentials.
set -euo pipefail

: "${LIARA_TOKEN:?LIARA_TOKEN is required}"

API="https://api.liara.ir"
API_IR="https://api.iran.liara.ir"
AUTH="Authorization: Bearer ${LIARA_TOKEN}"
DB_HOSTNAME="${DB_HOSTNAME:-inbox-db}"
RUNNER_NEEDS_PUBLIC=$([[ "${GITHUB_ACTIONS:-}" = "true" || "${REQUIRE_PUBLIC_DATABASE_URL:-}" = "1" ]] && echo 1 || echo 0)

api_get() {
  local base="$1" path="$2" out="$3"
  curl -sS -o "$out" -w '%{http_code}' -H "$AUTH" --max-time 60 "${base}/${path}" || echo 000
}

api_patch() {
  local base="$1" path="$2"
  curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$AUTH" --max-time 60 "${base}/${path}" || echo 000
}

DB_ID=$(curl -sS -H "$AUTH" --max-time 60 "${API}/v1/databases" \
  | jq -r --arg d "$DB_HOSTNAME" '.databases[]? | select(.hostname == $d) | ._id' | head -1)

if [ -z "$DB_ID" ] || [ "$DB_ID" = "null" ]; then
  echo "::error::Liara database ${DB_HOSTNAME} not found"
  exit 1
fi

MERGED='{}'

merge_db_details() {
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
}

merge_db_details

pick() { echo "$MERGED" | jq -r "$1 // empty"; }

refresh_credentials() {
  DB_USER=$(pick '.username // .user // .rootUser // "root"')
  DB_PASS=$(pick '.root_password // .password // .rootPassword // .dbPassword')
  DB_PORT=$(pick '.internalPort // .privatePort // .port // 5432')
  DB_NAME_PG=$(pick '.databaseName // .dbName // .db_name // "postgres"')
}

refresh_credentials

# Prefer publicly reachable URIs from GitHub runners. Private hostname inbox-db
# only resolves inside Liara's network.
is_private_only_host() {
  local url="$1"
  case "$url" in
    *"@${DB_HOSTNAME}"*|*"@${DB_HOSTNAME}/"*|*"://${DB_HOSTNAME}"*|*"://${DB_HOSTNAME}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

public_network_enabled() {
  local pn
  pn=$(pick '.publicNetwork')
  [[ "$pn" = "true" || "$pn" = "1" ]]
}

url_encode_password() {
  DB_PASS="$DB_PASS" python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['DB_PASS'], safe=''))"
}

try_build_public_host_url() {
  local host pub_port enc_pass ssl
  if ! public_network_enabled; then
    return 1
  fi
  host=$(pick '.network.node.host')
  if [ -z "$host" ] || [ "$host" = "null" ]; then
    return 1
  fi
  if [ -z "$DB_PASS" ] || [ "$DB_PASS" = "null" ]; then
    return 1
  fi
  pub_port=$(pick '.port')
  if [ -z "$pub_port" ] || [ "$pub_port" = "null" ]; then
    pub_port=5432
  fi
  enc_pass=$(url_encode_password)
  ssl="require"
  DATABASE_URL="postgresql://${DB_USER}:${enc_pass}@${host}:${pub_port}/${DB_NAME_PG}?sslmode=${ssl}"
  echo "Constructed DATABASE_URL from Liara public network host (host redacted)"
  return 0
}

request_public_network_enable() {
  local base code ok=1
  echo "Requesting Liara public network access for ${DB_HOSTNAME}"
  for base in "$API" "$API_IR"; do
    code=$(api_patch "$base" "v1/databases/${DB_ID}/public-network/enable")
    case "$code" in
      200)
        echo "Public network enable started (HTTP 200)"
        ok=0
        ;;
      409)
        echo "Public network already enabled (HTTP 409)"
        ok=0
        ;;
      428)
        echo "::warning::Liara plan may not allow public network access (HTTP 428 from ${base})"
        ;;
      *)
        echo "Public network enable probe ${base} -> HTTP ${code}"
        ;;
    esac
  done
  return "$ok"
}

DATABASE_URL=""
for field in publicNetworkUri publicUri externalUri; do
  candidate=$(pick ".${field}")
  if [ -n "$candidate" ] && [ "$candidate" != "null" ]; then
    if is_private_only_host "$candidate"; then
      echo "Skipping Liara DB field ${field} (private host ${DB_HOSTNAME})"
      continue
    fi
    DATABASE_URL="$candidate"
    echo "Using Liara DB connection from API field ${field} (host redacted)"
    break
  fi
done

if [ -z "$DATABASE_URL" ]; then
  try_build_public_host_url || true
fi

if [ -z "$DATABASE_URL" ] && [ "$RUNNER_NEEDS_PUBLIC" = 1 ]; then
  if ! public_network_enabled || [ -z "$(pick '.network.node.host')" ]; then
    request_public_network_enable || true
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      sleep 3
      merge_db_details
      refresh_credentials
      if try_build_public_host_url; then
        break
      fi
      for field in publicNetworkUri publicUri externalUri; do
        candidate=$(pick ".${field}")
        if [ -n "$candidate" ] && [ "$candidate" != "null" ] && ! is_private_only_host "$candidate"; then
          DATABASE_URL="$candidate"
          echo "Using Liara DB connection from API field ${field} after public-network wait (host redacted)"
          break
        fi
      done
      if [ -n "$DATABASE_URL" ]; then
        break
      fi
      echo "Waiting for Liara public network host (attempt ${attempt}/10)…"
    done
  fi
fi

if [ -z "$DATABASE_URL" ] && [ "$RUNNER_NEEDS_PUBLIC" != 1 ]; then
  for field in uri connectionUri privateNetworkUri privateUri; do
    candidate=$(pick ".${field}")
    if [ -n "$candidate" ] && [ "$candidate" != "null" ]; then
      if ! is_private_only_host "$candidate"; then
        DATABASE_URL="$candidate"
        echo "Using Liara DB connection from API field ${field} (host redacted)"
        break
      fi
    fi
  done
fi

if [ -z "$DATABASE_URL" ] && [ -n "$DB_PASS" ] && [ "$DB_PASS" != "null" ]; then
  if [ "$RUNNER_NEEDS_PUBLIC" = 1 ]; then
    echo "::error::No publicly reachable DATABASE_URL for ${DB_HOSTNAME}. Liara public network host is unavailable from this runner."
    exit 1
  fi
  enc_pass=$(url_encode_password)
  DATABASE_URL="postgresql://${DB_USER}:${enc_pass}@${DB_HOSTNAME}:${DB_PORT}/${DB_NAME_PG}?sslmode=disable"
  echo "Constructed DATABASE_URL from Liara API credentials (private network host)"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "::error::Could not resolve DATABASE_URL for ${DB_HOSTNAME}"
  exit 1
fi

if is_private_only_host "$DATABASE_URL" && [ "$RUNNER_NEEDS_PUBLIC" = 1 ]; then
  echo "::error::Resolved DATABASE_URL still targets private host ${DB_HOSTNAME}; GitHub Actions cannot reach it"
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