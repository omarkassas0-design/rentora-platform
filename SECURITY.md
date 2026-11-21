# Security notes

- Never commit `.env`, Supabase service-role keys, Cloudflare API tokens, or customer documents.
- Never expose Supabase service-role credentials in Vite `VITE_*` variables.
- Configure `ALLOWED_ORIGIN` to an explicit production origin; do not leave wildcard CORS for production.
- Keep RLS enabled on every customer/office data table. Review policies after every schema change.
- Do not let a client update `profiles.role`, `offices.verified`, or another user's office membership.
- Add rate limiting / bot protection at Cloudflare before public launch.
- Use private storage buckets for identity documents and rental contracts; the included car-images bucket is public by design.
- Add audit logging for every office-side booking status, payment, and vehicle update.
- Run dependency audits, security testing, concurrency tests and restore drills before launch.
