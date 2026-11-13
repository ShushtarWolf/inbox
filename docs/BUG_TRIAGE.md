# Bug triage — 2026-11-13

Read-only triage at local `4ac13c9` (GitHub `main` is `511e031`, where [CI is green](https://github.com/ShushtarWolf/inbox/actions/runs/43449702342)).

**Check results (run locally, in order):**

| check | result |
|---|---|
| `npm run lint` | FAIL: 202 errors, all in the gitignored `.inbox-dev/`. Source files have 0 errors and 248 warnings. |
| `npm run typecheck` | FAIL: 530 errors. About 400 come from the missing generated Prisma client; the rest are listed below. |
| `npm test` | FAIL: 12 of 199 test files. 1,337 of 1,338 tests pass. Every failure is `Cannot find module '.prisma/client/default'`. |
| `npm run test:money` | FAIL: 3 of 3 test files, for the same Prisma reason. Not one money integration test ran. |
| `check:money-safety`, `check:ios-hit-testing`, `check:i18n` | PASS |

**Sentry:** not available. The Sentry MCP needs sign-in and authentication timed out, so there is no production issue or user count data. "Users affected" below is an estimate.

**No P0 found.** Nothing found here points to wrong money amounts, data loss, or blocked login, booking or payment.

| id | area | symptom | evidence | users affected | severity | est. size |
|---|---|---|---|---|---|---|
| T1 | payments/wallet | The money integration tests (`money.it.ts`, `paymentGatewayRef.it.ts`, `seasonEdit.it.ts`) didn't run locally, and no CI workflow runs `npm run test:money`. So nothing currently checks the money integration paths. | `package.json` script `test:money`; searching `.github/workflows` for `test:money` finds nothing | unknown (no Sentry); this is a risk, not an observed bug | P1 | S |
| T2 | admin | The admin calendar never shows the "paid" label for wallet or cash bookings. The code checks `channel === 'CASH'`, but `resolvePaymentChannel` only returns `IPG`, `WALLET`, `ON_SITE` or `null`, so that branch never runs. `WALLET` has no label either. | `app/pages/admin/calendar.vue:209`; `shared/bookingPayment.ts:213-216`; error TS2367 | admins | P2 | S |
| T3 | admin (tooling) | Typecheck isn't in CI. About 130 type errors remain once you discount the missing Prisma client. Most look like type-only drift, but they can hide real bugs like T2. | `.github/workflows/ci.yml:54-68` has no `typecheck` step | 0 (dev) | P2 | M |
| T4 | admin (tooling) | The local `node_modules` is damaged: there's no `.bin` folder, `@prisma/config` can't find `effect`, and the Prisma client isn't generated. Because of this, lint, typecheck, test and test:money can't run locally as-is. | `sh: eslint: command not found`; `Cannot find module 'effect'`; `node_modules/.prisma/client` is missing | 0 (dev) | P2 | S |
| T5 | admin | The admin payments and bookings pages pass a value that can be `null` into a function that expects a string. This could throw or display "null". Not verified. | `app/pages/admin/accounting/payments.vue:223`; `app/pages/admin/bookings/index.vue:541` | admins | P3 | S |
| T6 | booking | On the club detail page, `slug` isn't a field on the `ClubDetail` type, and the equipment list passed to the booking confirm sheet doesn't match the `ConfirmEquipment` type. Probably type-only, but it's in the price/confirm path. Not verified. | `app/pages/clubs/[slug].vue:1250`, `:1602` | athletes | P3 | S |
| T7 | UI | The city/sport club hub page uses `hub` without checking it exists, so an unknown city or sport could cause a 500 error instead of a 404. Not verified. | `app/pages/clubs/[city]/[sport].vue:63`, `:75` | public | P3 | S |
| T8 | coach | In coach booking, the guest search results don't match the `GuestSearchHit` type. The coach and owner package pages use a value that may be `undefined`. Not verified. | `app/pages/coach/book.vue:911`, `:934`; `app/pages/coach/packages.vue:354`, `:357`; `app/pages/owner/packages.vue:385`, `:388` | coaches, owners | P3 | S |
| T9 | owner | In the owner calendar, a desk-payment slot of type `DeskPaymentAnchorSlot` is passed where `OwnerCalendarSlot` is expected. Separately, one `fetchErrorMessage(err)` call has no fallback, but a `\|\| t(...)` after it covers that. | `app/pages/owner/calendar.vue:282`, `:1810` | owners | P3 | S |
| T10 | admin (tooling) | ESLint scans the gitignored `.inbox-dev/aloplay-js` minified bundles, so `npm run lint` fails on any machine that has that folder. CI passes only because the folder isn't checked out there. | 202 errors, all under `.inbox-dev/` | 0 (dev) | P3 | S |
| T11 | admin (docs) | `docs/UNDEPLOYED.md` is out of date. It says the last live deploy was `d2b1eec` (Sep 23), but GitHub Actions deployed `511e031` today. | `docs/UNDEPLOYED.md:3-5`; [deploy run 43449947370](https://github.com/ShushtarWolf/inbox/actions/runs/43449947370) | 0 | P3 | S |
| T12 | UI | Some screens were never visually checked against the HTML prototype. Coach, admin, pay-link and confirm are marked ENV/SKIPPED, and there are no live screenshots for athlete or owner screens because those need a login. | `design-reference/GAPS.md:18-19` | unknown | P3 | M |

**Checked and ruled out:**
- `app/pages/owner/settings.vue:417`: the `DELETE` call is fine because `server/api/owner/courts/[id].delete.ts` exists. This is a typed-route false positive.
- `app/plugins/sentry.client.ts:28`: the `captureException` error is most likely from the broken local install (T4).
