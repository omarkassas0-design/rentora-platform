# Rentora — Rental marketplace starter

Rentora is a React/Vite + TypeScript rental marketplace frontend, a Cloudflare Worker API, and a Supabase PostgreSQL schema. It is designed for a multi-office rental marketplace in Syria and can be extended to additional countries.

## What is included

- Integrated `public/` assets: Rentora logo used in the header/footer, favicon, web manifest, robots file, and a local car-image fallback. Git-tracked README files keep the `cars/` and `banners/` asset folders in GitHub.

- Arabic-first responsive marketplace UI with RTL layout and English-ready data model.
- Vehicle search by city, text and daily price; vehicle detail and booking request UI.
- Supabase email/password authentication and customer booking history.
- Supabase schema for profiles, offices, office members, cars, car images, bookings, payments, reviews and audit logs.
- Row Level Security policies for public listings, customer-owned bookings and office-scoped records.
- Database-level exclusion constraint that prevents overlapping active reservations for the same vehicle, including concurrent requests.
- `create_booking` PostgreSQL RPC that snapshots the current rate and calculates rental days on the server.
- Cloudflare Worker API for health checks and authenticated booking creation. It validates the Supabase session and forwards the user's JWT to the RPC.
- Supabase Storage bucket and office-scoped upload policies for car images.
- One Cloudflare Worker deployment serving the Vite frontend and `/api/*` endpoints through Workers Static Assets.

## Important scope and launch status

This is a working foundation / MVP codebase, not a claim that a production rental company is ready to launch without further work. The customer browse/auth/booking flow and database/API foundation are included. The following operational modules still need product-specific implementation and testing before commercial launch: full office onboarding and verification workflow, complete office fleet CRUD screens, employee invitation management, contract generation/signature, vehicle handover/return checklists, damage/deposit workflows, refunds, notifications (WhatsApp/SMS/email), payment gateway integrations, dispute handling, admin moderation UI, rate limiting/abuse monitoring, backups/restore drills, load tests and security review. The UI includes 20 clearly labeled demo vehicle listings across 6 fictional sample rental offices in Syrian cities whenever there are no real published listings. Six examples show promotional price labels. These are mock display data only: the prices, offers, offices and availability are not real, are not inserted into Supabase, and demo bookings are intentionally disabled. Once real published cars exist in Supabase, the live listings replace the demo set.

## Demo listings and sample offers

The storefront contains 20 preview cars distributed across Damascus, Aleppo, Homs, Hama, Latakia, Tartus and Idlib, assigned to six fictional sample offices. Some cards show a sample discount/offer and an original price to demonstrate how promotions look. A visible notice explains that all demo data is illustrative. Demo cars cannot be booked. This preview data is held in the frontend only; it is not a database seed and must be replaced by verified office listings before public launch.

## Requirements

- Node.js 20 LTS or later
- A Supabase project
- A Cloudflare account (Workers)
- GitHub repository

## 1. Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/migrations/0001_initial_schema.sql`.
3. In **Authentication → URL Configuration**, set the production Site URL to your Cloudflare Worker custom domain (or `workers.dev` URL) and add local + production redirect URLs.
4. In **Project Settings → API**, copy the Project URL and anon/publishable key.
5. Never put the Supabase `service_role` key in frontend variables or commit it to GitHub.

The initial SQL creates the public car-images bucket and RLS policies. Office role promotion / Super Admin provisioning must be done only by a trusted operator process; do not allow a browser client to update a profile role.

## 2. Local setup (Windows / macOS / Linux)

1. Install Node.js 20 LTS or newer.
2. Copy `.env.example` to `.env` and enter your Supabase Project URL and anon/publishable key.
3. Copy `.dev.vars.example` to `.dev.vars` and enter the same Supabase URL and anon/publishable key. `.dev.vars` is ignored by Git.
4. Install dependencies and start the Vite frontend:

```bash
npm install
npm run dev
```

5. In a second terminal, build the static assets and start the Cloudflare Worker locally:

```bash
npm run build
npx wrangler dev --port 8787
```

