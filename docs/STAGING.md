# Staging (team test space)

Shared Liara environment so the team can verify updates **before** production `inbox` / `https://inboxs.ir`.

| | Production | Staging |
|--|------------|---------|
| App | `inbox` | `inbox-staging` |
| URL | `https://inboxs.ir` | `https://inbox-staging.liara.run` |
| Database | `inbox-db` | `inbox-staging-db` |
| Network | (prod) | `inbox-staging-net` |
| Deploy workflow | `deploy.yml` | `deploy-staging.yml` |

Staging uses its **own** Postgres. Never point staging `DATABASE_URL` at `inbox-db`.

## One-time bootstrap

Requires repo secret `LIARA_API_TOKEN` (same as prod CD).

```bash
gh workflow run bootstrap-staging.yml --ref main
gh run watch "$(gh run list --workflow=bootstrap-staging.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

If Liara’s API does not return the DB password, open [console.liara.ir](https://console.liara.ir) → database `inbox-staging-db` → copy the **private network** URI, then re-run:

```bash
gh workflow run bootstrap-staging.yml --ref main -f database_url='postgresql://…'
```

Safe defaults set by bootstrap: `SMS_PROVIDER=log`, `PAYMENTS_MODE=pay_at_club`, `SEED_ON_EMPTY=true`, `ALLOW_DEMO_AUTH=true`, `SENTRY_ENVIRONMENT=staging`.

## Deploy updates to staging

```bash
gh workflow run deploy-staging.yml --ref main
gh run watch "$(gh run list --workflow=deploy-staging.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

Or Actions tab → **Deploy staging** → Run workflow.

After green **Verify live inbox-staging.liara.run**, share `https://inbox-staging.liara.run` with the team.

## Promote to production

Only after staging looks good, run **Deploy to Liara** (`deploy.yml`) as usual. Staging deploy does **not** deploy production.

## Admin / OTP on staging

- Read `ADMIN_PROVISION_SECRET` from the Liara dashboard for app `inbox-staging` (used as `x-admin-secret`).
- OTP stays dry-run (`SMS_PROVIDER=log`) unless you intentionally wire Kavenegar for staging.
