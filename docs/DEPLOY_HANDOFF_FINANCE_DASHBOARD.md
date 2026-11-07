# Deploy handoff — finance dashboard

This is a review handoff. It does not deploy, merge, or write production data.

## Git

- Branch: `cursor/finance-dashboard-1005`
- Base (`origin/main` at branch creation and at this commit): `1b759e9bf8e38feb7fcbd1a74245eebf4e486cbb`
  - Subject: `fix(owner): finance UI shows settlement commissionBps (UI only) (#122)`
- Implementation commit: `69435089494ffa4d0b0033e691ce8db4398d64bd`
- The commit that adds this file is the branch tip to review. Use `git rev-parse HEAD` on `cursor/finance-dashboard-1005` after fetch. Do not deploy `main` until this branch is merged.
- Ancestry includes merged PR125 `65c06fb5b29a55cafdb2a7fd63d1b8f6e207583a` (wallet-first IPG). That merge is on `main`. It is not proof the release is live.
- Last known production release, from the requester: `ff8889ded4b9ee158ea5150de70d04bc54b353e7`. Do not treat `65c06fb5` or `1b759e9b` as live without a health check after a real deploy.

## What changed

Live owner page `/owner/finance` now follows the approved prototype layout and plain Farsi, using the existing finance and settlement APIs. Mapping: `docs/FINANCE_DASHBOARD.md`.

Unchanged on purpose:

- Ledger math, wallet balances, SHEBA approval, withdraw, cash-ack, and cancel refund behavior
- Prisma schema and migrations. **No migration in this branch.**
- Historical reconstruction. **Do not run any APPLY script. Do not reconstruct wallets. Do not tweak the production database.**
- Public club listing, calendar, and the rest of the site

## Tests run on this branch

| Check | Result |
|---|---|
| `npm test` | 190 files, 1293 tests, all passed |
| `shared/financeTransactions.test.ts` + `shared/financeDashboard.source.test.ts` | 17 passed, including full filtered Excel (40 rows, not a page slice) and permission/copy wiring |
| `npm run check:money-safety` | OK |
| `npx eslint` on the finance page and the new test | 0 errors. 5 pre-existing `label-has-for` warnings on the payout form |
| `npm run build` | Completed (`Build complete`) |
| `npm run typecheck` | Exit 2. Failures are pre-existing and outside this diff (`useAdminSecret`, clubs, calendar, competitions, external-calendar module, admin accounting, `nuxt.config.ts`, and others). The log does not mention `owner/finance`. |
| `npm run test:money` | 28 passed, 1 failed. See below. Not a production run. |
| Playwright desktop/mobile | Not run. Owner and athlete finance pages need a signed-in session. No screenshot was taken. Console, RTL clipping, and responsive layout were not checked in a browser. |

### money.it failure (local disposable database only)

`cron money audit reports zero drift after a paid withdraw` expected `userBalanceDrift === 0` and got `1`.

The audit counts every wallet in the schema. The disposable database at `127.0.0.1` (not production) already had one wallet before this UI work:

- id `cmw6o9d3p0008jsywgekj1r8x`
- created `2026-11-07T17:23:09.590Z`
- stored balance `50000`, ledger sum `60000`, paid withdrawals `0`

This branch does not change `moneyAudit` or wallet writes. The row was not deleted or corrected here. The other 24 money.it cases in that file passed, including wallet-first IPG, cancel-to-wallet, guest no-account, and cash staying out of the club wallet.

## Teammate deploy (only after review and merge)

1. Review this branch. Merge it only if the diff matches `docs/FINANCE_DASHBOARD.md`.
2. Backup first: `gh workflow run backup-db.yml --ref main`. Download the dump locally before anything else. A cloud hourly backup is not a substitute.
3. Deploy the merged `main` with `gh workflow run deploy.yml --ref main -f path=germany-fast`.
4. Require both **Deploy succeeded** and **Verify live inboxs.ir** green. Then probe `https://inboxs.ir/api/health` until HTTP 200 and `"ok":true`. Actions green alone is not enough.
5. If Germany leaves the site on 502, recover with `path=iran-only` and probe again.
6. Confirm the release another way than the health JSON. Health does not echo the git SHA. Compare the owner finance page with the merged commit (tabs نمای کلی / پرداخت‌ها / برداشت و شبا / گزارش‌ها, and the title «پول آنلاین باشگاه»).
7. Take another local dump after the successful live probe.

Explicitly out of scope for that deploy:

- No historical APPLY
- No wallet reconstruction
- No production balance edit
- No live bank or SEP test
