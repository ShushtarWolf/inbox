# Competition Pilot — Risk Spec (Phase 1)

Retroactive risk register for the **IUST / Behnaz** competition pilot. Describes **what is implemented today**, not a future roadmap. Code paths are the source of truth.

Related: [COMPETITION_PILOT_GO_NO_GO.md](./COMPETITION_PILOT_GO_NO_GO.md) · [OPERATIONS.md](./OPERATIONS.md) · [shared/competition.ts](../shared/competition.ts)

---

## Phase 1 scope (in)

| Area | Implemented behavior | Primary code paths |
|------|---------------------|-------------------|
| Feature gate | Default **off**; optional single-club pilot slug | `isCompetitionsEnabled()` / `isCompetitionsVisibleForClub()` in [shared/competition.ts](../shared/competition.ts); [server/utils/competitionsGate.ts](../server/utils/competitionsGate.ts); Nuxt `runtimeConfig.public` in [nuxt.config.ts](../nuxt.config.ts); runtime sync in [server/plugins/public-runtime-env.ts](../server/plugins/public-runtime-env.ts) |
| Owner CRUD | Create DRAFT → publish OPEN; edit fields by status | [server/api/owner/competitions/index.post.ts](../server/api/owner/competitions/index.post.ts), [index.get.ts](../server/api/owner/competitions/index.get.ts), [\[id\].patch.ts](../server/api/owner/competitions/[id]/patch.ts), [\[id\].get.ts](../server/api/owner/competitions/[id]/get.ts) |
| Public discovery | List + detail for OPEN competitions in pilot scope | [server/api/competitions/index.get.ts](../server/api/competitions/index.get.ts), [\[id\].get.ts](../server/api/competitions/[id]/get.ts); pages [app/pages/competitions/](../app/pages/competitions/) |
| Athlete join | SINGLE / DOUBLE; wallet, test IPG, or pay-at-club | [server/api/competitions/[id]/join.post.ts](../server/api/competitions/[id]/join.post.ts) → `joinCompetition()` in [server/utils/competitions.ts](../server/utils/competitions.ts); checkout [server/api/payments/checkout.post.ts](../server/api/payments/checkout.post.ts) |
| Entry confirm | Payment settlement → CONFIRMED (idempotent) | `confirmEntryFromPayment()` in [server/utils/competitions.ts](../server/utils/competitions.ts); wired from [server/utils/paymentSync.ts](../server/utils/paymentSync.ts) |
| Athlete cancel | In-window refund to wallet; out-of-window 409 | [server/api/competitions/[id]/cancel-entry.post.ts](../server/api/competitions/[id]/cancel-entry.post.ts) → `cancelCompetitionEntry()`; window check `canCancelCompetitionEntry()` in [shared/competition.ts](../shared/competition.ts) |
| Owner cancel | Full competition cancel + refunds | [server/api/owner/competitions/[id]/cancel.post.ts](../server/api/owner/competitions/[id]/cancel.post.ts) → `cancelCompetition()` |
| Registration close cron | CLOSE past deadline; auto-cancel if below `minParticipants` | [server/api/admin/competitions/process-registration-close.post.ts](../server/api/admin/competitions/process-registration-close.post.ts) → `processCompetitionsPastRegistrationClose()` + `expireStalePendingEntries()` |
| Stale PENDING expiry | Unpaid PENDING > 10 min → CANCELLED | [server/api/admin/competitions/expire-pending.post.ts](../server/api/admin/competitions/expire-pending.post.ts) → `expireStalePendingEntries()`; constant `PENDING_ENTRY_EXPIRY_MINUTES` in [shared/competition.ts](../shared/competition.ts) |
| Pay-at-club desk | Owner mark-paid confirms entry | [server/api/owner/competitions/[id]/entries/[entryId]/mark-paid.post.ts](../server/api/owner/competitions/[id]/entries/[entryId]/mark-paid.post.ts) |
| Complete + prizes | Placements → wallet credit or discount code (idempotent) | [server/api/owner/competitions/[id]/placements.patch.ts](../server/api/owner/competitions/[id]/placements.patch.ts), [award-prizes.post.ts](../server/api/owner/competitions/[id]/award-prizes.post.ts) → `awardCompetitionPrizes()`; audit [server/api/admin/competitions/[id]/awards.get.ts](../server/api/admin/competitions/[id]/awards.get.ts) |
| UX trust (375px) | Fee, prize, cancel policy before join CTA | [app/pages/competitions/[id].vue](../app/pages/competitions/[id].vue); e2e [e2e/competition-detail.spec.ts](../e2e/competition-detail.spec.ts) |
| Rate limit | Join: 10/min per IP + per user | `enforceRateLimit(event, 'competitions:join')` in join handler; bucket in [server/utils/rateLimit.ts](../server/utils/rateLimit.ts) |
| Regression guard | Court booking unchanged; competitions read-only calendar overlap warning | `checkEventCalendarOverlap()` in [server/utils/competitions.ts](../server/utils/competitions.ts) — no slot rows created |

