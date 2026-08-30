# Liara env fill sheet — Behnaz MVP (court booking)

Fill these in the **Liara dashboard** for app `inbox` (`https://inboxs.ir`) **before** you deploy/restart.  
Never commit real values. **Do not deploy from this sheet** — you run `liara deploy --app inbox` yourself after secrets are set.

Copy/paste checklist. Mark each row when set.

---

## A. Always required (DB / session / site / admin)

| ☐ | Variable | Fill with | Notes |
|---|----------|-----------|--------|
| ☐ | `DATABASE_URL` | Liara Postgres `inbox-db` connection string | From Liara DB service |
| ☐ | `NUXT_SESSION_PASSWORD` | random ≥32 chars | Not the demo fallback |
| ☐ | `NUXT_PUBLIC_SITE_URL` | `https://inboxs.ir` | Callbacks + booking links |
| ☐ | `ADMIN_PROVISION_SECRET` | long random | `/admin`, provision, status APIs (`x-admin-secret`) |
| ☐ | `SEED_ON_EMPTY` | unset / `false` | Only `true` once on empty catalog; remove after |

---

## B. Pilot flags

| ☐ | Variable | Court-only MVP | Competition + Coach go-live |
|---|----------|----------------|------------------------------|
| ☐ | `PILOT_NO_COACH` | `true` | `false` (or unset) — unlocks coach signup, `/coaches`, wallet court book |
| ☐ | `NUXT_PUBLIC_PILOT_NO_COACH` | `true` | `false` (or unset) — must match server; redeploy after change |

When coach is ON, read [COACH_V1_GO_NO_GO.md](./COACH_V1_GO_NO_GO.md). Keep packages/recurring frozen.

---

## C. SMS / OTP (Kavenegar) — athlete + owner login

| ☐ | Variable | Fill with | Notes |
|---|----------|-----------|--------|
| ☐ | `SMS_ENABLED` | `true` | Required for live sends |
| ☐ | `SMS_PROVIDER` | `kavenegar` (or `live`) | Both resolve to Kavenegar |
| ☐ | `KAVENEGAR_API_KEY` | from Kavenegar panel | Never commit |
| ☐ | `KAVENEGAR_TEMPLATE` | `inbox-verify-autofill` | OTP + password-reset. Panel body: `code: %token%` / `کد تایید اینباکس` / `@inboxs.ir #%token2%` |
| ☐ | `KAVENEGAR_TEMPLATE_NOTIFY` | `inbox-notify` (default if unset) | **Required for booking paid/cancel/CRM SMS.** Panel template body must be exactly `%token10%`. Free-text `sms/send` fails on service lines (`ارسال کننده نامعتبر است`). |
| ☐ | `KAVENEGAR_TEMPLATE_PAY_LINK` | e.g. `inbox-pay` | **Optional.** Panel body must include `https://inboxs.ir/p/%token%` so desk “ارسال لینک پرداخت” SMS is tappable. Without it, the owner still gets a copy/WhatsApp URL and the athlete gets a pay pin. |
| ☐ | `KAVENEGAR_SENDER` | approved line | Fallback only for free-text; OTP without template. Lookup uses the line attached to the template. |
| ☐ | `ADMIN_ALERT_PHONE` | `09124777927` (default) | Platform admin SMS for every booking / payment / cancel / cashout / club application. Set `ADMIN_ALERT_SMS=false` to disable. |

Until C is complete, OTP stays **log/dry-run** (`debugCode`) — not production-safe.

**Confirm after restart:**

```bash
# Local shell that has the same env as Liara (or against a checked-out .env mirror):
npm run sms:status
# Expect: resolvedProvider / smsMode → "live" (not "log")

# Against prod (after secrets + your deploy):
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/sms-status
# UI: https://inboxs.ir/admin/sms
```

---

## D. Payments — pick ONE path for launch

### D1. Desk fallback (OK for MVP without SEP)

| ☐ | Variable | Fill with | Notes |
|---|----------|-----------|--------|
| ☐ | `PAYMENTS_MODE` | `pay_at_club` | Hides online Pay CTA; walk-ins + owner mark-paid OK |
| ☐ | `PAYMENT_PROVIDER` | leave unset | Ignored in desk mode |
| ☐ | `SEP_TERMINAL_ID` | leave unset | Not needed |

### D2. Online IPG later (SEP / سامان)

