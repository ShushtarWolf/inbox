# Bug triage — 2026-11-13

Local SHA at triage start: `4ac13c9` (later `main` moved past this). Production errors come from **GlitchTip** (`https://inbox-glitchtip.liara.run`, org/project `inbox`), not sentry.io. GlitchTip `userCount` is always `0` here — **users affected** below uses **event count** as a proxy (sorted by events unless noted).

**Check results (local, in order):**

| check | result |
|---|---|
| `npm run lint` | FAIL: 202 errors, all in gitignored `.inbox-dev/`. App source: 0 errors. |
| `npm run typecheck` | FAIL: ~530 errors; mostly missing generated Prisma client locally. |
| `npm test` | FAIL: 12 files / 1 assertion — all `Cannot find module '.prisma/client/default'`. 1337 tests otherwise pass. |
| `npm run test:money` | FAIL: 3/3 files, same Prisma reason (0 money IT tests ran). |
| `check:money-safety`, `check:ios-hit-testing`, `check:i18n` | PASS |

**Docs skim:** `docs/UNDEPLOYED.md` stale (claims last deploy `d2b1eec`). `design-reference/GAPS.md` — coach/admin/pay-link/confirm never shot (ENV/SKIPPED); no open money/auth product gaps.

**No P0 found** (no evidence of wrong money, data loss, or systemic can't-login/book/pay). Expected auth rejects (OTP/rate limit) are logged as errors but are not outages.

**Safe cleanup done 2026-11-13 (no prod deploy yet for code):** bulk-resolved ~87 GlitchTip scanner 404 Issues; `shared/sentryScrub.ts` now drops those probes + expected OTP/rate-limit events on the next deploy; ESLint ignores `.inbox-dev/`.

## Product / tooling issues

| id | area | symptom | evidence | users affected | severity | est. size |
|---|---|---|---|---|---|---|
| G1 | owner | `CLUB_NOT_ACTIVE` spam on owner calendar-sources (and related owner APIs) when club inactive — 691 events | [INBOX-374](https://inbox-glitchtip.liara.run/inbox/issues/3300) path `/api/owner/calendar-sources` | ~691 events (14d proxy) | P2 | S |
| G2 | owner | `Unauthorized` on owner calendar-sources / calendar (session expired or wrong role) — 218 + 16 events | [INBOX-S7](https://inbox-glitchtip.liara.run/inbox/issues/903), [INBOX-9](https://inbox-glitchtip.liara.run/inbox/issues/9) | ~234 events | P2 | S |
| G3 | auth | OTP verify: expired/missing (4), invalid (15); resend cooldown (1); rateLimited on request (7) — expected guards, noisy as Issues | [INBOX-PK](https://inbox-glitchtip.liara.run/inbox/issues/820), [INBOX-P4](https://inbox-glitchtip.liara.run/inbox/issues/804), [INBOX-41N](https://inbox-glitchtip.liara.run/inbox/issues/4151), [INBOX-OO](https://inbox-glitchtip.liara.run/inbox/issues/792) | ~27 events | P3 | S |
| G4 | auth | `Account disabled` on OTP verify (2 events) — intentional reject | [INBOX-3MC](https://inbox-glitchtip.liara.run/inbox/issues/3788) | 2 events | P3 | S |
| G5 | booking | `Club not found` on `/api/slots/available` for dead/typo slugs | [INBOX-PP](https://inbox-glitchtip.liara.run/inbox/issues/825), [INBOX-32L](https://inbox-glitchtip.liara.run/inbox/issues/3157) | ~62 events | P3 | S |
| G6 | booking | Pay-link checkout hit cancelled booking | [INBOX-41K](https://inbox-glitchtip.liara.run/inbox/issues/4148) `/api/receipts/.../checkout` | 1 event | P3 | S |
| G7 | booking | Invalid discount code attempts | [INBOX-R6](https://inbox-glitchtip.liara.run/inbox/issues/870) `/api/discounts/validate` | 3 events | P3 | S |
| G8 | UI | Client Sentry was empty in Actions-built Nitro until `NUXT_PUBLIC_SENTRY_DSN` set (2026-11-13); hard-refresh `/admin/sentry` to clear yellow banner | live page now embeds DSN host `inbox-glitchtip.liara.run`; [workflow](https://github.com/ShushtarWolf/inbox/actions/runs/43465028265) | n/a | P2 | S |
| T1 | payments/wallet | `npm run test:money` not in CI; local money ITs blocked by missing Prisma | `package.json` `test:money`; no match in `.github/workflows` | unknown | P1 | S | **FIXED 2026-11-13** — CI runs `test:money` on isolated `wallet_it` schema; `resolveMoneyItDatabaseUrl` fails loud in CI if unset (no silent `describe.skip`); regression `server/utils/moneyItEnv.test.ts`. Local Prisma still T4. |
| T2 | admin | Admin calendar paid label never shows for cash/wallet (`channel === 'CASH'` but channel is `ON_SITE`/`WALLET`) | `app/pages/admin/calendar.vue:209`; `shared/bookingPayment.ts:213-216` | admins | P2 | S |
| T3 | admin | Typecheck not in CI; ~130 non-Prisma type errors remain | `.github/workflows/ci.yml` | 0 (dev) | P2 | M |
| T4 | admin | Local `node_modules` broken (no `.bin`, Prisma client missing) | local lint/test failures | 0 (dev) | P2 | S |
| T5 | admin | Possible null passed where string expected on admin payments/bookings | `app/pages/admin/accounting/payments.vue:223`; `app/pages/admin/bookings/index.vue:541` | admins | P3 | S |
| T10 | admin | ESLint scans `.inbox-dev/` → local lint fail | 202 errors under `.inbox-dev/` | 0 (dev) | P3 | S |
| T11 | admin | `docs/UNDEPLOYED.md` stale | `docs/UNDEPLOYED.md:3-5` | 0 | P3 | S |
| T12 | UI | Coach/admin/pay-link/confirm never visually checked vs HTML SoT | `design-reference/GAPS.md:18-19` | unknown | P3 | M |

## Top 20 unresolved by event count (14d) — raw

Most high-count rows are **scanner 404 noise** (`.env`, `.git`, WordPress probes). Listed for completeness; not product bugs.

| rank | shortId | title | events | link |
|---|---|---|---|---|
| 1 | INBOX-374 | CLUB_NOT_ACTIVE | 691 | https://inbox-glitchtip.liara.run/inbox/issues/3300 |
| 2 | INBOX-K | Page not found: /.env | 280 | https://inbox-glitchtip.liara.run/inbox/issues/20 |
| 3 | INBOX-G | Page not found: /.git/config | 229 | https://inbox-glitchtip.liara.run/inbox/issues/16 |
| 4 | INBOX-S7 | Unauthorized | 218 | https://inbox-glitchtip.liara.run/inbox/issues/903 |
| 5 | INBOX-D | Page not found: /xmlrpc.php | 163 | https://inbox-glitchtip.liara.run/inbox/issues/13 |
| 6 | INBOX-B | Page not found: /wp-login.php | 161 | https://inbox-glitchtip.liara.run/inbox/issues/11 |
| 7 | INBOX-N | Page not found: //xmlrpc.php?rsd | 158 | https://inbox-glitchtip.liara.run/inbox/issues/23 |
| 8–20 | various | Page not found: //…/wlwmanifest.xml (and similar) | ~151–153 each | GlitchTip Issues list |

**Perf note (not in table):** GlitchTip Performance shows slow `POST /api/owner/season` ~7.15s avg — worth a separate perf pass, not a P0 money bug.
