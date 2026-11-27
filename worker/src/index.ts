import { createClient } from '@supabase/supabase-js';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APP_ORIGIN?: string;
}

type QuoteRequest = { vehicle_id: string; pickup_at: string; return_at: string; delivery?: boolean; insurance?: boolean; extra_driver?: boolean; coupon?: string };
const recent = new Map<string, { count: number; at: number }>();
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

async function jsonBody<T>(request: Request, fallback: T): Promise<T> {
  try { return await request.json() as T; }
  catch { return fallback; }
}

function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get('origin') ?? '';
  const permitted = env.APP_ORIGIN ? origin === env.APP_ORIGIN : origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173';
  const headers = new Headers({ 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '86400', 'vary': 'Origin' });
  if (permitted) headers.set('access-control-allow-origin', origin);
  return headers;
}

function rateLimited(request: Request): boolean {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'; const now = Date.now(); const current = recent.get(ip);
  if (!current || now - current.at > 60_000) { recent.set(ip, { count: 1, at: now }); return false; }
  current.count += 1; return current.count > 90;
}

function userClient(env: Env, token?: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: token ? { Authorization: `Bearer ${token}` } : {} } });
}

async function authenticated(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'Authentication required' }, 401) };
  const client = userClient(env, token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: 'Invalid or expired session' }, 401) };
  return { client, user: data.user, token };
}

