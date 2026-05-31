# Echolog Lucid

Echolog Lucid is a phone-first Android-friendly PWA for recent meeting notes from Granola ai and Fathom ai notetaker. It is meant to be self-hosted so each person controls their own keys, meeting data, and deployment.

This is not an official Granola or Fathom app. This is just a project that was made because of a probelm I was having for awhile. 

Users should deploy their own fork or copy of the repository and add their own Granola and Fathom credentials. Other users deployments do not use your accounts, keys, logs, or meeting data.

## Why This Exists

Granola and Fathom have strong desktop experiences, but that gap is missing for Android users like myself who still end up stuck going back to a laptop just to review notes from an earlier meeting.

Echolog Lucid is a practical bridge I built for this gap. If you already use Granola or Fathom for meetings, this app gives you a pocket-friendly way to pull up synced notes, summaries, transcripts, people, and recording links after you leave your desk.

The goal is simple: finish work, walk away from the laptop, and still know your meeting memory is available on your phone for easy and quick access.

## What This Is Not

Echolog Lucid is not trying to match everything that Granola or Fathom may potentially do with their own apps.

Echolog Lucid only works with your own Granola and Fathom accounts and shows the meeting data those services make available to you.

Think of it as a lightweight review layer for notes and recordings you already have, not a full clone of either product.

## What It Does

- Shows recent Granola notes and Fathom meetings in one mobile feed.
- Opens meeting details with people, notes, summaries, transcripts, and recording links when available.
- Searches meeting titles, people, notes, action items, and fetched transcript text.
- Highlights matching transcript words inside meeting details.
- Installs on Android or IOS devices through any browser that supports PWA installation.

## Install

1. Deploy the app to a HTTPS host.
2. Open the deployed URL in a PWA-capable Android browser.
3. Open the browser menu.
4. Tap `Add to Home screen`, `Install app`, or the browser's equivalent install option.

Chrome is usually the smoothest for an install path, but it is not required. Edge, Brave, Samsung Internet, and other Chromium-based browsers may also work if they support installing PWAs.

## Requirements

- Node.js `24.x`.
- npm `11.11.0` or compatible.
- A Granola account that can authorize the Granola MCP OAuth flow.
- A Fathom API key if you want Fathom meetings and transcripts.

## Local Setup

Local setup is the same no matter where you plan to deploy later. This is a Next.js app, so you can develop and test it locally before hosting it on Vercel, another managed host, or your own server.

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
- `ENABLE_GRANOLA`: set to `false` to hide Granola and skip its server routes.
- `ENABLE_FATHOM`: set to `false` to hide Fathom and skip its API calls.
- `FATHOM_API_KEY`: Fathom API key. Leave empty if you only want Granola.
- `NEXT_PUBLIC_APP_URL`: deployed app URL, used as the stable Granola OAuth redirect base.
- `MEETING_LOOKBACK_DAYS`: how many recent days to fetch. Defaults to `14`.

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Connector Modes

Both connectors are enabled by default.

For a Fathom-only deployment:

```env
ENABLE_GRANOLA="false"
ENABLE_FATHOM="true"
```

For a Granola-only deployment:

```env
ENABLE_GRANOLA="true"
ENABLE_FATHOM="false"
```

Disabled connectors are hidden from the app UI and skipped by server routes. This is useful if someone forks or copies the repo and only wants Fathom, or if they already use Granola's first-party iOS app but still want a self-hosted Fathom notes PWA.

If `ENABLE_GRANOLA` or `ENABLE_FATHOM` is missing, Echolog Lucid treats that connector as enabled. After changing these values on Vercel or another host, redeploy the app before expecting the UI to change. Installed PWAs can also hold onto a cached version, so close and reopen the installed app, or refresh the deployed URL in the browser, after the redeploy finishes.

## Deploying to Vercel or Another Host

Vercel works well for this app and is the easiest recommended setup:

1. Create a Vercel project from this repository.
2. Add the environment variables from `.env.example`.
3. Deploy.
4. Open the app and connect Granola.

Use `NEXT_PUBLIC_APP_URL` for the production URL after the domain is known. This keeps Granola OAuth redirects stable.

Vercel is not required. Any host can work if it supports:

- Next.js server routes.
- HTTPS.
- Secure environment variables.
- Long enough serverless or server request timeouts for meeting fetches.

Tools such as Lovable, Bolt, Replit-style workspaces, or other app builders can use this repository as long as they can run the real Next.js server app and preserve environment variables securely. A static-only host will not work because the Granola and Fathom integrations require server-side API routes.

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
