# HTML ↔ Live visual gaps

Source of truth: `design-reference/sot/inbox-all-pages.html` (2026-10-26 owner HTML).  
Do not reopen rows already `fixed` or `kept-product` unless a fresh screenshot pair shows a regression.

| Item | Viewport | Status | Notes | Screenshots |
|---|---|---|---|---|
| home · hero slider controls | 375 / desktop | fixed | Arrows pinned to the hero sides, dots absolutely centered (SoT .rha/.rhd); hero 340px desktop / 300px phone; title one line at 34px desktop | design-reference/comparisons/home/ |
| home · search bar | 375 / desktop | fixed | Joined 60px bar, red جستجو with `search` icon on the start side, order date · city · sport, calendar icon on date (SoT .rsearch/.rsb/.rsf) | design-reference/comparisons/home/ |
| home · club cards | 375 / desktop | fixed | 3:4 rectangular frames, 2 cols phone / 4 cols ≥900px, SoT gradient + type sizes (15.5 / 11 / 11.5px); rail spacing 26px | design-reference/comparisons/home/ |
| home · discount ribbon | 375 / desktop | fixed | Top red strip replaced by white rotated ticket with dashed perforations (SoT .rdisc); badge = leading `۲۰٪` token of existing `home.pilotStudentOffer`, full copy kept as sr-only | design-reference/comparisons/home/ |
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
