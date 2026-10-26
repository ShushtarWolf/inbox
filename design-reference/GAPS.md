# HTML ↔ Live visual gaps

Source of truth: `design-reference/sot/inbox-all-pages.html` (2026-10-26 owner HTML).  
Do not reopen rows already `fixed` or `kept-product` unless a fresh screenshot pair shows a regression.

| Item | Viewport | Status | Notes | Screenshots |
|---|---|---|---|---|
| home · hero slider controls | 375 / desktop | fixed | Arrows pinned to the hero sides, dots absolutely centered (SoT .rha/.rhd); hero 340px desktop / 300px phone; title one line at 34px desktop | design-reference/comparisons/home/ |
| home · search bar | 375 / desktop | fixed | Joined 60px bar, red جستجو with `search` icon on the start side, order date · city · sport, calendar icon on date (SoT .rsearch/.rsb/.rsf) | design-reference/comparisons/home/ |
| home · club cards | 375 / desktop | fixed | 3:4 rectangular frames, 2 cols phone / 4 cols ≥900px, SoT gradient + type sizes (15.5 / 11 / 11.5px); rail spacing 26px | design-reference/comparisons/home/ |
| home · discount ribbon | 375 / desktop | fixed | Top red strip replaced by white rotated ticket with dashed perforations (SoT .rdisc); ticket shows the FULL existing `home.pilotStudentOffer` copy (content revert — earlier truncation to `۲۰٪` undone); CSS wraps it | design-reference/comparisons/home/ |
| home · desktop header buttons | desktop | fixed | Nav items 10×16px / 13px, login 11×20px / 12.5px (SoT .rn/.rbtn) | design-reference/comparisons/home/ |
| home · hero CTA «رزرو زمین» | 375 / desktop | kept-product | Live hero has a booking CTA; SoT hero has none | design-reference/comparisons/home/ |
| home · coaches nav + coach rail | 375 / desktop | kept-product | Hidden by `PILOT_NO_COACH` (owner-approved pilot flag) | design-reference/comparisons/home/ |
| home · rail contents / counts | 375 / desktop | kept-product | Real API clubs vs SoT fake list (incl. «به‌زودی» cards) | design-reference/comparisons/home/ |
| home · phone header | 375 | kept-product | SoT 375 is the desktop proto (no responsive shell); live keeps phone chrome (logo → home, login) | design-reference/comparisons/home/ |
| welcome modal `WAVING_HAND` raw text | 375 / desktop | fixed | `waving_hand` glyph was missing from the self-hosted Material Symbols subset → ligature text leaked. Subset rebuilt (+ `search`), font URL `?v=2`, PWA_RESET_VERSION 30→31 | (font fix; modal screenshot needs a login — see report) |

## Status legend
- `fixed` — visual match after code change
- `kept-product` — intentional live chrome / real API data / product difference
- `open` — still differs
- `missing in product` — in HTML SoT, not in live product
| auth-welcome WAVING_HAND | glyph renders after subset rebuild; proof `comparisons/auth-welcome/glyph-waving_hand-before-after.png` (main font leaks text, new font shows icon) | fixed |
| auth gate modal | SoT opens directly on OTP step with photo banner header; product opens choose step (ثبت‌نام / ورود) first, no banner | kept-product (flow step differs; banner header candidate for next slice) |

| clubs · chips + hero dots | 375 / desktop | fixed | Chip size/colours = SoT .rchips (#d1a42b active / #e3e0db idle), hero controls moved to shared .canva-hero-controls like home | design-reference/comparisons/clubs/ |
| clubs · coach card | — | kept-product | PILOT_NO_COACH hides coach | — |
| club · layout | desktop | fixed | SoT .rcl grid 1fr/440px gap 34px, gallery 300px tall (CSS only, real photo unchanged), booking panel stacked (calendar → court rows .rcts → slots), court rows full width | design-reference/comparisons/club/ |
| club · court mode tags | desktop | missing-in-product | SoT shows gender/mode tag per court; product has no field — documented only | — |
| club · dev 500 | dev | pre-existing bug | `node:crypto` imported client-side via shared/receiptToken.ts (not fixed; not visual) | — |
| legal · about/terms/privacy/pricing/cancellation/complaints | 375 / desktop | fixed | LegalDocument → SoT .legal (672px, 40px pad, lh 2.1, h1 26 / h2 17, meta 12.5 #6b6b67); copy unchanged | design-reference/comparisons/{about,terms,privacy,pricing,cancellation,complaints}/ |
| legal · about owner card | — | kept-product | Owner name card from live settings | — |
| contact | 375 / desktop | fixed | Separate bordered boxes → single SoT .card with .kv rows; message form in .card | design-reference/comparisons/contact/ |
| 404 / offline | 375 / desktop | fixed | Patterned result sheet → SoT .authbox (white, 440px, 34px pad, h1 22, sub 13) | design-reference/comparisons/{notfound,offline}/ |
| 404 · status numeral | — | kept-product | Live shows status code; SoT omits — content kept | — |
| confirm · booked state | sheet | fixed | Done state → SoT .ok-box: square mustard check tile 70px, h 22px, dashed .code box (24px code, letter-spacing 3px) — not re-shot: needs logged-in booking in dev + club page dev 500 | — |
| confirm · sheet vs page | — | kept-product | Product confirms in a sheet over club page; SoT uses a full page | — |
| login / OTP modal | 375 / desktop | fixed | Crimson top rule always shown + photo banner inset 18px (SoT login modal); real banner photo unchanged | design-reference/comparisons/login/ |
| login · modal over home | — | kept-product | AuthFlow gate modal; /choose-role and /register open the same modal (role step) | design-reference/comparisons/{choose-role,register}/ |
| forgot / reset password | 375 / desktop | fixed | Pattern + gradient sheet → flat #f4efe9 .authc, white 440px .authbox, start-aligned 22px title | design-reference/comparisons/{forgot-password,reset-password}/ |
| forgot · SMS-first copy & secondary button | — | kept-product | Product resets by SMS (SoT: email link) — content kept | — |
| auth inputs · 16px on mobile | 375 | kept-product | Prevents iOS zoom | — |
