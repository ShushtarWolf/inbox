#!/usr/bin/env bash
# Fail if a Liara "inbox-db" artifact is not a Postgres dump that contains inbox Payment.
# Catches the recurring GlitchTip mis-download / wrong-database backup.
#
# Liara often ships a gzip-wrapped tar with both postgres.dump (inbox) and glitchtip.dump
# on the shared instance — assert the inbox member, not the outer wrapper.
set -euo pipefail

DUMP="${1:?usage: assert-inbox-postgres-dump.sh <dump-file>}"
test -s "$DUMP"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

SAMPLE="$WORKDIR/sample"
CANDIDATE="$DUMP"

# Unwrap gzip if needed.
if gzip -t "$DUMP" 2>/dev/null; then
  gzip -dc "$DUMP" >"$WORKDIR/ungzip.bin"
  CANDIDATE="$WORKDIR/ungzip.bin"
fi

# Unwrap tar (Liara multi-DB backup) — prefer postgres.dump over glitchtip.dump.
if tar -tf "$CANDIDATE" >/dev/null 2>&1; then
  MEMBER=$(tar -tf "$CANDIDATE" | awk '
    tolower($0) ~ /(^|\/)postgres\.dump$/ { print; found=1; exit }
    tolower($0) ~ /\.dump$/ && tolower($0) !~ /glitchtip/ { print; found=1; exit }
  ')
  if [ -z "${MEMBER:-}" ]; then
    echo "::error::Tar dump has no postgres.dump / non-glitchtip member: $DUMP"
    tar -tf "$CANDIDATE" | head -20 >&2 || true
    exit 1
  fi
  # Strip leading ./ if present for -xOf
  tar -xOf "$CANDIDATE" "$MEMBER" >"$WORKDIR/member.dump"
  CANDIDATE="$WORKDIR/member.dump"
fi

# Sample for string markers (custom-format TOC still embeds table names).
dd if="$CANDIDATE" of="$SAMPLE" bs=1M count=8 2>/dev/null || cp "$CANDIDATE" "$SAMPLE"

HAS_PAYMENT=0
HAS_MONEY=0
grep -aqE 'COPY[[:space:]]+"Payment"|COPY[[:space:]]+public\."Payment"|"Payment"' "$SAMPLE" && HAS_PAYMENT=1
grep -aqE 'WalletTransaction|"WalletTransaction"|Booking|"Booking"' "$SAMPLE" && HAS_MONEY=1

# Prefer pg_restore -l when this is a custom-format dump (more reliable than strings).
if pg_restore -l "$CANDIDATE" >/dev/null 2>&1; then
  TOC=$(pg_restore -l "$CANDIDATE" 2>/dev/null || true)
  echo "$TOC" | grep -qE 'TABLE[^[:alnum:]]+public[^[:alnum:]]+Payment|TABLE DATA[^[:alnum:]]+public[^[:alnum:]]+Payment' && HAS_PAYMENT=1
  echo "$TOC" | grep -qE 'WalletTransaction|Booking' && HAS_MONEY=1
fi

if grep -aqi 'glitchtip' "$SAMPLE" && [ "$HAS_PAYMENT" -eq 0 ]; then
  echo "::error::Dump looks like GlitchTip (wrong database). Refusing artifact: $DUMP"
  exit 1
fi

if [ "$HAS_PAYMENT" -eq 0 ]; then
  echo "::error::Dump has no Payment table marker — not inbox Postgres: $DUMP"
  exit 1
fi
if [ "$HAS_MONEY" -eq 0 ]; then
  echo "::error::Dump missing WalletTransaction/Booking markers — refusing weak artifact: $DUMP"
  exit 1
fi
echo "Dump OK (inbox Postgres Payment + money markers): $DUMP"
