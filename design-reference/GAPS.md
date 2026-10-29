# HTML fidelity — GAPS v3 (2026-10-27)

Rules: visuals = `design-reference/sot/inbox-all-pages.html`; content and photos = live inboxs.ir. Branch shots use a local DB that mirrors live's public catalog (`scripts/local/mirror-live-catalog.mjs`, local dev only) and run with COMPETITIONS_ENABLED=true like live.
PDF: `design-reference/Inboxs-HTML-fidelity-3col-2026-10-27-v3.pdf` (BRANCH | SoT | LIVE).

| Page | Result | Notes |
|---|---|---|
| home | PASS | SoT `.rdisc` coupon (white ticket, perforations, notches, −4°, top 36%) with live text «۲۰٪»; hero copy 14.5/1.9 up to 560px; cream header. SoT's extra rails and coach row are demo content that live doesn't have. |
| clubs | PASS | The SoT coach card is not on live (pilotNoCoach). |
| club (iust-tennis) | PASS* | Court rows are now full width. *The OSM map iframe renders (checked on its own) but comes out blank in the full-page capture; this is a capture artifact. The "coaches of this club" block from live is missing because local has no linked coach (data). |
| about, pricing, terms, privacy, cancellation, complaints | PASS | |
| contact | PASS | |
| offline | PASS | The secondary button is the SoT outline style. |
| 404 | PASS | Live copy "404" kept. |
| forgot/reset-password, competitions | PASS | |
| login, register, choose-role, clubs/apply | ENV | Both live and the branch redirect these routes to home or the modal, so there is no page to shoot. The auth modal CSS was not changed. |
| athlete-* (home, bookings, profile, wallet, payments, notifications, support, favorites, competitions, m-athlete) | PASS (visual) | The live column can't be shot because live needs a login and we don't log into production. The local athlete has no bookings or transactions, so lists are empty states. |
| owner-* (calendar, finance, settings, crm, equipment, discount, support, staff) | PASS (visual) | Live needs a login. The calendar has no local bookings, so the SoT side booking panel isn't shown (data). |
| coach, admin, pay-link, confirm | ENV / SKIPPED | Not shot: these routes need a coach or admin role, or a payment write. |

## Product — court audience (2026-10-28)

| screen | region | change | status |
|--------|--------|--------|--------|
| owner-settings / club | court audience | `Court.audience` (MIXED/MEN/WOMEN/FAMILY) + CourtForm segment + public tags/warn + book gate + opt-in SMS on save | fixed (product) |
