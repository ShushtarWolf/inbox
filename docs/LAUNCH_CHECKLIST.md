# Behnaz MVP go-live — court booking (FA)

Short checklist for **single-club court booking** under the current UI (Canva later).  
Production: **Liara** app `inbox` → `https://inboxs.ir`. **You deploy manually** after filling secrets — do not rely on agent auto-deploy for this cutover.

**Liara secrets fill sheet (copy/paste):** [LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md)

Out of scope for this launch: coach product, matchmaking, Google OAuth, season/package products, new CRM features, EN UI.

### Freeze — keep OFF (do not re-enable)

| Surface | How it stays off |
|---------|------------------|
| Coach product | `PILOT_NO_COACH=true` + middleware `/coaches`, `/book/coach`, `/owner/coaches`, `/register/coach` |
| Season / package reserve | `isRecurringReserveEnabled() === false` → API `403`; calendar openers gated |
| Google OAuth | `/auth/google` 404; UI hard-off (`googleAuthEnabled: false`) |
| EN product UI | `defaultLocale: fa` + `/en` redirect |
| Zarinpal | Not in provider registry for checkout |

---

## 1. Liara env (set before deploy / restart)

Use the fill sheet above. Summary:

### Always required

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Liara Postgres `inbox-db` |
| `NUXT_SESSION_PASSWORD` | 32+ chars (not demo fallback) |
| `NUXT_PUBLIC_SITE_URL` | `https://inboxs.ir` |
| `ADMIN_PROVISION_SECRET` | long random (provision + admin APIs) |
| `SEED_ON_EMPTY` | unset / `false` after first catalog seed |

### Pilot (coach off)

| Variable | Value | Notes |
|----------|--------|--------|
| `PILOT_NO_COACH` | `true` | Server APIs + sitemap; also synced to client at runtime |
| `NUXT_PUBLIC_PILOT_NO_COACH` | `true` | Optional belt-and-suspenders for client nav |

### SMS / OTP (Kavenegar) — required for real athlete + owner login

| Variable | Value |
|----------|--------|
| `SMS_ENABLED` | `true` |
| `SMS_PROVIDER` | `kavenegar` (or `live`) |
| `KAVENEGAR_API_KEY` | from panel |
| `KAVENEGAR_TEMPLATE` | panel Verify Lookup (e.g. `inbox-verify` with `%token%`) — **preferred for OTP** |
| `KAVENEGAR_SENDER` | approved line — **required** for free-text booking/CRM SMS (and OTP without template) |

Until these are set, OTP stays log/dry-run (`debugCode`) — **not** production-safe.

Confirm: `npm run sms:status` or `GET /api/admin/sms-status` → `resolvedProvider` / `smsMode` **live** (not log). UI: `/admin/sms`.

### Online IPG (SEP / سامان) — optional; desk fallback OK

| Variable | Value |
|----------|--------|
| `PAYMENTS_MODE` | **`pay_at_club`** (OK MVP fallback) **or** `test` first — synced to client Pay CTA at runtime |
| `PAYMENT_PROVIDER` | omit (defaults `sep`) or `sep` when using online mode |
| `SEP_TERMINAL_ID` | numeric terminal from SEP merchant panel (only when using SEP) |
| Callback | `https://inboxs.ir/payments/callback/sep` |

**Hard rule:** Do **not** set `PAYMENTS_MODE=live` until the SEP terminal is verified ([PAYMENTS.md](./PAYMENTS.md)).  
**`pay_at_club` is an OK launch fallback** — hides online CTA; walk-ins + owner mark-paid work.

Local without terminal: `PAYMENTS_MODE=test` → `/payments/test-gateway`.

Confirm: `npm run payments:status` or `GET /api/admin/payments-status` → expected `paymentsMode` / `hasSepTerminalId` (never prints terminal id).

### Keep unset for MVP

- `NUXT_OAUTH_GOOGLE_*` — Google UI is hard-off; leave unset
- Live SMTP / S3 / Sentry — optional polish, not court-book blockers

Details: [OPERATIONS.md](./OPERATIONS.md) (SMS), [PAYMENTS.md](./PAYMENTS.md) (IPG).

---

## 2. Provision Behnaz club (exact steps)

Owner **phone is required** for production OTP login (email/temp password is desk fallback only).

### Prerequisites

1. You deployed the MVP-gated commit to Liara (`liara deploy --app inbox`) after filling §1 / the fill sheet.
2. Confirm SMS: `/admin/sms` or `GET /api/admin/sms-status` with `x-admin-secret` → `smsMode` / `resolvedProvider` **live** after Kavenegar cutover.
3. Confirm payments mode: `GET /api/admin/payments-status` → `pay_at_club` or `test` (not `live` until SEP verified).

### Via UI (preferred)

1. Open `https://inboxs.ir/admin` → enter `ADMIN_PROVISION_SECRET`.
2. Go to **`/admin/provision`**.
3. Fill:
   - **Owner email** — unique login email (desk fallback)
   - **Name** — owner display name
   - **Owner phone** — real IR mobile (`09…`) that can receive OTP (**required** for owner SMS login)
   - **Club name** — e.g. باشگاه بهناز / دانشگاه علم و صنعت (pilot naming creates courts + hours 8–22 + pricing)
4. Submit → copy the **temporary password** from the success panel (shown once; not the admin secret).
5. Owner logs in at `/login` with **phone OTP** (primary). Optional: email + temp password as desk fallback → `/owner`.
6. Optional `/owner/setup` for profile/hours/courts; toggle waitlist in owner **Settings** (`waitlistEnabled`).
7. Confirm `/clubs` lists the club; pilot checklist on `/admin` shows bookable (ACTIVE, courts, hours, pricing).

