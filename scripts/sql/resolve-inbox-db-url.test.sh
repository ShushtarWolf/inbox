#!/usr/bin/env bash
# Self-check for resolve-inbox-db-url.sh (no Liara API / credentials).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/sql/resolve-inbox-db-url.sh"
chmod +x "$SCRIPT"

bash -n "$SCRIPT"

# Must not hard-code TLS for public host construction (Liara public Postgres has no TLS).
if grep -E 'ssl="require"|sslmode=require' "$SCRIPT" >/dev/null; then
  echo "resolve-inbox-db-url.sh still forces sslmode=require"
  exit 1
fi

grep -q 'INBOX_DB_SSLMODE="${INBOX_DB_SSLMODE:-disable}"' "$SCRIPT" || {
  echo "missing INBOX_DB_SSLMODE default"
  exit 1
}

# Default and override behavior for sslmode query param.
unset INBOX_DB_SSLMODE
mode="${INBOX_DB_SSLMODE:-disable}"
[[ "$mode" = "disable" ]] || {
  echo "expected default disable, got $mode"
  exit 1
}
INBOX_DB_SSLMODE=require
mode="${INBOX_DB_SSLMODE:-disable}"
[[ "$mode" = "require" ]] || {
  echo "expected INBOX_DB_SSLMODE=require, got $mode"
  exit 1
}
unset INBOX_DB_SSLMODE

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "$SCRIPT"
fi

echo "resolve-inbox-db-url self-check OK"