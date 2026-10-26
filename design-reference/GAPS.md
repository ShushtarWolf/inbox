# HTML fidelity — honest gap list (2026-10-27, v2)

Scope: **visuals only** (CSS / layout / tokens / icons). Persian copy, photos, field order and product flow must equal live inboxs.ir.
PDF: `design-reference/Inboxs-HTML-fidelity-3col-2026-10-27-v2.pdf` (BRANCH | SoT HTML | LIVE). Capture log: `comparisons/shots.log`.

## Reverted to main/live (non-visual changes removed)
- Branch merged with `origin/main` (branch was based on an old main; that alone caused many "differences" vs live).
- Home: search order back to live (CTA · date · city · sport), no added search icon; ribbon back to live **«۲۰٪»** (full text only in aria-label, as live).
- AuthFlowModal: = main (accent bar only when no photo header).
- CourtBookingConfirmSheet: = main markup.
- Font `?v=2` / PWA bump dropped (main already ships the waving_hand glyph).
- Kept: class-only changes (legal/contact/forgot/reset/404/offline/owner/athlete wrappers, hero-controls/dots, rail section) + main.css. No `t()` key or text changed.

## Capture pipeline (scripts/fidelity-shots.mjs, fidelity-check.py, fidelity-pdf.py)
- Full-page height (lazy images scrolled), capped 6000px. Blank/flat/tiny shots rejected & deleted.
- Redirected routes are not saved (logged `ENV`). SoT has a 375 layout only for `m-*` pages → no html-375 elsewhere (labelled NO-SOT).
- PDF: white page, tops aligned, no gray filler; missing column = red labelled box with reason; tall shots split across pages.

## Open gaps (honest)
1. **Data, not branch content**: branch shots use the local seed DB (4 demo clubs, demo photos/names); live has real data (1–2 clubs). Pilot ribbon not visible on branch because seed clubs aren't the pilot club. Card counts/photos therefore differ — not a code change.
2. **Visual diffs vs SoT still open** on: home (hero height, rails, coach section exists only in SoT), clubs, club detail, legal pages (type scale/spacing), contact, forgot/reset (SoT authbox vs product auth sheet), 404/offline, athlete hub pages, owner calendar/finance/settings/crm/staff. Not claimed fixed.
3. **No live column** for athlete/owner/m-athlete: live redirects anonymous users to `/`; we do not log into production.
4. **Product flow ≠ SoT pages**: login/register/choose-role/clubs-apply are modals/guards in the product (redirect → `/` or `/login`); SoT shows them as pages. Only SoT column exists.
5. **Env-skipped**: confirm, pay-link (would need writes), admin (no seed), coach / coach-pending (PILOT_NO_COACH).
6. Competitions: SoT is short (508px) vs product page — layout differs.