**Pilot enablement:** `COMPETITIONS_ENABLED=true` + `COMPETITIONS_PILOT_CLUB_SLUG=iust` (or target slug) + `PAYMENTS_MODE=test|pay_at_club` (not `live` until SEP verified).

---

## Out of scope (Phase 1)

| Item | Notes |
|------|--------|
| Live SEP / IPG for entry fees in production | `PAYMENTS_MODE=live` blocked for pilot; desk `pay_at_club` or wallet/test path only |
| Coach / season / package / recurring | Frozen by `PILOT_NO_COACH` and `isRecurringReserveEnabled() === false` |
| Competition waitlist | UI string exists; no waitlist join API |
| Bracket generation / live scoring | Owner records placements manually |
| Multi-club prize escrow / sponsor billing | `sponsorFunded` flag only; no sponsor wallet |
| Push / email competition alerts (default) | Optional SMS campaign on publish (`announceCompetitionToContacts`) — off unless owner passes `announce: true` |
| Public EN competition copy | FA-first; `defaultLocale: fa` |
| Automated prize dispute workflow | Manual ops runbook in GO/NO-GO §OPS-02 |
| Redis-backed rate limits | Uses in-memory buckets unless `REDIS_URL` set globally |

---

## Invariants (must always hold)

1. **Seat count:** Active seats = entries with status `PENDING` or `CONFIRMED` (`ACTIVE_ENTRY_STATUSES` in [shared/competition.ts](../shared/competition.ts)). Concurrent joins serialize via `SELECT … FOR UPDATE` on competition row (`lockCompetitionRow()`).
2. **One confirmed entry per athlete per competition:** Enforced by DB unique constraint + idempotency key `competition-entry:{competitionId}:{athleteId}`.
3. **No confirm without payment:** `isPaymentLinkedForEntryConfirm()` requires `payment.status === 'PAID'` (or zero fee). Pay-at-club stays `PENDING` until owner mark-paid.
4. **Status machines:** Illegal transitions throw — `assertCompetitionStatusTransition()` / `assertEntryStatusTransition()` in [shared/competition.ts](../shared/competition.ts).
5. **Prize payout idempotency:** `competitionPrizeIdempotencyKey()` + `creditWallet` note — second `award-prizes` skips already-credited rows.
6. **Refund idempotency:** `refundPaymentForCancellation()` used for athlete cancel and competition cancel; wallet credit once per payment.
7. **Feature gate:** When disabled or wrong pilot slug, public APIs return **404** (not 403) via `assertCompetitionsVisibleForClub()`.
8. **Free entry:** Requires `sponsorFunded: true` (`assertFreeEntryAllowed()`).

---

## Failure modes + mitigations

