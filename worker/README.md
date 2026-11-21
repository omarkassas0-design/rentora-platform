# Rentora Worker API

This Worker also serves the compiled Vite single-page application through the `ASSETS` binding configured in the root `wrangler.toml`.

API routes:
- `GET /api/health`
- `POST /api/bookings` — requires a Supabase access token and calls the atomic `create_booking` database function.

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker secrets. Set `ALLOWED_ORIGIN` in the root `wrangler.toml` to the exact production origin. Build the frontend and deploy from the repository root with `npm run build && npx wrangler deploy`.

The Worker deliberately uses the public anon key plus the user's bearer token; it does not need the Supabase service-role key.
