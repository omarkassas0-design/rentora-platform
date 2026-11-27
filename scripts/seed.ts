import { createClient } from '@supabase/supabase-js';
import { cities, offices, vehicles } from '../src/lib/domain.ts';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Set ALLOW_DEMO_SEED=true to confirm local demo seeding.');
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1'].includes(host) && process.env.RENTORA_DEMO_SEED_TARGET !== 'remote') throw new Error('Demo seed is restricted to local Supabase. To explicitly seed a remote development project, set RENTORA_DEMO_SEED_TARGET=remote.');
if (process.env.NODE_ENV === 'production') throw new Error('Demo seed cannot run with NODE_ENV=production.');
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = process.env.RENTORA_DEMO_PASSWORD ?? 'RentoraDemo!2026';

async function ensureUser(email: string, name: string) {
  const { data: found } = await admin.auth.admin.getUserByEmail(email);
  if (found.user) {
    await admin.auth.admin.updateUserById(found.user.id, { password, email_confirm: true, user_metadata: { full_name: name } });
    return found.user.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  return data.user.id;
}
async function must<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

const users = await Promise.all([
  ensureUser('admin@rentora.local', 'Rentora Platform Admin'),
  ...offices.map(o => ensureUser(`owner.${o.id}@rentora.local`, `${o.name} Owner`)),
  ensureUser('manager@rentora.local', 'Office Manager'),
  ...['Omar Haddad', 'Lina Saleh', 'Yazan Mahmoud', 'Maya Khalil', 'Samir Nasser'].map((name, i) => ensureUser(`customer${i + 1}@rentora.local`, name)),
]);
const [adminId, ...rest] = users;
const ownerIds = rest.slice(0, offices.length);
const managerId = rest[offices.length];
const customerIds = rest.slice(offices.length + 1);
const adminStaffId = await ensureUser('adminstaff@rentora.local', 'Rentora Admin Staff');
const officeStaffId = await ensureUser('staff@rentora.local', 'Levant Office Staff');
await must(admin.from('user_roles').upsert({ user_id: adminId, role: 'super_admin' }, { onConflict: 'user_id,role,scope_office_id' }));
await must(admin.from('role_permissions').upsert({ role: 'admin_staff', permission_id: 'platform.manage' }, { onConflict: 'role,permission_id' }));
await must(admin.from('user_roles').upsert({ user_id: adminStaffId, role: 'admin_staff' }, { onConflict: 'user_id,role,scope_office_id' }));

const cityRows = cities.map(city => ({ slug: city.id, name: city.name, name_ar: city.ar, governorate: city.region, country_code: 'SY', timezone: 'Asia/Damascus' }));
await must(admin.from('cities').upsert(cityRows, { onConflict: 'slug' }));
const cityData = await must(admin.from('cities').select('id,slug')) as Array<{ id: string; slug: string }>;
const cityId = new Map(cityData.map(row => [row.slug, row.id]));
const officeRows = offices.map((office, index) => ({ owner_id: ownerIds[index], city_id: cityId.get(office.city.toLowerCase()), name: office.name, slug: office.id, description: `A trusted local rental team serving ${office.city}.`, address: office.address, phone: '+963 11 555 0100', status: 'approved', verified_at: new Date().toISOString(), commission_rate: 0.1 }));
const savedOffices = await must(admin.from('rental_offices').upsert(officeRows, { onConflict: 'slug' }).select('id,slug,owner_id')) as Array<{ id: string; slug: string; owner_id: string }>;
const officeId = new Map(savedOffices.map(row => [row.slug, row.id]));
const memberships = savedOffices.flatMap(row => [{ office_id: row.id, user_id: row.owner_id, role: 'office_owner', status: 'active', joined_at: new Date().toISOString() }, ...(row.slug === offices[0].id ? [{ office_id: row.id, user_id: managerId, role: 'office_manager', status: 'active', joined_at: new Date().toISOString() }] : [])]);
await must(admin.from('office_members').upsert(memberships, { onConflict: 'office_id,user_id' }));
await must(admin.from('office_members').upsert({ office_id: officeId.get(offices[0].id), user_id: officeStaffId, role: 'office_staff', permissions: { 'bookings.manage': true, 'customers.read': true, 'finance.read': true, 'payments.record': true, 'payments.verify': true, 'refunds.manage': true, 'deposits.manage': true, 'invoices.issue': true }, status: 'active', joined_at: new Date().toISOString() }, { onConflict: 'office_id,user_id' }));
await must(admin.from('user_roles').upsert(savedOffices.map(row => ({ user_id: row.owner_id, role: 'office_owner', scope_office_id: row.id })), { onConflict: 'user_id,role,scope_office_id' }));
await must(admin.from('user_roles').upsert({ user_id: managerId, role: 'office_manager', scope_office_id: officeId.get(offices[0].id) }, { onConflict: 'user_id,role,scope_office_id' }));
await must(admin.from('user_roles').upsert({ user_id: officeStaffId, role: 'office_staff', scope_office_id: officeId.get(offices[0].id) }, { onConflict: 'user_id,role,scope_office_id' }));

const categoryData = await must(admin.from('vehicle_categories').select('id,slug')) as Array<{ id: string; slug: string }>;
const categoryId = new Map(categoryData.map(row => [row.slug, row.id]));
const vehicleRows = vehicles.map(vehicle => ({ office_id: officeId.get(vehicle.officeId), category_id: categoryId.get(vehicle.category.toLowerCase()), make: vehicle.make, model: vehicle.model, model_year: vehicle.year, slug: vehicle.id, description: `${vehicle.year} ${vehicle.name}, maintained by a verified local rental office.`, transmission: vehicle.transmission.toLowerCase(), fuel_type: vehicle.fuel.toLowerCase(), seating_capacity: vehicle.seats, color: vehicle.color, daily_rate: vehicle.price, weekly_rate: vehicle.weeklyPrice, monthly_rate: vehicle.monthlyPrice, deposit_amount: vehicle.deposit, currency: 'USD', mileage_limit_daily: 250, status: 'available', is_published: true }));
const savedVehicles = await must(admin.from('vehicles').upsert(vehicleRows, { onConflict: 'office_id,slug' }).select('id,slug,office_id,category_id,make,model,model_year,daily_rate,deposit_amount')) as Array<{ id: string; slug: string; office_id: string; category_id: string; make: string; model: string; model_year: number; daily_rate: number; deposit_amount: number }>;

const startAt = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); d.setUTCHours(10, 0, 0, 0); return d; };
const demoBookings = [
  { customer: 0, vehicle: 1, start: 1, duration: 3, status: 'confirmed' }, { customer: 1, vehicle: 4, start: 0, duration: 2, status: 'active' },
  { customer: 2, vehicle: 3, start: -1, duration: 2, status: 'pending' }, { customer: 3, vehicle: 9, start: -3, duration: 2, status: 'completed' },
  { customer: 4, vehicle: 8, start: 3, duration: 4, status: 'confirmed' }, { customer: 0, vehicle: 5, start: 5, duration: 3, status: 'pending' },
  { customer: 1, vehicle: 12, start: -7, duration: 2, status: 'completed' }, { customer: 2, vehicle: 7, start: -9, duration: 3, status: 'cancelled' },
];
const bookingRows = demoBookings.map((demo, index) => {
  const vehicle = vehicles[demo.vehicle]; const dbVehicle = savedVehicles.find(row => row.slug === vehicle.id)!; const start = startAt(demo.start); const end = new Date(start.getTime() + demo.duration * 86_400_000);
  const rental = vehicle.price * demo.duration; const fee = Math.round(rental * 0.04);
  return { booking_number: `RN-DEMO-${2048 - index}`, customer_id: customerIds[demo.customer], office_id: dbVehicle.office_id, vehicle_id: dbVehicle.id, pickup_address: `${vehicle.city} City`, return_address: `${vehicle.city} City`, pickup_at: start.toISOString(), return_at: end.toISOString(), status: demo.status, currency: 'USD', rental_days: demo.duration, daily_rate: vehicle.price, rental_subtotal: rental, service_fee: fee, total_amount: rental + fee, deposit_amount: vehicle.deposit, commission_amount: Math.round(rental * 0.1) };
});
const savedBookings = await must(admin.from('bookings').upsert(bookingRows, { onConflict: 'booking_number' }).select('id,booking_number,customer_id,office_id,vehicle_id,status,total_amount,currency')) as Array<{ id: string; booking_number: string; customer_id: string; office_id: string; vehicle_id: string; status: string; total_amount: number; currency: string }>;
const completed = savedBookings.filter(row => row.status === 'completed');
if (completed.length) {
  const existingPayments = await must(admin.from('payments').select('booking_id').in('booking_id', completed.map(b => b.id))) as Array<{ booking_id: string }>;
  const paidBookings = new Set(existingPayments.map(p => p.booking_id));
  const missingPayments = completed.filter(b => !paidBookings.has(b.id));
  if (missingPayments.length) await must(admin.from('payments').insert(missingPayments.map(b => ({ booking_id: b.id, office_id: b.office_id, customer_id: b.customer_id, payment_method: 'cash', payment_type: 'rental', payment_source: 'office', amount: b.total_amount, currency: b.currency, status: 'paid', recorded_by: adminId, verified_by: adminId, verified_at: new Date().toISOString(), reference: 'DEMO-CASH-RECEIPT' }))));
  await must(admin.from('reviews').upsert(completed.map((b, i) => ({ booking_id: b.id, customer_id: b.customer_id, office_id: b.office_id, vehicle_id: b.vehicle_id, rating: i ? 5 : 4, title: i ? 'Smooth journey' : 'Great local service', body: i ? 'The car was ready on time and the trip was comfortable.' : 'Clear pickup instructions and a helpful team.', status: 'published' })), { onConflict: 'booking_id' }));
}
const growth = await must(admin.from('subscription_plans').select('id').eq('code', 'growth').single()) as { id: string };
const existingSubscriptions = await must(admin.from('subscriptions').select('office_id').in('office_id', savedOffices.map(o => o.id))) as Array<{ office_id: string }>;
const subscribed = new Set(existingSubscriptions.map(s => s.office_id));
const newSubscriptions = savedOffices.filter(o => !subscribed.has(o.id));
if (newSubscriptions.length) await must(admin.from('subscriptions').insert(newSubscriptions.map(office => ({ office_id: office.id, plan_id: growth.id, status: 'trialing', trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString() }))));
const coupon = await must(admin.from('coupons').upsert([{ code: 'WELCOME10', discount_type: 'percent', discount_value: 10, max_uses: 1000, uses_count: 24, starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 45 * 86_400_000).toISOString(), is_active: true, first_booking_only: true }], { onConflict: 'code' }).select('id').single()) as { id: string };
const { data: existingPromotion } = await admin.from('promotions').select('id').eq('coupon_id', coupon.id).maybeSingle();
if (!existingPromotion) await must(admin.from('promotions').insert({ office_id: null, coupon_id: coupon.id, title: 'Welcome to Rentora', description: 'Save 10% on your first booking with code WELCOME10.', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 45 * 86_400_000).toISOString(), usage_limit: 1000, is_active: true }));
console.log(`Seeded ${offices.length} offices, ${vehicles.length} cars, ${savedBookings.length} bookings and development accounts.`);
console.log(`Demo password: ${password}`);
