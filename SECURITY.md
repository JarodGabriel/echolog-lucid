# Security Policy

## Supported Use

Echolog Lucid is currently designed as a self-hosted personal PWA. Each deployment should be controlled by the person or organization whose meeting notes are being accessed.

It is not yet a multi-tenant SaaS. Do not run one shared public instance for unrelated users unless you first add proper per-user accounts, token storage, database isolation, admin controls, and abuse monitoring.

## Secrets

Never commit:

- `.env.local`
- `APP_SECRET`
- `APP_PASSWORD`
- `FATHOM_API_KEY`
- Vercel project metadata or tokens

`APP_SECRET` and `APP_PASSWORD` are required in production. The app should fail closed if either is missing.

## Dependency Hygiene

Use:

```bash
npm ci
npm audit
```

Avoid replacing pinned versions with `latest`. When upgrading dependencies, update intentionally, review the diff, run `npm audit`, and run the app checks before deploying.

## Reporting Issues

Open a GitHub issue with the affected version, reproduction steps, and whether the issue can expose meeting data, API keys, OAuth tokens, or app sessions. Do not include secrets or private meeting content in the report.
