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

## Public home (`go('home')` → `/`) — Prompt 1 2026-10-26

Region gaps from `comparisons/home/` HTML vs live @375 + desktop:

| screen | region | HTML | live (before → after) | status |
|--------|--------|------|------|--------|
| home | header | `.pnav` white: logo + خانه/باشگاه‌ها/مربی‌ها + ورود + ثبت‌نام | desk `public-rhead` white + combined login; phone logo+login only | kept-product |
| home | hero | title + body only, no CTA; arrows/dots; ~340px | had red «رزرو زمین» CTA → removed; min-height 340 | fixed |
| home | search bar | one bordered `.rsearch`: CTA+تاریخ+شهر+ورزش | was gap-separated 4-field+TOD + chips; CTA showed raw key on prod | fixed |
| home | search date | calendar icon on date field | calendar icon + sheet (not inline popover) | fixed |
| home | search CTA | icon + «جستجو» flush in bar (RTL right) | icon + `t('common.search')` first in DOM | fixed |
| home | club cards | `.rrg` 2-col phone / 4 desk; `.rcard` 3/4 | was 3-col near-square phone → 2-col 3/4 | fixed |
| home | discount coupon | white perforated `.rdisc` «۲۰٪» on photo | same coupon class (dashed at 22px) | fixed |
| home | rails | پیشنهاد ما / تنیس / پدل + see-all | same IA + live club APIs | fixed |
| home | footer | contact + FAQ | enamad + legal links | kept-product |
| home | corners | square | `--sz-canva-radius: 0` | fixed |

Athlete shell home (`go('athlete-home')` / `/athlete/home`): search bar matched to same `.rsearch` field order (CTA · date · city · sport).

## Athlete / owner / coach / admin

(Fill per later slices.)

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
| home | header mid-nav / dual login | product AppTopBar + phone CanvaPublicChrome escape hatch |
| home | footer enamad | trust badge |
| owner-calendar | date-row FABs مسدود/رزرو/فصلی | desk ops; HTML date row is arrows-only |
| * | bottom nav / back / logo | escape hatches |
| * | real club photos | product over stock |
| coach today | accept-students + revenue | product extras vs simpler HTML Today |
