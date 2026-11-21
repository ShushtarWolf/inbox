-- Deprecated combined inventory — use per-ticket read-only reports instead:
--   scripts/sql/ib13-cancel-refund-classify-dry-run.sql
--   scripts/sql/ib14-orphan-payment-classify-dry-run.sql
--
-- gh workflow run readonly-sql-reports.yml -f report=ib13-cancel-refund-classify

SELECT 'use scripts/sql/ib13-cancel-refund-classify-dry-run.sql' AS notice;