# HTML prototype ↔ live visual gaps

**SoT:** `inbox-all-pages-html/prototype.html` (rendered in browser)  
**Map:** [`MAP.md`](./MAP.md)  
**Check:** `npm run check:html -- --screen <goId> --route <path>`  
**Outputs:** `design-reference/comparisons/<screen>/`

Status: `open` | `fixed` | `kept-product` (intentional product chrome / API extras)

Radius baseline: HTML is **square** (`border-radius: 0 !important`). Soft 10/20px MAP notes were wrong and corrected 2026-10-26.

## Foundation / shared

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| shared | corner radius | `border-radius:0 !important` on all | `--sz-canva-radius: 0` (mostly); old soft-radius SoT docs were wrong | fixed |
| shared | agent SoT docs | square HTML | was soft 10/20px in rule/MAP | fixed |
| shared | icon set | Tabler `ti-*` | Material Symbols; emoji welcome was wrong | open |
| shared | Canva LOCKED comments in CSS | — | misleading Canva checklist in main.css | fixed |
| shared | visual check tooling | — | `check:html` + comparisons/ | fixed |

## Public home (`go('home')` → `/`)

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| home | search date | `ti-calendar-event` + inline popover | calendar icon + modal sheet | open |
| home | search CTA | icon + «جستجو» in one bar | was raw key `common.search` (missing i18n); fixed key; layout still open | open |
| home | club offer | white perforated `.rdisc` «۲۰٪» on photo | coupon-style class (verify vs HTML) | open |
| home | club grid | 4× portrait `3/4` desk | 4 cols desk / near-square phone | open |
| home | corners | square | square tokens | open |

## Athlete / owner / coach / admin

(Fill per slice. Seed known opens from prior audits.)

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| athlete-home | header icons | Tabler bell + user | Material notifications + person | open |
| owner-calendar | slot blocked | near-black `#1a1a18` | black tokens (verify live) | open |
| owner-calendar | header avatar | square `#1d3b57` | square navy (verify) | open |
| owner-calendar | booked fill | neutral + crimson bar | neutral fill (verify bars) | open |
| coach hero | bell | `ti-bell` | Material notifications → settings | open |
| auth welcome | hand icon | `ti-hand-stop` | Material `waving_hand` (no emoji) | open |

## kept-product (do not “fix” into mock)

| screen | region | reason |
|--------|--------|--------|
| owner-calendar | date-row FABs مسدود/رزرو/فصلی | desk ops; HTML date row is arrows-only |
| * | bottom nav / back / logo | escape hatches |
| * | real club photos | product over stock |
| coach today | accept-students + revenue | product extras vs simpler HTML Today |
