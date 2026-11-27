# Motara Marketplace — Buy & Rent Cars

This project keeps the existing rental marketplace capabilities (rental offices, vehicle fleet, bookings, customer and office accounts, admin/office portals, finance, promotions, and image advertisement campaigns) and adds a separate car-sales marketplace.

## New public routes
- `/cars` — rental inventory and booking flow.
- `/buy-cars` — approved cars for sale, with search, governorate filter, and price sorting.
- `/sell-car` — authenticated seller/dealer listing submission with up to 8 photos.

## New admin route
- `/admin/sales` — review pending sale listings, approve/reject, mark sold, or delete. Access is protected by the `cars.manage` platform permission and RLS.

## Database setup
Run migrations in chronological order in Supabase SQL Editor. The new migration is:
`supabase/migrations/202611270006_vehicle_sales_marketplace.sql`

It creates `vehicle_sale_listings`, RLS policies, the public image bucket `vehicle-sale-images`, and the `cars.manage` permission. Do not use a service-role key in the browser. Seller uploads are restricted to a folder named with the authenticated user UUID.

## Environment and local run
Copy `.env.example` to `.env.local`, add the Supabase URL and publishable/anon key, then run:

```bash
npm install
npm run dev
```

The public listings and seller submission require Supabase and the migration to be applied. A build was not run in this workspace because dependencies are not installed and the npm registry cache is unavailable; verify with `npm run build` after installing dependencies locally.

## Brand name
The UI uses **Motara** as a working name. Replace it after selecting a final brand and checking domain/trademark availability.
