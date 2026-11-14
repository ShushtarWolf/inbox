# Read-only SQL reports

Curated `psql` scripts for production investigations. Each file is **SELECT-only**; never run ad-hoc writes against production.

## Files

| Script | Purpose |
| --- | --- |
| `sms-delivery-gap.sql` | When booking/cancel SMS stopped being accepted by Kavenegar |
| `trace-wallet-cancel-lost-refund.sql` | Stranded wallet debits on cancelled court bookings |
| `list-suspect-court-time-bands.sql` | Court time-band pricing that looks unintended |

### `trace-wallet-cancel-lost-refund.sql` section (c)

Section **(c)** is a **dry-run SELECT** listing proposed wallet refunds. It does not `INSERT`/`UPDATE`. The GitHub workflow runs sections **(a)–(c)** after `assert-readonly-sql.py` passes. If section (c) ever gains writes, split the file or stop at section (b) before running in CI.

## Local run (scratch DB)

Prefer a Liara dump restored locally (see `scripts/sync-local-db-from-prod-backup.mjs` and `docs/OPERATIONS.md`). Then:

```bash
export PGOPTIONS='-c default_transaction_read_only=on'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
\i scripts/sql/sms-delivery-gap.sql
ROLLBACK;
SQL
```

## GitHub Actions (production)

Workflow: [`.github/workflows/readonly-sql-reports.yml`](../../.github/workflows/readonly-sql-reports.yml)

1. Actions → **Read-only SQL reports** → **Run workflow**
2. Choose `report` (`all` or a single script name)
3. Uses repo secret **`LIARA_API_TOKEN`** (same as `backup-db.yml`) and Liara API to resolve `inbox-db` credentials — credentials are masked in logs (`::add-mask::`)
4. Safety: static SQL guard, `PGOPTIONS=default_transaction_read_only=on`, `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`, 60s statement timeout
5. Output: masked phones / Sheba / card numbers → job summary + artifact (7-day retention)

Reports not present on `main` are listed in the summary and skipped.