### Via API (same fields)

```bash
curl -X POST https://inboxs.ir/api/admin/provision \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{
    "type": "CLUB_ADMIN",
    "email": "owner@club.ir",
    "name": "مدیر مجموعه",
    "phone": "0912xxxxxxx",
    "clubName": "باشگاه بهناز",
    "locale": "fa"
  }'
```

`phone` is written on both `User.phone` and `Club.phone` so OTP login resolves the owner.

### If club already exists

Skip provision; ensure owner `User.phone` (or `Club.phone`) is a real IR mobile. Patch via `/admin/users` if needed.

---

## 3. What owner may / may not click

| May | Must not / ignored |
|-----|---------------------|
| Calendar: desk reserve, cancel, mark paid (cash), block slots | Season / package reserve (hidden + API `403`) |
| Finance, equipments, settings, support | **Coaches** nav (hidden when pilot); `/owner/coaches` redirects |
| CRM page (open-safe; campaigns optional — not required for launch) | **Packages** nav (hidden); `/owner/packages` shows “not available” |
| Waitlist on/off in settings | Building new CRM automations / coach invites |
| Workers (if OWNER) | Google login, coach register, EN locale |

Athletes: phone OTP register/login → book court → pay online (if mode ≠ `pay_at_club`) → cancel.

---

## 4. MVP manual QA matrix (FA only)

Run locally in log/test mode where noted. **After you deploy to Liara with secrets**, re-run the live rows.

| # | Check | Local (log / test) | Liara (after your deploy) |
|---|--------|--------------------|---------------------------|
| 1 | Owner SMS login | Log mode: OTP `debugCode` → `/owner` | Live OTP SMS → `/owner` |
| 2 | Athlete SMS register/login | Log OTP → `/athlete` | Live OTP → `/athlete` |
| 3 | Book court → online pay → `PAID` → SMS confirm | `PAYMENTS_MODE=test` → test-gateway OK → `PAID`; SMS skipped/logged | Live SEP only if mode=`live`; else desk/`test` |
| 4 | Cancel → SMS + slot `FREE` | Cancel API frees slot; SMS skip/log | Live cancel SMS; slot free on calendar |
| 5 | Waitlist OK or off | Join when enabled; 404 when off | Same on prod club setting |
| 6 | Season/package hidden | No packages nav; `/owner/packages` stub; season/package APIs `403` | Same |
| 7 | `/coaches` redirected/hidden | With `PILOT_NO_COACH` → `/clubs` | Same |
| 8 | Legal/contact load | `/contact` `/privacy` `/terms` 200 | Same on `inboxs.ir` |
| 9 | No Google OAuth UI | `/login` has no Google button | Same |

Automated helpers (not a substitute for the matrix):

```bash
# Local / staging with ADMIN_PROVISION_SECRET
npm run smoke:pilot

# FA route shell checks (prod skips *@inbox.local)
BASE_URL=https://inboxs.ir npm run qa:matrix

# Status (never print secrets)
npm run sms:status
npm run payments:status
```

Prefer `smoke:pilot` over broad `npm run smoke` on wiped pilot prod.

---

## 4b. How to run before / after Liara

### Before deploy (local, log SMS + test IPG)

1. Server up with `PAYMENTS_MODE=test` **or** `pay_at_club`, `SMS_PROVIDER=log` (or `SMS_ENABLED` off / log), `ADMIN_PROVISION_SECRET` set.
2. For coach freeze coverage: `PILOT_NO_COACH=true` (and optional `NUXT_PUBLIC_PILOT_NO_COACH=true`), then restart.
3. Run:

```bash
npm run smoke:pilot
BASE_URL=http://localhost:3000 npm run qa:matrix
BASE_URL=http://localhost:3000 npm run smoke:pages
npm run sms:status
npm run payments:status
```

`smoke:pilot` covers owner OTP login, desk reserve/pay/cancel, athlete book→pay(test)→cancel, season/package `403`, package soft-land, legal/public FA shells, and coach redirects when the pilot flag is on.

### After you deploy to Liara (secrets filled — you deploy, not the agent)

1. Confirm SMS live: `GET /api/admin/sms-status` with `x-admin-secret` → `resolvedProvider` / `smsMode` live.
2. Confirm payments: `GET /api/admin/payments-status` → `pay_at_club` or `test` until SEP verified; **do not** use `live` until then.
3. Re-check shells against prod:

```bash
BASE_URL=https://inboxs.ir npm run qa:matrix
```

4. Walk the **live column** of the matrix in section 4 (real OTP SMS; live SEP only if enabled; cancel SMS).
5. Optional provision smoke against prod only if `ADMIN_PROVISION_SECRET` is available and you accept creating a throwaway club:

```bash
BASE_URL=https://inboxs.ir npm run smoke:pilot
```

Do **not** treat green local smoke as a substitute for live OTP / live SEP on `inboxs.ir`.

## 5. Security / integrity (already in code)

- [x] Phone OTP primary; athlete email register → `410`
- [x] Google OAuth UI off; `/auth/google` fail-closed when unset
- [x] Court slot integrity + recurring season/package reserve disabled
- [x] Soft-fail transactional SMS (booking never 500s on SMS failure)
- [x] Session secret enforced in production

---

## 6. Post-cutover (ops)

- [ ] You deploy to Liara after secrets are filled ([LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md))
- [ ] Re-run section 4 live column on `https://inboxs.ir`
- [ ] Monitor Liara logs for Kavenegar / SEP errors
- [ ] Optional later: Sentry, S3 uploads, SMTP, Enamad

Historical / full ops notes remain in [OPERATIONS.md](./OPERATIONS.md). Older long checklist items (S3, email, Enamad) are deferred unless needed for this court launch.