Open `http://localhost:5173`. Vite proxies `/api/*` requests to the local Worker on port 8787. If you only want to preview the UI without Supabase configured, `npm run dev` is sufficient; authentication and real booking requests require Supabase and the Worker.

For Windows PowerShell, copy the files using `Copy-Item .env.example .env` and `Copy-Item .dev.vars.example .dev.vars`.

## 3. Deploy the full platform to Cloudflare Workers

The same Worker serves the built Vite frontend and the `/api/*` endpoints. This avoids maintaining separate frontend and API deployments.

1. Push the repository to GitHub.
2. In Cloudflare Dashboard → Workers & Pages → Create → Workers → Connect to Git (Workers Builds).
3. Select the repository.
4. Build command: `npm run build && npx wrangler deploy`.
5. Add build environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Leave `VITE_API_BASE_URL` empty when frontend and API use the same Worker origin.
6. Add Worker secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Worker settings.
7. Edit root `wrangler.toml` and set `ALLOWED_ORIGIN` to your exact production origin (for example `https://rentora.example.com`). Do not leave the local development origins in production, then deploy.

Alternatively, from a terminal at the repository root, run `npm install`, `npm run build`, then `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_ANON_KEY`, and `npx wrangler deploy`.

Vite variables are public by design. Only use the Supabase anon/publishable key in the frontend; RLS is mandatory. The Worker uses the user's JWT and public anon key; it does not need the service-role key.

## 5. Create your first office and vehicle

The schema supports an office owner creating an office row with `owner_id = auth.uid()` and adding cars under that office. For the first controlled setup, sign up a user, then use the Supabase SQL Editor as project owner to create an office and initial car. Replace the UUID placeholders with the user's ID and office ID:

```sql
insert into public.offices(owner_id,name,slug,city,phone,verified)
values ('USER_UUID','مكتب دمشق لتأجير السيارات','damascus-rentals','دمشق','09xxxxxxxx',true)
returning id;

insert into public.cars(office_id,title,brand,model,year,city,daily_price,currency,transmission,fuel,seats,image_url,description,is_published)
values ('OFFICE_UUID','هيونداي إلنترا','Hyundai','Elantra',2023,'دمشق',35,'USD','أوتوماتيك','بنزين',5,'https://example.com/car.jpg','سيارة تجريبية؛ استبدل الرابط بصورة حقيقية',true);
```

For real production onboarding, implement an admin-reviewed office registration workflow rather than letting users self-verify.

## 6. Important security / business rules

- The frontend uses only the Supabase anon/publishable key.
- The Worker validates the bearer token against Supabase Auth before calling the booking RPC.
- Booking creation is done by a PostgreSQL function and database exclusion constraint, not by a client-side availability check alone.
- Active statuses `pending` and `confirmed` block overlapping reservations. Rejected/cancelled/completed bookings do not block future dates.
- The first booking request is pending; an office must confirm it. Do not represent a pending request as a confirmed reservation.
- Currency values are stored per listing/booking. Do not add or compare different currencies without a current FX rate and explicit accounting policy.
- No payment gateway is configured. Payment records are manual/offline at this stage.
- Keep Supabase backups enabled and test restoring them before launch.

## Public assets

The `public/` directory is part of the project and is copied by Vite into `dist/`. The app references `/logo/rentora-logo.svg` and `/placeholders/car-placeholder.svg`. Real office images should be uploaded to the configured Supabase Storage bucket. The 20 demonstration car photos are currently remote Unsplash URLs; the local placeholder is displayed if one fails to load.

## Scripts

- `npm run dev` — local Vite development server
- `npm run typecheck` — TypeScript checks
- `npm run build` — production frontend build
- `npm run deploy` — build and deploy the full application to Cloudflare Workers (requires Wrangler auth)

## Suggested next implementation milestones

1. Office onboarding + admin verification and staff management.
2. Full office dashboard with vehicle CRUD, calendar, pricing and booking workflow.
3. Contract PDF, check-in/check-out, mileage, fuel and damage records.
4. Deposits, cash reconciliation, refunds and payment receipts.
5. Notifications, audit log UI and customer support tools.
6. E2E tests, security review, load testing and operational monitoring.
