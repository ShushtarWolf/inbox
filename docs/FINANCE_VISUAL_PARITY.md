# Finance visual parity

The approved picture is `money-dashboards-v4-simple-copy.html`. This change makes the live owner finance page and the athlete wallet page follow that layout. It does not change payment, refund, cancel, or ledger code, and it does not add a migration.

Base at the time of the branch: `2ad32878de2409b0220ca0f528b08987df5b92a3` (after release `98b9b41ec880a976dc4b382df20e03b1cef791c6`).

## What was wrong

Release `98b9b41` already had the four finance tabs and the plain Farsi labels. The owner wallet still did not look like the approved page:

- A full-bleed club photo sat above the money.
- The tabs were filled pills, not an underline.
- The online balance was a stacked list (total, pending, in payout, debt) instead of a navy card with the withdrawable amount, two side boxes, and a disclosure for the total.
- The cash till sat under that list instead of beside it on a wide screen.
- The athlete wallet was a navy card that put club cash next to the site balance.

The owner opens this page from مالی in the side menu and the bottom bar. Both go to `/owner/finance`. That is the page that changed.

## What the pages do now

Owner `/owner/finance`, tab نمای کلی: navy card (withdrawable amount, برداشت button that only switches to the existing payout tab, pending release, in payout, disclosure for the total) and a white cash-till card. Below that, the three today figures. Cash still comes from `cashBook`. Online still comes from settlement. They are not added together.

پرداخت‌ها keeps the cash/online/all switch, the existing filters, the full filtered Excel download, the detail sheet, and the cash-return button. برداشت و شبا keeps SHEBA, withdraw, the ledger, and coach transfer. گزارش‌ها keeps the count-based method bar and the link to `/owner/finance/report`.

Athlete `/athlete/wallet`: red card for the site balance, a pair for bank transfer versus money already in payout, and the real top-up and withdraw forms behind those buttons. پرداخت‌های نقدی is a tab. پرداخت‌ها opens the existing `/athlete/payments` page.

## Screenshots

Local disposable database `127.0.0.1`, schema `public`, repo seed (`SEED_DEMO_DATA=true`). Not a signed-in production account. The amounts are that seed club, not the sample 8,400,000 in the HTML.

| File | What it is |
|---|---|
| `/opt/cursor/artifacts/visual/approved-owner-desktop-1440.png` | Approved HTML, owner, 1440 |
| `/opt/cursor/artifacts/visual/approved-owner-mobile-390.png` | Approved HTML, owner, 390 |
| `/opt/cursor/artifacts/visual/approved-owner-mobile-375.png` | Approved HTML, owner, 375 |
| `/opt/cursor/artifacts/visual/approved-athlete-desktop-1440.png` | Approved HTML, athlete, 1440 |
| `/opt/cursor/artifacts/visual/approved-athlete-mobile-390.png` | Approved HTML, athlete, 390 |
| `/opt/cursor/artifacts/visual/fixed-owner-desktop-1440.png` | Local owner fixture, 1440 |
| `/opt/cursor/artifacts/visual/fixed-owner-mobile-390.png` | Local owner fixture, 390 |
| `/opt/cursor/artifacts/visual/fixed-owner-mobile-375.png` | Local owner fixture, 375 |
| `/opt/cursor/artifacts/visual/fixed-owner-payments-desktop-1440.png` | Local owner, payments tab |
| `/opt/cursor/artifacts/visual/fixed-owner-payout-desktop-1440.png` | Local owner, payout tab |
| `/opt/cursor/artifacts/visual/fixed-athlete-desktop-1440.png` | Local athlete fixture, 1440 |
| `/opt/cursor/artifacts/visual/fixed-athlete-mobile-390.png` | Local athlete fixture, 390 |
| `/opt/cursor/artifacts/visual/fixed-athlete-mobile-375.png` | Local athlete fixture, 375 |
| `/opt/cursor/artifacts/visual/fixed-athlete-cash-desktop-1440.png` | Local athlete, cash tab |

A second running copy of the old photo-hero page was not booted. The old layout is the finance page at `2ad32878` before this commit.

## Still different on purpose

- The app sidebar, bottom bar, and legal footer stay. The HTML demo toolbar does not.
- The برداشت button is gray when the real withdrawable amount is 0. The HTML button is red because its sample balance is positive.
- An empty cash-return queue is omitted. The HTML shows sample people.
- Customer stats and the funnel stay on `/owner/finance/report`.
- SHEBA stays an editable field. The HTML hid editing because it was only a preview.
- No production screenshot was taken.

## Checks

- `shared/financeDashboard.source.test.ts` and `shared/financeTransactions.test.ts`: 17 passed.
- ESLint on the two pages: 0 errors. Five existing payout-form label warnings remain.
- `nuxi typecheck` was not re-run. It was already failing on unrelated files and is not a CI gate.
- No money-path files were edited. The 2,500 toman correction for receipt 1541908 was not run again.
