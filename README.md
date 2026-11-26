# Rentora

Rentora is a React/Vite marketplace with separate customer, rental-office, and platform-admin route shells. The repository includes a Supabase PostgreSQL schema with tenant RLS, a Cloudflare Worker API, a development-only local preview, pricing logic, and deployment wiring.

## What is implemented

- Responsive customer routes for search, car details, offices, cities, offers, account, and policy pages.
- Search by city and dates, category/transmission/price filters, saved cars, validated quotes, and booking requests.
- Supabase email/password signup, login, email verification flow, and password reset when public Supabase settings are present.
- Separate `/office/*` and `/admin/*` navigation. Office fleet management supports create/edit/archive, pricing, publication status, and vehicle photo uploads. Admin office management supports creation, profile edits, approval, rejection, activation, and suspension.
- Booking operations record approval, pickup/return odometer and fuel, late minutes, damage notes, inspection photos, and database history. Customers can save cars, edit their profile, and manage booking-linked payments and balances.
- The manual-only payment ledger supports cash and bank transfers, partial payments, server-calculated outstanding balances, office payment instructions, customer receipt uploads, permission-checked verification, manually recorded refunds, security-deposit collection/deductions/refunds, payment history, and printable invoices and receipts. Office financial reports and platform-wide finance reports are calculated in PostgreSQL. Payout requests and manual settlements are audited.
- Supabase migrations for normalized marketplace records, database-side pricing, coupon limits, booking status history, audit logging, and an exclusion constraint that prevents overlapping reservations for the same vehicle.
- Row Level Security on the public schema; helper functions scope office access and staff permissions. File buckets are configured for public vehicle images and private documents, inspection photos, and payment proofs.
- Worker routes for public vehicle search and quotes, authenticated booking creation and retrieval, booking decisions/pickup/return/cancellation, manual payments, secure proof registration, payment verification, manual refunds, deposit settlements, invoice issuance, financial reports, and payout settlements.
- Payments are manual only: cash and bank transfer, partial balances, customer proof uploads, staff verification, refunds, deposits, printable invoices and receipts, and auditable office payout settlements. No online payment gateway is included.
- Office subscriptions with plan CRUD, manual assignments, owner change requests and cancellations, and platform approvals. No subscription payment gateway is used.
- Supabase-backed CMS management for bilingual public pages and FAQs, homepage banners, and featured content.
- Customer support tickets and booking disputes with threaded replies, internal staff notes, tenant-scoped office queues, and moderated resolutions.
- Office and platform staff invitations with email-bound, expiring activation links, role assignment, staff permissions, suspension, revocation, and audited database changes.
- Live rental calendars with day, week, and month views. Platform settings support search, validation, editing, and removal with database auditing.

The local development preview can run without Supabase and saves its clearly labeled sample records in the current browser. Production builds stop at a setup screen until Supabase settings are present, so seeded cars, offices, or bookings are never shown as live marketplace records. Customer, office, and platform workspaces use Supabase under Row Level Security. The seed script is for isolated development projects only.

## Requirements

- Node.js 22 or newer and npm.
- A Supabase project for persistent accounts and data.
- Cloudflare account and domain for deployment.
- A GitHub repository for the optional deployment workflow.

No Docker is required for the local frontend preview. A production marketplace requires Supabase and the Worker API to be configured. The repository does not connect to a hosted service or deploy itself.

## Run the demo

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. Use the **Office portal** or **Admin panel** routes from the marketplace footer. Demo booking and status changes stay in browser storage.

## Connect Supabase

1. Create a Supabase project. Configure its Auth email/redirect settings for your app domain.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL=/api`.
3. Install/use the Supabase CLI, authenticate, and link this directory to the project.
4. Apply migrations with `supabase db push`. Never put a service-role or secret key in a `VITE_` variable.
5. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as **Worker secrets** (these are the project URL and anon key, not the service-role key):

   ```sh
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   ```

6. Set `APP_ORIGIN` in the Worker to the exact deployed website origin. For a direct production deploy, replace the example in `[env.production.vars]` in `wrangler.toml`. The GitHub workflow reads the exact origin from the repository variable named `APP_ORIGIN` and stops if it is missing.
7. Build and deploy:

   ```sh
   npm run build
   npm run deploy
   ```

The Worker forwards the caller’s Supabase JWT and uses the anon key; it does not bypass RLS. Never add `SUPABASE_SERVICE_ROLE_KEY` to Worker configuration or browser builds.

## Development seed

The schema seeds city/category/plan/settings reference rows. The optional `scripts/seed.ts` script creates test auth users and sample offices, vehicles, bookings, manual payments, reviews, coupons, and a promotion. It refuses to target a non-local database unless explicitly overridden.

Create a private `.env.local` for a local Supabase project with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run:

```sh
ALLOW_DEMO_SEED=true npm run seed:demo
```

The service-role key is used only by this local script. Do not commit it or run demo seeding against production. Demo password: `RentoraDemo!2026`.

| Role | Email |
|---|---|
| Super Admin | `admin@rentora.local` |
| Admin Staff | `adminstaff@rentora.local` |
| Office Owner (Damascus) | `owner.levant-mobility@rentora.local` |
| Office Manager (Damascus) | `manager@rentora.local` |
| Office Staff (Damascus) | `staff@rentora.local` |
| Customer | `customer1@rentora.local` |

Other office owners and customers are also created by the seed script. Demo users should exist only in an isolated development project.

## Currency and payments

USD is the initial display currency. `platform_settings.syp_per_usd` is deliberately `null`; SYP formatting/conversion must remain unavailable until a current rate is supplied by an administrator. No exchange rate is bundled. Payments are exclusively manual cash or bank transfer. The Worker has no online payment endpoint, adapter, or payment credential.

## Tests and checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Vitest covers rental quote arithmetic, booking intervals, calendar date ranges, CMS link safety, and platform setting validation. Database migrations and RLS policies must be applied and exercised against an isolated Supabase project; this source package contains no hosted project credentials.

## Deploy from GitHub

The workflow in `.github/workflows/deploy.yml` runs TypeScript, lint, unit tests, and the production build on pull requests and pushes to `main`. On `main`, it deploys with Wrangler when the required GitHub secrets are configured. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, and add `APP_ORIGIN` as a repository variable. Apply database migrations separately after reviewing them.

## Project layout

```text
src/                     Marketplace and portal UI, domain helpers, quote tests
worker/src/index.ts      Cloudflare Worker API and manual payment adapter
supabase/migrations/     PostgreSQL tables, RPCs, booking exclusion, RLS, Storage, manual finance ledger
supabase/seed.sql        Public Syrian city reference data
scripts/seed.ts          Isolated development account and marketplace seeding
wrangler.toml            Worker + static SPA configuration
```
