#!/usr/bin/env bash
# Fail if a Liara "inbox-db" artifact is not a Postgres dump that contains inbox Payment.
# Catches the recurring GlitchTip mis-download / wrong-database backup.
set -euo pipefail

DUMP="${1:?usage: assert-inbox-postgres-dump.sh <dump-file>}"
test -s "$DUMP"

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

if gzip -t "$DUMP" 2>/dev/null; then
  # Liara often wraps custom-format dumps in gzip.
  gzip -dc "$DUMP" 2>/dev/null | dd bs=1M count=2 2>/dev/null >"$TMP" || true
else
  dd if="$DUMP" of="$TMP" bs=1M count=2 2>/dev/null || cp "$DUMP" "$TMP"
fi

if grep -aqi 'glitchtip' "$TMP"; then
  echo "::error::Dump looks like GlitchTip (wrong database). Refusing artifact: $DUMP"
  exit 1
fi
if ! grep -aqE 'Payment|"Payment"' "$TMP"; then
  echo "::error::Dump has no Payment table marker — not inbox Postgres: $DUMP"
  exit 1
fi
echo "Dump OK (inbox Postgres markers found): $DUMP"
