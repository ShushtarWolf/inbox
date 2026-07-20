# GitHub setup checklist

One-time configuration for [ShushtarWolf/inbox](https://github.com/ShushtarWolf/inbox). Prefer a company org and private repo for production; these steps apply either way.

## Repository settings

- [ ] **Visibility:** set to **Private** for a commercial product (Settings → General → Danger zone)
- [ ] **Description:** e.g. `Sports court & coach booking — Nuxt 4 PWA (inboxs.ir)`
- [ ] **Topics:** `nuxt`, `booking`, `pwa`, `postgresql`, `prisma`, `iran`
- [ ] **Default branch:** `main`
- [ ] **Wiki:** disable if unused (Settings → General → Features)
- [ ] **Dependabot alerts:** enable (Settings → Code security → Dependabot)

## Branch protection (`main`)

Settings → Branches → Add branch protection rule (or ruleset):

- [ ] **Require a pull request before merging**
  - [ ] Require approvals: **1**
  - [ ] Dismiss stale pull request approvals when new commits are pushed
- [ ] **Require status checks to pass before merging**
  - [ ] Required check: **CI** (job `build-and-test` from `.github/workflows/ci.yml`)
- [ ] **Require branches to be up to date before merging**
- [ ] **Do not allow bypassing the above settings**
- [ ] **Restrict who can push to matching branches** (optional; org teams)
- [ ] **Allow force pushes:** off
- [ ] **Allow deletions:** off

### Verify with GitHub CLI

```bash
gh api repos/ShushtarWolf/inbox/branches/main/protection
```

A configured branch returns JSON; unprotected returns `404 Branch not protected`.

## Dependabot

This repo includes [`.github/dependabot.yml`](../.github/dependabot.yml) for weekly npm and GitHub Actions updates.

- [ ] Confirm Dependabot is enabled: Settings → Code security → Dependabot → **Dependabot security updates: Enabled**
- [ ] Review and merge Dependabot PRs weekly

## Commit identity

Use a professional email on commits (not `*.local`):

```bash
git config user.email "you@inboxs.ir"
git config user.name "Siamak Ghodsi"
```

Avoid appending `Co-authored-by: Cursor` on every commit unless you intend to show AI attribution publicly.

## Security

- [ ] Read [SECURITY.md](../SECURITY.md) — vulnerability reporting contact
- [ ] Never commit `.env` or production secrets (see `.gitignore`)
- [ ] Rotate `ADMIN_PROVISION_SECRET` if it was ever exposed

## Optional (recommended)

- [ ] Transfer repo to a company GitHub org
- [ ] Add `CODEOWNERS` for automatic review requests
- [ ] Require signed commits for `main`
- [ ] Enable secret scanning push protection (already on for this repo)
