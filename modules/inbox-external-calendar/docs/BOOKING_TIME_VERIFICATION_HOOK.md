# Booking-time external verification hook (calendar module)

## Invariant

At booking time, Inbox must not treat uncertain external observations as busy:

- `UNKNOWN` / `STALE` / `CONFLICT` / `PARTIAL` / mapping failure / adapter error → **treat as AVAILABLE** (do not block)
- Only confirmed **`EXTERNAL_BUSY`** after cross-source reconcile may inform a hard block or athlete yellow (“suspected”)

## Scope note

`server/api/bookings/**` (including `court.post.ts`) is **OUT OF SCOPE** for Phase 2 calendar reliability.

This document only describes the intended hook surface inside the calendar module so a later booking-phase PR can call into it without re-deriving occupancy rules.

## Suggested call site (future)

When implementing booking-time verification:

1. Resolve club mapping + court session grid for the requested date.
2. Call `fetchExternalOccupancy` from `modules/inbox-external-calendar/runtime/server/lib/adapters`.
3. Use the returned **reconciled** `occupied` list (already `EXTERNAL_BUSY` only).
4. Optionally inspect `adapters[].completeness` / `health` for operator diagnostics — never promote uncertainty to busy.
5. Do **not** fall back to durable `ExternalOccupancySnapshot` rows for a blocking decision (STALE → available).

## Helper entry points (calendar module)

| Helper | Role |
|--------|------|
| `fetchExternalOccupancy` | Live adapters + `reconcileConfirmedBusy` |
| `reconcileSourceVerdicts` / `reconcileConfirmedBusy` | Cross-source availability-first merge |
| `displayBlocksExternal` | `true` only for `EXTERNAL_BUSY` |
| `persistAndMergeExternalOccupancy` | Persist diagnostics; **display** path excludes stale |

## Non-goals

- No Prisma schema / migration changes in Phase 2
- No changes to payment, auth, or booking API handlers in this phase
