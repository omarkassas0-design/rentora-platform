# Rentora: creating the first administrator and registering offices

Rentora deliberately does **not** ship with a public/default administrator login. A hard-coded admin account or password would be unsafe.

## Create the first Super Admin

1. Deploy the Supabase migrations in `supabase/migrations/` to your own Supabase project.
2. In Supabase Authentication, create a user using your own administrator email and a strong password (or register through the customer sign-up page and verify the email).
3. Open Supabase SQL Editor and run the following statement, replacing the email with the exact email of that user:

```sql
insert into public.user_roles (user_id, role, scope_office_id)
select id, 'super_admin'::public.app_role, null
from auth.users
where lower(email) = lower('YOUR-ADMIN-EMAIL@example.com')
on conflict (user_id, role, scope_office_id) do nothing;
```

4. Sign in at `/account`, then open `/admin`. Keep this administrator email private and enable strong account security.

Only a trusted project owner should run this SQL. Never expose a Supabase `service_role` key in the browser or commit it to GitHub.

## Customer and office owner flow

- Customers register/sign in at `/account`.
- A signed-in customer selects **Register your rental office** or opens `/register-office`.
- The office owner submits business details. The application is created with `pending` status and is not publicly listed until approved by a Super Admin.
- After submission, the owner can open `/office`. The office workspace requires the matching active office membership/ownership returned by the `list_my_offices()` database function.

## Main application areas

- Customer marketplace: `/`
- Customer sign-in and account: `/account`
- Office registration: `/register-office`
- Office workspace: `/office`
- Platform administration: `/admin`

There is no universal test account in production. Create separate real accounts for customer, office owner, and administrator testing.
