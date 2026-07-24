# Behnaz MVP go-live — court booking (FA)

Short checklist for **single-club court booking** under the current UI (Canva later).  
Production: **Liara** app `inbox` → `https://inboxs.ir`. **You deploy manually** after filling secrets — do not rely on agent auto-deploy for this cutover.

Out of scope for this launch: coach product, matchmaking, Google OAuth, season/package products, new CRM features, EN UI.

---

## 1. Liara env (set before deploy / restart)

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

### Online IPG (SEP / سامان) — required if online pay is in launch

| Variable | Value |
|----------|--------|
| `PAYMENTS_MODE` | `test` first (or `live` only after verify) — synced to client Pay CTA at runtime |
| `PAYMENT_PROVIDER` | omit (defaults `sep`) or `sep` |
| `SEP_TERMINAL_ID` | numeric terminal from SEP merchant panel |
| Callback | `https://inboxs.ir/payments/callback/sep` |

Local without terminal: `PAYMENTS_MODE=test` → `/payments/test-gateway`.  
Desk fallback: `PAYMENTS_MODE=pay_at_club` hides online CTA (walk-ins OK).

### Keep unset for MVP

- `NUXT_OAUTH_GOOGLE_*` — Google UI is hard-off; leave unset
- Live SMTP / S3 / Sentry — optional polish, not court-book blockers

Details: [OPERATIONS.md](./OPERATIONS.md) (SMS), [PAYMENTS.md](./PAYMENTS.md) (IPG).

---

## 2. What to provision

1. Deploy the commit that includes MVP gates (you run `liara deploy --app inbox` yourself).
2. Confirm `/admin` (or `GET /api/admin/sms-status` with `x-admin-secret`) → SMS `live` after Kavenegar cutover.
3. Provision **Behnaz** club via `/admin/provision` (secret header) if not already present: courts, hours, pricing, owner phone on User/Club.
4. Owner phone must be a real IR mobile that can receive OTP.
5. Toggle waitlist in owner **Settings** (`waitlistEnabled`) — on or off is fine; just decide and test that path.

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
| 3 | Book court → online pay → `PAID` → SMS confirm | `PAYMENTS_MODE=test` → test-gateway OK → `PAID`; SMS skipped/logged | Live SEP + live SMS confirm |
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
```

Prefer `smoke:pilot` over broad `npm run smoke` on wiped pilot prod.

---

## 5. Security / integrity (already in code)

- [x] Phone OTP primary; athlete email register → `410`
- [x] Google OAuth UI off; `/auth/google` fail-closed when unset
- [x] Court slot integrity + recurring season/package reserve disabled
- [x] Soft-fail transactional SMS (booking never 500s on SMS failure)
- [x] Session secret enforced in production

---

## 6. Post-cutover (ops)

- [ ] You deploy to Liara after secrets are filled
- [ ] Re-run section 4 live column on `https://inboxs.ir`
- [ ] Monitor Liara logs for Kavenegar / SEP errors
- [ ] Optional later: Sentry, S3 uploads, SMTP, Enamad

Historical / full ops notes remain in [OPERATIONS.md](./OPERATIONS.md). Older long checklist items (S3, email, Enamad) are deferred unless needed for this court launch.