| ☐ | Variable | Fill with | Notes |
|---|----------|-----------|--------|
| ☐ | `PAYMENTS_MODE` | `test` **first** | Then `live` **only** after SEP terminal verified |
| ☐ | `PAYMENT_PROVIDER` | omit or `sep` | Default `sep` when mode is `test`/`live` |
| ☐ | `SEP_TERMINAL_ID` | numeric terminal from SEP panel | Never commit; required for real SEP |
| ☐ | SEP callback (panel) | `https://inboxs.ir/payments/callback/sep` | Must match `NUXT_PUBLIC_SITE_URL` |

### Cutover rule (hard)

- **Do not** set `PAYMENTS_MODE=live` until the SEP terminal is active and [PAYMENTS.md](./PAYMENTS.md) manual verify passes.
- **`pay_at_club` is an OK MVP fallback** — launch without online IPG is fine.
- Optional mirror: `NUXT_PUBLIC_PAYMENTS_MODE` (runtime also syncs from `PAYMENTS_MODE`).

**Confirm after restart:**

```bash
npm run payments:status
# Expect paymentsMode: pay_at_club | test | live (never claim live without hasSepTerminalId: true)

curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/payments-status
```

---

## E. Keep unset for this MVP

| Leave unset | Why |
|-------------|-----|
| `NUXT_OAUTH_GOOGLE_*` | Google UI hard-off |
| Live SMTP / `S3_*` / `SENTRY_DSN` | Optional polish — not court-book blockers |
| `AUTH_OTP_BYPASS_PHONES` / `ALLOW_OTP_BYPASS` | Removed — never set; all logins need real SMS OTP |

---

## F. Competition pilot (optional add-on — off by default)

| ☐ | Variable | Fill with | Notes |
|---|----------|-----------|--------|
| ☐ | `COMPETITIONS_ENABLED` | unset / `false` | **Default off.** Set `true` only when enabling IUST competition pilot |
| ☐ | `COMPETITIONS_PILOT_CLUB_SLUG` | `iust-tennis` | Must match live club slug (`PILOT_CLUB_SLUG` in `shared/pilotClub.ts`). When set with enabled: only this club’s competitions are listed; other clubs cannot publish OPEN. Legacy `iust` / `بهناز` still normalize to `iust-tennis` with a warning — prefer the canonical value |
| ☐ | `NUXT_PUBLIC_COMPETITIONS_ENABLED` | optional mirror | Belt-and-suspenders for client pages / nav |
| ☐ | `NUXT_PUBLIC_COMPETITIONS_PILOT_CLUB_SLUG` | optional mirror | Same as `COMPETITIONS_PILOT_CLUB_SLUG` for client |

**Pilot enable (IUST — canonical slug):**

```bash
COMPETITIONS_ENABLED=true
COMPETITIONS_PILOT_CLUB_SLUG=iust-tennis
```

**Verify after restart:**

```bash
# Disabled globally → empty list
curl -s https://inboxs.ir/api/competitions | jq length   # expect 0 when unset

# Enabled pilot → only iust-tennis slug in list
curl -s https://inboxs.ir/api/competitions | jq '[.[].club.slug] | unique'
```

Detail: [COMPETITION_PILOT_GO_NO_GO.md](./COMPETITION_PILOT_GO_NO_GO.md).

---

## F2. Class packages (optional — off by default)

Independent of desk season/package recurring (`isRecurringReserveEnabled` stays false).

| ☐ | Variable | Fill with | Notes |
|---|----------|-----------|--------|
| ☐ | `PACKAGES_ENABLED` | unset / `false` | **Default off.** Set `true` to unlock owner + coach class-package create/publish |
| ☐ | `NUXT_PUBLIC_PACKAGES_ENABLED` | optional mirror | Client nav / `/owner/packages` / `/coach/packages` |

```bash
PACKAGES_ENABLED=true
NUXT_PUBLIC_PACKAGES_ENABLED=true
```

Requires DB migration `20260829173000_class_packages_safety`. Cron: `POST /api/admin/packages/expire-pending` with admin secret (also best-effort in `.github/workflows/competition-cron.yml`) clears unpaid online PENDING seats (~10 min).

---

## G. After env is filled (you deploy — not the agent)

1. `liara deploy --app inbox` (your step).
2. Confirm SMS: `sms:status` / `/api/admin/sms-status` → live.
3. Confirm payments: `payments:status` / `/api/admin/payments-status` → expected mode.
4. Provision Behnaz club — see [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) §2 (owner **phone** required for OTP).
5. Walk the live QA matrix in the launch checklist.

Full ops: [OPERATIONS.md](./OPERATIONS.md). Payments detail: [PAYMENTS.md](./PAYMENTS.md).
