# Undeployed changes

Waiting for next Liara deploy (`inbox` / inboxs.ir).  
**Reason (2026-08-16):** daily deployment limit hit / upload failed — do not retry until quota resets.

**Last live deploy:** `7d4248c` (post-deploy dump `backups/inbox-db-20260816-190205.dump`)  
**Current `main`:** pushed past `7d4248c` — not deployed (Liara daily limit)

## Commits after last deploy

| Time | Commit | Change |
|------|--------|--------|
| 19:06 | `726e5e7` | Athlete wallet top-up: red notice that payouts only return to the payer (no other bank accounts) |
| 19:09 | `4036260` | Club owner finance/settings: red notice that cashouts only go to the owner bank account |
| 19:21 | `2616985` | Include club close time (e.g. 24:00) in pricing end-time selects |

Also on `main`: this tracker file (`docs/UNDEPLOYED.md`).

## Next deploy

```bash
liara deploy --app inbox
# then mandatory local DB backup per post-deploy-local-backup rule
```

Clear this file (or reset to “none”) after a successful deploy through HEAD.
