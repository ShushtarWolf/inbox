# Security Policy

## Supported versions

Security fixes are applied to the current production deployment at [https://inboxs.ir](https://inboxs.ir) (`main` branch).

| Version | Supported |
| ------- | --------- |
| Latest `main` | Yes |
| Older commits | No |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately to:

**Email:** [security@inboxs.ir](mailto:security@inboxs.ir)

If email is unavailable, use [info@inboxs.ir](mailto:info@inboxs.ir) with subject `Security — inbox`.

Include:

- Description of the issue and potential impact
- Steps to reproduce (URLs, requests, roles involved)
- Any proof-of-concept you are comfortable sharing

We aim to acknowledge reports within **3 business days** and will keep you updated on remediation.

## Scope

In scope:

- Authentication, authorization, and session handling on inboxs.ir
- Admin APIs (`/api/admin/*`) and provisioning flows
- Booking, payment, SMS, and upload endpoints
- Data exposure between clubs, users, or roles (IDOR)

Out of scope:

- Social engineering or physical attacks
- Denial-of-service against third-party providers (Liara, Kavenegar, etc.)
- Issues in dependencies already covered by an open Dependabot PR

## Safe harbor

We appreciate good-faith research. Do not access, modify, or delete data that is not yours. Stop testing once you have confirmed a vulnerability and contact us.

## Production secrets

Never commit `.env`, API keys, `ADMIN_PROVISION_SECRET`, or production credentials. Use `.env.example` as a template only.
