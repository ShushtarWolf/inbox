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

## Clubs / club / confirm — Prompt 2 2026-10-26

Screenshots: `comparisons/clubs|club|confirm/` (HTML vs live @375 + desktop). Tool: `node scripts/check-html-clubs-slice.mjs`.

### `go('clubs')` → `/clubs`

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| clubs | chips | mustard `#d1a42b` on / `#e3e0db` idle, px 18 | matched `.canva-clubs-chip` | fixed |
| clubs | cards | `.rwide` landscape, crimson title, 270° wash, 2-col desk | matched overlay + title `#e8383a`; 2-col desk grid | fixed |
| clubs | coach row | `.rbox rlink` مربی | find-coach link | fixed |
| clubs | header/footer | pubNav + FAQ | product chrome / enamad | kept-product |

### `go('club')` → `/clubs/[slug]`

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| club | gallery | `.rgal` height 300 | height 300 | fixed |
| club | book widget | legend + cal + `.rnums` + crimson hour chips | navy-outline court nums; crimson selected slots | fixed |
| club | desk layout | info \| book 2-col | existing grid areas | fixed |
| club | guest CTA | gray until selection | «ورود برای ادامه» when logged out | kept-product |

### Confirm sheet (`dcm` / `CourtBookingConfirmSheet`)

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| confirm | hierarchy | charcoal title + small club; mxsr rows | was green title + huge red club → charcoal + small club | fixed |
| confirm | discount | beige «اعمال» | `.cxtiny`-like beige | fixed |
| confirm | CTAs | red پرداخت + crimson-outline کیف پول | wallet outline; guest login CTA | fixed |
| confirm | logo/close | X only | logo + بستن escape hatch | kept-product |

## Auth (`go('login')` / OTP / choose-role / welcome) — Prompt 3 2026-10-26

Screenshots: `comparisons/{gate,login,login-otp,choose-role,welcome}/`. Tool: `node scripts/check-html-auth-slice.mjs`.

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| gate | CTAs | square red / outline | square `.canva-gate-btn-*` | fixed |
| login | fields + CTA | square input + `.rmod-go` | square neo-input + primary CTA | fixed |
| login-otp | fields + CTAs | square OTP + تایید / ارسال دوباره | square fields + primary/secondary | fixed |
| choose-role | role cards | square role rows | AuthFlow role cards square | fixed |
| welcome | hand icon | crimson box + `ti-hand-stop` SVG | crimson square + `AuthHandStopIcon` (no Material ligature) | fixed |
| welcome | title color | charcoal | was emerald → navy | fixed |

## Athlete shell — Prompt 4 2026-10-26

Screenshots: `comparisons/{athlete-home,athlete-bookings,athlete-hub,athlete-wallet,m-athlete}/` (HTML vs live @375 + desktop). Tool: `node scripts/check-html-athlete-slice.mjs`. Mobile SoT for home chrome is `go('m-athlete')` `#m1` (desk `go('athlete-home')` is dash + `.rbanner`).

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| m-athlete / athlete-home | topbar | logo + `ti-bell` + `ti-user` on photo `.mbt` | `InboxBrandLockup` + Material notifications + person; gap 14px | fixed |
| m-athlete / athlete-home | search | `.msr` / `.rsearch`: CTA · تاریخ · شهر · ورزش | same `.canva-search-row` order + calendar on date | fixed |
| m-athlete / athlete-home | hero | `.mban` / `.rbanner` 176px + promo tag | `.canva-photo-hero` min-height 176 + promo badge | fixed |
| m-athlete / athlete-home | cards / rails | `.rcard` / venue rails + رزرو کن | `.canva-venue-card` rails + live clubs API | fixed |
| m-athlete | bottom nav | خانه · رزروهای من · پروفایل + crimson top bar | `AppBottomNav` 3 tabs + active bar | fixed |
| athlete-bookings | phone chrome | `.mxtop` logo + bell + user | `CanvaAthleteChrome` + notifications slot | fixed |
| athlete-bookings | header | `تاریخچه رزروها` + 3 sum cards | same title + `.canva-history-sum` | fixed |
| athlete-bookings | filter chips | `.ofch .on` soft crimson `#f6e3e3` | was solid fill → soft crimson active | fixed |
| athlete-bookings | desk columns | list (start) + calendar sticky | was calendar-start → order list then cal | fixed |
| athlete-hub | header / menu | desk `.ph` + `.hubgrid` 2-col; mobile m1 form | crimson hub + menu (product); desk menu 2-col like hubgrid | fixed |
| athlete-wallet | balance card / history h | `.rred` + `.rh3` | `.canva-dash-hero` + crimson history title | fixed |
| athlete-home | header icons | Tabler bell + user | Material map (same job) | fixed |
| owner-calendar | slot blocked | near-black `#1a1a18` | black tokens (verify live) | open |
| owner-calendar | header avatar | square `#1d3b57` | square navy (verify) | open |
| owner-calendar | booked fill | neutral + crimson bar | neutral fill (verify bars) | open |
| coach hero | bell | `ti-bell` | Material notifications → settings | open |