async function resolveVehicleId(client: ReturnType<typeof userClient>, value: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return value;
  const { data } = await client.from('vehicles').select('id').eq('slug', value).eq('is_published', true).maybeSingle();
  return data?.id ?? null;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const headers = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const origin = request.headers.get('origin');
  if (origin && !headers.has('access-control-allow-origin')) return json({ error: 'Origin is not allowed' }, 403);
  if (rateLimited(request)) return json({ error: 'Too many requests. Please try again shortly.' }, 429, headers);
  const url = new URL(request.url); const path = url.pathname.replace(/^\/api/, '');
  if (path === '/health' && request.method === 'GET') return json({ ok: true, service: 'motara-api' }, 200, headers);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: 'Supabase is not configured for this deployment.' }, 503, headers);

  if (path === '/cars' && request.method === 'GET') {
    const client = userClient(env);
    const { data, error } = await client.rpc('search_available_vehicles', {
      p_pickup_at: url.searchParams.get('start') || null, p_return_at: url.searchParams.get('end') || null,
      p_city: url.searchParams.get('city') || null, p_category: url.searchParams.get('category') || null,
      p_transmission: url.searchParams.get('transmission') || null, p_fuel: url.searchParams.get('fuel') || null,
      p_seats: url.searchParams.has('seats') ? Number(url.searchParams.get('seats')) : null,
      p_max_price: url.searchParams.has('max_price') ? Number(url.searchParams.get('max_price')) : null,
    });
    if (error) return json({ error: 'Unable to load cars.' }, 500, headers);
    return json({ cars: data ?? [] }, 200, headers);
  }

  if (path === '/bookings' && request.method === 'GET') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const { data, error } = await session.client.from('bookings').select('id,booking_number,customer_id,office_id,vehicle_id,pickup_address,return_address,pickup_at,return_at,status,total_amount,currency,vehicles(slug,make,model,model_year),rental_offices(slug,name),profiles!bookings_customer_id_fkey(full_name)').order('pickup_at', { ascending: false }).limit(100);
    if (error) return json({ error: 'Unable to load bookings.' }, 403, headers);
    return json({ bookings: data ?? [] }, 200, headers);
  }

  if (path === '/offices/mine' && request.method === 'GET') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const { data, error } = await session.client.rpc('list_my_offices');
    if (error) return json({ error: 'Unable to load office workspaces.' }, 403, headers);
    return json({ offices: data ?? [] }, 200, headers);
  }

  const officeInstructions = path.match(/^\/offices\/([^/]+)\/payment-instructions$/);
  if (officeInstructions && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ cash?: string; bank_transfer?: string } | null>(request, null);
    if (!body || typeof body.cash !== 'string' || typeof body.bank_transfer !== 'string' || body.cash.length > 1500 || body.bank_transfer.length > 1500) return json({ error: 'Each payment instruction must be under 1,500 characters.' }, 400, headers);
    const { data: office } = await session.client.from('rental_offices').select('id').eq('slug', officeInstructions[1]).maybeSingle();
    if (!office) return json({ error: 'Office workspace not found.' }, 404, headers);
    const { data, error } = await session.client.rpc('set_office_payment_instructions', { p_office_id: office.id, p_instructions: { cash: body.cash.trim(), bank_transfer: body.bank_transfer.trim() } });
    if (error) return json({ error: 'Payment instructions could not be saved.' }, 403, headers);
    return json({ instructions: data }, 200, headers);
  }

  if (path === '/payments' && request.method === 'GET') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const { data, error } = await session.client.from('payments').select('id,booking_id,payment_method,payment_type,amount,currency,status,reference,notes,created_at,payment_proofs(id,storage_path,original_filename,mime_type,byte_size,created_at)').order('created_at', { ascending: false }).limit(200);
    if (error) return json({ error: 'Unable to load payment history.' }, 403, headers);
    return json({ payments: data ?? [] }, 200, headers);
  }

  const bookingFinance = path.match(/^\/bookings\/([^/]+)\/finance$/);
  if (bookingFinance && request.method === 'GET') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const bookingId = bookingFinance[1];
    const { data: booking, error: bookingError } = await session.client.from('bookings').select('id,booking_number,customer_id,office_id,status,payment_status,total_amount,deposit_amount,currency,rental_offices(name,payment_instructions)').eq('id', bookingId).maybeSingle();
    if (bookingError || !booking) return json({ error: 'Booking finance record was not found.' }, 404, headers);
    const { data: summary, error: summaryError } = await session.client.rpc('booking_financial_summary', { p_booking_id: bookingId });
    if (summaryError) return json({ error: 'Booking balance could not be calculated.' }, 403, headers);
    const [paymentResult, refundResult, depositResult] = await Promise.all([
      session.client.from('payments').select('id,booking_id,payment_method,payment_type,amount,currency,status,reference,notes,created_at,payment_proofs(id,storage_path,original_filename,mime_type,byte_size,created_at)').eq('booking_id', bookingId).order('created_at', { ascending: false }),
      session.client.from('refunds').select('id,payment_id,amount,currency,reason,status,refund_method,manual_reference,created_at').eq('booking_id', bookingId).order('created_at', { ascending: false }),
      session.client.from('deposits').select('id,amount,collected_amount,deduction_amount,currency,status,reason,released_at').eq('booking_id', bookingId).maybeSingle(),
    ]);
    if (paymentResult.error || refundResult.error || depositResult.error) return json({ error: 'Unable to load booking financial history.' }, 403, headers);
    const transactionResult = depositResult.data
      ? await session.client.from('deposit_transactions').select('id,transaction_type,amount,currency,method,reference,reason,created_at').eq('deposit_id', depositResult.data.id).order('created_at', { ascending: false })
      : { data: [], error: null };
    if (transactionResult.error) return json({ error: 'Unable to load deposit transaction history.' }, 403, headers);
    return json({ booking, summary, instructions: booking.rental_offices?.[0]?.payment_instructions ?? {}, office_name: booking.rental_offices?.[0]?.name ?? '', payments: paymentResult.data ?? [], refunds: refundResult.data ?? [], deposit: depositResult.data, deposit_transactions: transactionResult.data ?? [] }, 200, headers);
  }

  const financeReport = path === '/finance/report' && request.method === 'GET';
  if (financeReport) {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const officeId = url.searchParams.get('office_id'); const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return json({ error: 'Report dates must use YYYY-MM-DD.' }, 400, headers);
    const { data, error } = await session.client.rpc('office_financial_report', { p_office_id: officeId || null, p_from: from || null, p_to: to || null });
    if (error) return json({ error: 'Financial report could not be loaded.' }, 403, headers);
    return json({ report: data ?? [] }, 200, headers);
  }

  if (path === '/quote' && request.method === 'POST') {
    const input = await jsonBody<QuoteRequest | null>(request, null);
    if (!input || !input.vehicle_id || !input.pickup_at || !input.return_at) return json({ error: 'Vehicle and rental dates are required.' }, 400, headers);
    const pickupTime = Date.parse(input.pickup_at); const returnTime = Date.parse(input.return_at);
    if (!Number.isFinite(pickupTime) || !Number.isFinite(returnTime) || returnTime <= pickupTime) return json({ error: 'Enter valid dates with the return after pickup.' }, 400, headers);
    const client = userClient(env); const vehicleId = await resolveVehicleId(client, input.vehicle_id);
    if (!vehicleId) return json({ error: 'Vehicle is not available.' }, 404, headers);
    const { data, error } = await client.rpc('calculate_booking_quote', { p_vehicle_id: vehicleId, p_pickup_at: input.pickup_at, p_return_at: input.return_at, p_delivery: Boolean(input.delivery), p_insurance: Boolean(input.insurance), p_extra_driver: Boolean(input.extra_driver), p_coupon: input.coupon ?? null });
    if (error) return json({ error: error.message.includes('not available') ? 'Vehicle is not available.' : 'Unable to calculate a quote.' }, 400, headers);
    return json({ quote: data }, 200, headers);
  }

  if (path === '/bookings' && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const input = await jsonBody<(QuoteRequest & { pickup_address?: string; return_address?: string; note?: string }) | null>(request, null);
    const pickupTime = Date.parse(input?.pickup_at ?? ''); const returnTime = Date.parse(input?.return_at ?? '');
    if (!input || !input.vehicle_id || !Number.isFinite(pickupTime) || !Number.isFinite(returnTime) || returnTime <= pickupTime) return json({ error: 'A vehicle and valid rental period are required.' }, 400, headers);
    if ((input.pickup_address?.length ?? 0) > 240 || (input.return_address?.length ?? 0) > 240 || (input.note?.length ?? 0) > 1000) return json({ error: 'Booking notes and locations exceed their maximum length.' }, 400, headers);
    const vehicleId = await resolveVehicleId(session.client, input.vehicle_id);
    if (!vehicleId) return json({ error: 'Vehicle is not available.' }, 404, headers);
    const { data, error } = await session.client.rpc('request_booking', { p_vehicle_id: vehicleId, p_pickup_at: input.pickup_at, p_return_at: input.return_at, p_pickup_address: input.pickup_address ?? '', p_return_address: input.return_address ?? '', p_delivery: Boolean(input.delivery), p_insurance: Boolean(input.insurance), p_extra_driver: Boolean(input.extra_driver), p_coupon: input.coupon ?? null, p_customer_note: input.note ?? null });
    if (error) return json({ error: error.message.includes('bookings_vehicle_no_overlap') ? 'This car has another reservation during those dates.' : error.message.includes('Vehicle is not available') ? 'This car is not available.' : 'Booking request could not be created.' }, 409, headers);
    return json({ booking: data }, 201, headers);
  }

  const bookingAction = path.match(/^\/bookings\/([^/]+)\/(pickup|return|cancel|decision)$/);
  if (bookingAction && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<Record<string, unknown>>(request, {}); const bookingId = bookingAction[1]; const action = bookingAction[2];
    if (action === 'pickup' || action === 'return') {
      const odometer = Number(body.odometer_km); const fuel = String(body.fuel_level ?? '');
      if (!Number.isSafeInteger(odometer) || odometer < 0) return json({ error: 'Enter a valid odometer reading.' }, 400, headers);
      if (!['Full', 'Three-quarters', 'Half', 'Quarter', 'Empty'].includes(fuel)) return json({ error: 'Choose a valid fuel level.' }, 400, headers);
      if (typeof body.notes === 'string' && body.notes.length > 1000) return json({ error: 'Inspection notes are limited to 1,000 characters.' }, 400, headers);
    }
    if (action === 'return') {
      const lateMinutes = Number(body.late_minutes ?? 0);
      if (!Number.isSafeInteger(lateMinutes) || lateMinutes < 0 || lateMinutes > 100_000) return json({ error: 'Enter a valid late return duration.' }, 400, headers);
      if (body.damage !== undefined && !Array.isArray(body.damage)) return json({ error: 'Damage details must be a list.' }, 400, headers);
      const damage = Array.isArray(body.damage) ? body.damage.slice(0, 25).map(item => typeof item === 'object' && item !== null && 'description' in item ? { description: String(item.description).trim().slice(0, 500) } : null) : [];
      if (damage.some(item => item === null)) return json({ error: 'Each damage entry needs a description.' }, 400, headers);
      body.damage = damage.filter((item): item is { description: string } => item !== null);
    }
    const rpc = action === 'pickup' ? ['record_pickup', { p_booking_id: bookingId, p_odometer: Number(body.odometer_km), p_fuel: String(body.fuel_level ?? 'Full'), p_notes: body.notes ? String(body.notes) : null }]
      : action === 'return' ? ['record_return', { p_booking_id: bookingId, p_odometer: Number(body.odometer_km), p_fuel: String(body.fuel_level ?? 'Full'), p_late_minutes: Math.max(0, Number(body.late_minutes ?? 0)), p_damage: Array.isArray(body.damage) ? body.damage : [] }]
        : action === 'decision' ? ['decide_booking_request', { p_booking_id: bookingId, p_approve: body.approve === true, p_note: body.note ? String(body.note) : null }]
          : ['cancel_booking', { p_booking_id: bookingId, p_reason: body.reason ? String(body.reason) : null }];
    const { data, error } = await session.client.rpc(rpc[0] as never, rpc[1] as never);
    if (error) return json({ error: error.message.includes('no_overlap') ? 'This vehicle is already reserved for those dates.' : 'Booking action was not accepted.' }, 409, headers);
    return json({ result: data }, 200, headers);
  }

  if (path === '/payments/manual' && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const input = await jsonBody<{ booking_id?: string; method?: string; amount?: number; payment_type?: string; reference?: string; notes?: string } | null>(request, null);
    if (!input?.booking_id || !Number.isFinite(input.amount) || (input.amount ?? 0) <= 0 || !['cash', 'bank_transfer'].includes(input.method ?? '') || (input.payment_type && !['rental','security_deposit'].includes(input.payment_type))) return json({ error: 'Choose a valid amount and cash or bank transfer.' }, 400, headers);
    const { data, error } = await session.client.rpc('record_manual_payment', { p_booking_id: input.booking_id, p_amount: input.amount, p_method: input.method, p_payment_type: input.payment_type ?? 'rental', p_reference: input.reference ?? null, p_notes: input.notes ?? null });
    if (error) return json({ error: error.message.includes('outstanding balance') ? 'Amount exceeds the outstanding booking balance.' : error.message.includes('security deposit') ? 'Amount exceeds the outstanding security deposit.' : 'Manual payment could not be recorded.' }, 409, headers);
    const { data: booking } = await session.client.from('bookings').select('rental_offices(payment_instructions)').eq('id', input.booking_id).maybeSingle();
    return json({ payment: data, instructions: booking?.rental_offices?.[0]?.payment_instructions ?? {} }, 201, headers);
  }

  if (path === '/payments/record' && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const input = await jsonBody<{ booking_id?: string; method?: string; amount?: number; payment_type?: string; reference?: string; notes?: string } | null>(request, null);
    if (!input?.booking_id || !Number.isFinite(input.amount) || (input.amount ?? 0) <= 0 || !['cash','bank_transfer'].includes(input.method ?? '') || (input.payment_type && !['rental','security_deposit'].includes(input.payment_type))) return json({ error: 'Choose a valid amount and cash or bank transfer.' }, 400, headers);
    const { data, error } = await session.client.rpc('record_manual_payment', { p_booking_id: input.booking_id, p_amount: input.amount, p_method: input.method, p_payment_type: input.payment_type ?? 'rental', p_reference: input.reference ?? null, p_notes: input.notes ?? null });
    if (error) return json({ error: 'Office payment could not be recorded.' }, 403, headers);
    return json({ payment: data }, 201, headers);
  }

  const paymentProof = path.match(/^\/payments\/([^/]+)\/proofs$/);
  if (paymentProof && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ storage_path?: string; original_filename?: string; mime_type?: string; byte_size?: number } | null>(request, null);
    if (!body?.storage_path || !body.original_filename || !body.mime_type || !Number.isSafeInteger(body.byte_size) || (body.byte_size ?? 0) < 1 || (body.byte_size ?? 0) > 10 * 1024 * 1024) return json({ error: 'Payment proof must be a file under 10 MB.' }, 400, headers);
    const { data, error } = await session.client.rpc('register_payment_proof', { p_payment_id: paymentProof[1], p_storage_path: body.storage_path, p_filename: body.original_filename, p_mime: body.mime_type, p_size: body.byte_size });
    if (error) return json({ error: 'Payment proof could not be attached.' }, 403, headers);
    return json({ proof: data }, 201, headers);
  }

  const paymentVerify = path.match(/^\/payments\/([^/]+)\/verify$/);
  if (paymentVerify && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ approved?: boolean; note?: string }>(request, {});
    if (typeof body.approved !== 'boolean' || (body.note?.length ?? 0) > 1000) return json({ error: 'Choose an approval decision and a note under 1,000 characters.' }, 400, headers);
    const { data, error } = await session.client.rpc('verify_manual_payment', { p_payment_id: paymentVerify[1], p_approved: body.approved === true, p_note: body.note ?? null });
    if (error) return json({ error: 'Payment could not be verified.' }, 403, headers);
    return json({ payment: data }, 200, headers);
  }

  if (path === '/refunds/manual' && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ payment_id?: string; amount?: number; method?: string; reason?: string; reference?: string } | null>(request, null);
    if (!body?.payment_id || !Number.isFinite(body.amount) || (body.amount ?? 0) <= 0 || !['cash','bank_transfer'].includes(body.method ?? '') || !body.reason?.trim() || body.reason.trim().length > 1000 || (body.reference?.length ?? 0) > 160) return json({ error: 'Enter a valid refund amount, method, reason, and reference.' }, 400, headers);
    const { data, error } = await session.client.rpc('record_manual_refund', { p_payment_id: body.payment_id, p_amount: body.amount, p_method: body.method, p_reason: body.reason.trim(), p_reference: body.reference?.trim() || null });
    if (error) return json({ error: 'Manual refund could not be recorded.' }, 403, headers);
    return json({ refund: data }, 201, headers);
  }

  const depositRelease = path.match(/^\/deposits\/([^/]+)\/release$/);
  if (depositRelease && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ deduction?: number; reason?: string; method?: string; reference?: string }>(request, {});
    if (!Number.isFinite(body.deduction) || (body.deduction ?? -1) < 0 || (body.reason?.length ?? 0) > 1000 || (body.reference?.length ?? 0) > 160 || (body.method && !['cash','bank_transfer'].includes(body.method))) return json({ error: 'Enter valid deposit settlement details.' }, 400, headers);
    const { data, error } = await session.client.rpc('release_security_deposit', { p_deposit_id: depositRelease[1], p_deduction: body.deduction ?? 0, p_reason: body.reason?.trim() || null, p_method: body.method ?? 'bank_transfer', p_reference: body.reference ?? null });
    if (error) return json({ error: 'Deposit could not be released.' }, 403, headers);
    return json({ deposit: data }, 200, headers);
  }

  const invoice = path.match(/^\/bookings\/([^/]+)\/invoice$/);
  if (invoice && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const { data, error } = await session.client.rpc('issue_booking_invoice', { p_booking_id: invoice[1] });
    if (error) return json({ error: 'Invoice could not be issued for this booking.' }, 403, headers);
    return json({ invoice: data }, 201, headers);
  }

  if (path === '/payouts/request' && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ office_id?: string; amount?: number; currency?: string; destination?: string; notes?: string } | null>(request, null);
    if (!body?.office_id || !Number.isFinite(body.amount) || (body.amount ?? 0) <= 0 || !body.currency || !body.destination?.trim()) return json({ error: 'Enter valid payout details.' }, 400, headers);
    const { data, error } = await session.client.rpc('request_office_payout', { p_office_id: body.office_id, p_amount: body.amount, p_currency: body.currency.toUpperCase(), p_method: 'bank_transfer', p_destination: body.destination.trim(), p_notes: body.notes?.trim() || null });
    if (error) return json({ error: 'Payout request could not be recorded.' }, 403, headers);
    return json({ payout: data }, 201, headers);
  }

  const payoutSettlement = path.match(/^\/payouts\/([^/]+)\/settle$/);
  if (payoutSettlement && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ amount?: number; method?: string; reference?: string; notes?: string } | null>(request, null);
    if (!body || !Number.isFinite(body.amount) || (body.amount ?? 0) <= 0 || !['cash','bank_transfer'].includes(body.method ?? '') || (body.reference?.length ?? 0) > 160 || (body.notes?.length ?? 0) > 1000) return json({ error: 'Enter valid settlement details.' }, 400, headers);
    const { data, error } = await session.client.rpc('record_payout_settlement', { p_payout_id: payoutSettlement[1], p_amount: body.amount, p_method: body.method, p_reference: body.reference ?? null, p_notes: body.notes ?? null });
    if (error) return json({ error: 'Payout settlement could not be recorded.' }, 403, headers);
    return json({ settlement: data }, 201, headers);
  }

  const payoutDecision = path.match(/^\/payouts\/([^/]+)\/decision$/);
  if (payoutDecision && request.method === 'POST') {
    const session = await authenticated(request, env); if ('error' in session) return json({ error: 'Authentication required.' }, 401, headers);
    const body = await jsonBody<{ approved?: boolean; note?: string }>(request, {});
    if (body.note && body.note.length > 1000) return json({ error: 'Payout decision notes are limited to 1,000 characters.' }, 400, headers);
    const { data, error } = await session.client.rpc('decide_payout', { p_payout_id: payoutDecision[1], p_approved: body.approved === true, p_note: body.note ?? null });
    if (error) return json({ error: 'Payout decision was not accepted.' }, 403, headers);
    return json({ payout: data }, 200, headers);
  }
  return json({ error: 'API route not found.' }, 404, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
