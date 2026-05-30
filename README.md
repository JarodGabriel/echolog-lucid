# Echolog Lucid

Echolog Lucid is a phone-first PWA for recent meeting notes from Granola and Fathom. It is meant to be self-hosted so each person controls their own keys, meeting data, and deployment.

This is not an official Granola or Fathom app.

## What It Does

- Shows recent Granola notes and Fathom meetings in one mobile feed.
- Opens meeting details with people, notes, summaries, transcripts, and recording links when available.
- Searches meeting titles, people, notes, action items, and fetched transcript text.
- Highlights matching transcript words inside meeting details.
- Installs on Android through Chrome as a PWA.

## Android Install

1. Deploy the app to a HTTPS host such as Vercel.
2. Open the deployed URL in Chrome on Android.
3. Tap the Chrome menu.
4. Tap `Add to Home screen` or `Install app`.

## Requirements

- Node.js `24.x`.
- npm `11.11.0` or compatible.
- A Granola account that can authorize the Granola MCP OAuth flow.
- A Fathom API key if you want Fathom meetings and transcripts.

## Local Setup

Install exact locked dependencies:

```bash
npm ci
```

Create local env values:

```bash
cp .env.example .env.local
```

Set:

- `APP_SECRET`: long random value used to sign and encrypt cookies. Required in production.
- `APP_PASSWORD`: private login password for the app. Required in production.
- `FATHOM_API_KEY`: Fathom API key. Leave empty if you only want Granola.
- `NEXT_PUBLIC_APP_URL`: deployed app URL, used as the stable Granola OAuth redirect base.
- `MEETING_LOOKBACK_DAYS`: how many recent days to fetch. Defaults to `14`.

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploying

Vercel works well for this app:

1. Create a Vercel project from this repository.
2. Add the environment variables from `.env.example`.
3. Deploy.
4. Open the app and connect Granola.

Use `NEXT_PUBLIC_APP_URL` for the production URL after the domain is known. This keeps Granola OAuth redirects stable.

## Security Notes

- Do not commit `.env.local` or API keys.
- Use `npm ci`, not `npm install`, for repeatable installs from `package-lock.json`.
- Core dependencies are pinned to exact versions rather than `latest`.
- Production fails closed if `APP_PASSWORD` or `APP_SECRET` is missing.
- This app stores Granola OAuth tokens in encrypted HTTP-only cookies using `APP_SECRET`.

## Checks

```bash
npm run typecheck
npm run build
npm audit
```
