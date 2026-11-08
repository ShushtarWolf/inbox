# Finance dashboard (approved prototype → live pages)

Visual and wording source: `money-dashboards-v4-simple-copy.html` (plain Farsi, cream/red/navy, RTL).
The HTML demo toolbar, state switches, source-coverage panel, and sample amounts are not part of the product.

This change does not alter ledger math, schema, bank calls, or historical reconstruction. No migration.

## Routes

| Prototype region | Live route | Data | Who sees it |
|---|---|---|---|
| Owner overview | `/owner/finance` tab نمای کلی | `GET /api/owner/finance`, `GET /api/owner/settlement` | Club owner, or staff with any finance permission. Front desk with no finance permission sees the locked notice and no balances. |
| Owner payments | same page, tab پرداخت‌ها | `data.transactions` through `selectFinanceTransactions` | `finance:transactions` (owner bypasses). Rails همه / نقدی / آنلاین, filters, sort, detail sheet, Excel of the full filtered set. |
| Cash owed queue | overview and payments tab | `deskCashReturnsOwed` | same transaction permission. Confirm calls `POST /api/owner/payments/:id/ack-cash-return`. |
| Wallet statement | payments tab, hidden on the cash rail | settlement ledger rows already returned for reports | `finance:reports` |
| Payout and SHEBA | tab برداشت و شبا | settlement SHEBA, withdraw, ledger, coach transfer | `finance:payouts`. Tab is omitted without that permission. |
| Reports | tab گزارش‌ها plus `/owner/finance/report` | method bar is booking **counts** (already computed server-side). Full funnel, export, and customer signals stay on the report page. | `finance:reports` |
| Athlete wallet | `/athlete/wallet` | existing wallet and cash-desk payloads | signed-in athlete. Cash till is club-held accounting, not spendable site balance. |
| Athlete payments and cancel copy | `/athlete/payments`, booking cancel notices | existing payment and cancel APIs | athlete. Ordinary online cancel still says the amount returns to the wallet; bank payout is a separate request. |

## Numbers that must stay apart

- Withdrawable (`heroWithdrawable` / settlement `withdrawableBalance`) is the large online figure. It is not cash in the till and not unpaid receivables.
- «هنوز قابل برداشت نیست» is `pendingRelease`. «در حال واریز به حساب شما» is `inPayout`. «موجودی کل کیف باشگاه» is total balance and must not be added to those three.
- Cash card uses `cashBook.inTill` and `cashBook.returnsOwed` only.
- «طلب از مشتریان» is `stats.unpaidAmount`. Unpaid is not available to cash out.
- Commission line still uses settlement `commissionBps` from the server. It is not a fixed sample percent.

## Not shipped from the HTML

- Design toolbar (`#dtool`), demo SHEBA `<select>`, sample people, and the 8,400,000 / 3,200,000 fixtures.
- Calendar, pay-link, and SMS buttons marked نمونه. Those actions stay on the real calendar where they already exist.
- No iframe and no replacement of app navigation.

## Permissions

Gates are the existing `hasOwnerPermission` checks (`finance:view` is implied by the four finance keys; legacy `finance` grants all four). OWNER bypasses. While `/api/auth/me` has not hydrated memberships, sections stay in the loading-safe state (`reportsGatePending`) so a real owner is not shown the locked notice. APIs still enforce the same permissions.

Pilot flags are unchanged: `pilotNoCoach` still hides the session filter; competitions stay behind the existing competitions flag and are not drawn on this page.

## Known boundaries

- Playwright desktop/mobile screenshots were not captured in this change (no authenticated owner fixture was booted here). Layout uses the existing owner finance classes.
- Wallet-first IPG labels (`IPG_BOOKING_CREDIT` / `IPG_BOOKING_DEBIT` / `IPG_RETURNED_TO_CARD`) already exist in athlete history from the merged wallet-first work. This page does not invent extra rows.
- Guest «no account» and bank-outcome-unknown cancels stay on the existing cancel/reconciliation states. This UI does not credit them.
- Coach transfer remains inside the payout tab, fed by the existing coach list endpoint. An empty list means there is nobody to transfer to.