| ID | Failure mode | Impact | Mitigation (implemented) | Residual risk |
|----|--------------|--------|--------------------------|---------------|
| FM-01 | Two athletes join last seat concurrently | Double booking | Row lock + active count check in `joinCompetition()` transaction | Low — verified F-01 |
| FM-02 | IPG callback retried | Double charge / double confirm | Join payment idempotency key; `confirmEntryFromPayment()` idempotent; metadata fallback `resolveCompetitionEntryForPayment()` | Low — verified F-02 |
| FM-03 | Athlete cancels inside window | Wallet not credited | `refundPaymentForCancellation()` on CONFIRMED+PAID | Low — verified F-03 |
| FM-04 | Athlete cancels outside window | Unfair refund | `409 CANCELLATION_WINDOW_PASSED` → FA `competitions.errors.cancellationWindowPassed` | Ops override: owner cancel competition |
| FM-05 | Below min participants after close | Stranded entries | Cron `process-registration-close` → `cancelCompetition()` + refunds | Requires cron scheduled (OPS) |
| FM-06 | Unpaid PENDING holds seat | Ghost full capacity | `expire-pending` cron (10 min); also bundled in `process-registration-close` | Requires cron every 15 min |
| FM-07 | Owner awards prizes twice | Double wallet credit | Idempotent `awardCompetitionPrizes()` | Low — verified F-07 |
| FM-08 | Athlete hits owner APIs | Privilege escalation | `requireOwnerClub()` → 403 on owner routes | Verified S-01 |
| FM-09 | Cross-club owner awards prizes | Wrong club payout | Club scoping on owner routes → 404 | Verified S-02 |
| FM-10 | Join spam / bot | Seat exhaustion / DoS | Rate limit `competitions:join` 10/min | Verified S-03 |
| FM-11 | Live IPG misconfigured | Failed payments / stuck PENDING | Pilot uses `pay_at_club` or wallet; **do not** enable `live` | [DECISION NEEDED] live cutover criteria |
| FM-12 | IPG refund fails on cancel | Athlete charged, entry REFUNDED | `refundPending` metadata on payment; manual SEP refund per OPS-02 | Manual ops |
| FM-13 | Calendar overlap on event time | Scheduling conflict | Read-only warning on publish; owner decides | No auto-block |
| FM-14 | Doubles without partner | Invalid roster | `400 Partner required for doubles` | Verified F-08 |
| FM-15 | Feature flag left on globally | Non-pilot clubs expose competitions | `COMPETITIONS_PILOT_CLUB_SLUG` restricts list/join/publish | Misconfiguration ops error |

---

## FA policy stubs (user-facing)

Mapped in [i18n/locales/fa.json](../i18n/locales/fa.json) under `competitions.*`:

| Topic | FA key / copy | Server signal |
|-------|---------------|---------------|
| Entry fee | `competitions.feeLabel` / `freeEntry` | Detail page before CTA |
| Prizes (non-cash) | `competitions.prizeLabel`, `prizeTerms` | Wallet/discount only — not cash payout |
| Cancel window | `competitions.cancelPolicy`, `cancelPolicyBody` | Uses `club.cancellationWindowHours` |
| Cancellation denied | `competitions.errors.cancellationWindowPassed` | `409 CANCELLATION_WINDOW_PASSED` |
| Competition full | `competitions.errors.competitionFull` | `409 COMPETITION_FULL` |
| Rate limited | `competitions.errors.rateLimited` | `429 COMPETITION_JOIN_RATE_LIMITED` |
| Pay at club | `competitions.joinPayAtClub` | Entry `PENDING`, payment `PAY_AT_CLUB` |

**[DECISION NEEDED]** Formal terms-of-service paragraph for competition entry fees, prize tax reporting, and sponsor liability — not yet in `/terms` or club contract templates.

**[DECISION NEEDED]** Standard FA copy when `refundPending` (IPG refund failed) — athlete currently sees generic error paths; ops handles manually.

---

## [DECISION NEEDED] items

| ID | Question | Default / current behavior |
|----|----------|---------------------------|
| DN-01 | When to set `PAYMENTS_MODE=live` for competition entry fees? | Blocked; wallet + pay_at_club + test only |
| DN-02 | Pilot slug: `iust` vs provisioned Behnaz slug | Env `COMPETITIONS_PILOT_CLUB_SLUG` must match live club slug |
| DN-03 | Cron host: Liara dashboard vs GitHub Actions | Both documented in [OPERATIONS.md](./OPERATIONS.md); neither auto-enabled in repo deploy |
| DN-04 | Auto-block publish when calendar overlap > 0? | Warning only today |
| DN-05 | Competition waitlist for full events? | Not implemented |
| DN-06 | Maximum entry fee cap for pilot? | No server cap beyond payment provider limits |
| DN-07 | Legal ToS / refund policy page link on detail screen? | Cancel policy inline only |
| DN-08 | Notify athletes on auto-cancel below min participants? | `notifyCompetitionCancelled()` exists in [server/utils/competitionNotify.ts](../server/utils/competitionNotify.ts) — verify SMS/email config before relying on it |

---

## Verification hooks

```bash
# Unit
npm test -- shared/competition.test.ts server/utils/competitions.test.ts

# Integration (server must have COMPETITIONS_ENABLED=true)
COMPETITIONS_ENABLED=true PAYMENTS_MODE=test BASE_URL=http://localhost:3000 npm run competition:go-no-go

# UX (375px)
npm run test:e2e -- e2e/competition-detail.spec.ts

# Court booking regression
PILOT_NO_COACH=true PAYMENTS_MODE=test npm run smoke:pilot
```

Do **not** deploy or set `PAYMENTS_MODE=live` from this document.