## Owner secondary NAV — Prompt 2026-10-26

Screenshots: `comparisons/{owner-finance,owner-settings,owner-crm,owner-equipment,owner-discount,owner-staff,owner-support}/`. Tool: `node scripts/check-html-owner-secondary-slice.mjs`. Done gate: finance + settings HTML vs live @375 + desktop.

| screen | region | HTML | live | status |
|--------|--------|------|------|--------|
| owner-finance | period tabs | `.oftab .on` crimson underline | `.canva-finance-period-active` crimson | fixed |
| owner-finance | income hero | `.ofdark` charcoal `#2c2c2a` | `.canva-finance-hero-card` brand-navy (=charcoal) | fixed |
| owner-finance | report CTA | gray `#4a4a47` `.cxtiny` | solid `#4a4a47` (was glass) | fixed |
| owner-finance | gateway legend | `#e0a82e` | `#e0a82e` (was `#E8B84A`) | fixed |
| owner-finance | header icons | logo + bell on photo; m5 shell | logo + bell + square navy avatar | kept-product |
| owner-finance | empty chart / $0 | mock bars + amounts | live empty API states | kept-product |
| owner-settings | phone hero | m5 photo banner + `cxh` title | was crimson dash → photo hero + charcoal title | fixed |
| owner-settings | chips | `.occh` idle `#ece8e2` / on charcoal | matched | fixed |
| owner-settings | save CTA | `.cxbtn.dark` charcoal | `.canva-owner-save-cta` charcoal | fixed |
| owner-crm | stats / tabs | desk chips / ownPg list | stats + underline crimson; FAB campaign | kept-product |
| owner-equipment | rows + add | `.oeqi` beige + green `+ افزودن` | `.canva-equip-row` `#e9e6e1` + `#2e7d4f` add | fixed |
| owner-discount | add + empty | green `+ افزودن` + empty | same green add + empty list | fixed |
| owner-staff | list + CTA | solid crimson add + empty box | `OwnerWorkersPanel` crimson add | fixed |
| owner-support | cards | ops + ticket + contact | same IA; ticket thread product | kept-product |
| owner-* more | subpage header | m5 more rows → ownPg `cxh` | `CanvaSubpageHeader` back+logo | kept-product |

## kept-product (do not “fix” into mock)

| screen | region | reason |
|--------|--------|--------|
| home | header mid-nav / dual login | product AppTopBar + phone CanvaPublicChrome escape hatch |
| home | footer enamad | trust badge |
| owner-calendar | date-row FABs مسدود/رزرو/فصلی | desk ops; HTML date row is arrows-only |
| owner-finance | square navy avatar on photo hero | product account drawer; HTML m5 fin tab is logo+bell only |
| owner-finance / settings | live empty / zero amounts | product API vs HTML mock numbers |
| owner-crm / equipment / discount / staff / support | CanvaSubpageHeader back+logo | escape hatch vs HTML more-menu entry |
| * | bottom nav / back / logo | escape hatches |
| * | real club photos | product over stock |
| coach today | accept-students + revenue | product extras vs simpler HTML Today |
| athlete-home | coach discovery rail | product when coach pilot on; HTML desk rails are venues-only |
| athlete-hub | crimson hero + list vs m1 profile form | product account hub; edit fields live on `/athlete/profile` |
| athlete-bookings | empty / live booking rows | product API data vs HTML mock cards |
