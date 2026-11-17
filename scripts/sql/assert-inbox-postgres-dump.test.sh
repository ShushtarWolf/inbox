#!/usr/bin/env bash
# Self-check for assert-inbox-postgres-dump.sh (no real DB dump required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ASSERT="$ROOT/scripts/sql/assert-inbox-postgres-dump.sh"
chmod +x "$ASSERT"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# GlitchTip-only must fail.
printf 'glitchtip events table\n' >"$TMPDIR/glitch.dump"
if "$ASSERT" "$TMPDIR/glitch.dump" 2>/dev/null; then
  echo "expected glitchtip dump to fail"
  exit 1
fi

# Payment without sibling money tables must fail.
printf 'COPY "Payment" FROM stdin;\n' >"$TMPDIR/weak.dump"
if "$ASSERT" "$TMPDIR/weak.dump" 2>/dev/null; then
  echo "expected weak Payment-only dump to fail"
  exit 1
fi

# Inbox-shaped markers must pass.
printf 'COPY "Payment" FROM stdin;\nCOPY "WalletTransaction" FROM stdin;\n' >"$TMPDIR/ok.dump"
"$ASSERT" "$TMPDIR/ok.dump"

# Shared Liara cluster: gzip+tar with glitchtip.dump + postgres.dump (inbox markers).
printf 'COPY "Payment" FROM stdin;\n"WalletTransaction"\nBooking\n' >"$TMPDIR/postgres.dump"
printf 'glitchtip only\n' >"$TMPDIR/glitchtip.dump"
tar -cf "$TMPDIR/cluster.tar" -C "$TMPDIR" postgres.dump glitchtip.dump
gzip -c "$TMPDIR/cluster.tar" >"$TMPDIR/cluster.dump.gz"
"$ASSERT" "$TMPDIR/cluster.dump.gz"

echo "assert-inbox-postgres-dump self-check OK"
