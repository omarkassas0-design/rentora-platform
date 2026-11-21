# Rentora — Start here

This ZIP is the single integrated project. It already includes the `public/` directory and the Rentora logo/favicon/fallback assets. Do not merge it with the older SyriaDrive or earlier Rentora ZIPs.

## Before uploading to GitHub

1. Extract this ZIP.
2. Open the extracted `rentora-platform` folder.
3. Confirm you see `package.json`, `src/`, `worker/`, `supabase/`, `wrangler.toml`, and `public/` at the same level.
4. Upload the **contents of `rentora-platform`** to the root of a new GitHub repository named `rentora-platform` (not the outer folder as an extra nested folder).
5. Do not upload `.env` or `.dev.vars` after you create them. They are private local configuration files and are ignored by Git.

## Local run

Requires Node.js 20 or newer.

```bash
npm install
```

Copy `.env.example` to `.env` and `.dev.vars.example` to `.dev.vars`, then fill both with the Supabase Project URL and anon/publishable key.

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run build
npx wrangler dev --port 8787
```

Open `http://localhost:5173`.

## Supabase

Create a Supabase project, then run the full SQL file `supabase/migrations/0001_initial_schema.sql` once in the Supabase SQL Editor. Add the local and production URLs in Supabase Auth URL Configuration.

## Cloudflare

Connect the GitHub repository to Cloudflare Workers. Build/deploy command:

```bash
npm install && npm run build && npx wrangler deploy
```

Set build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Set Worker secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Set `ALLOWED_ORIGIN` in `wrangler.toml` to your exact deployed origin before launch.

## Current implementation status

Included now: responsive Arabic-first rental marketplace UI, 20 frontend-only sample cars across six fictional offices, example offer badges, customer email/password auth, customer booking list, office registration request, basic office car creation/deletion after verification, Supabase schema/RLS/storage setup, atomic no-overlap booking RPC, Cloudflare Worker booking API, integrated logo/favicon/fallback assets.

Not included yet: production Super Admin interface, complete booking management/calendar for offices, contracts/e-signatures, check-in/check-out, deposits/refunds, real payment gateways, WhatsApp/SMS notifications, staff invitations, moderation/support workflows, load/security test certification. The sample car images use remote Unsplash URLs; local fallback artwork is bundled. Sample cars/offices/prices/offers are fictional and demo bookings are disabled.

This is an integrated MVP codebase, not a claim of a fully audited production system. Complete the remaining workflows and perform deployment, security, concurrency and load tests before accepting real customers or payments.
