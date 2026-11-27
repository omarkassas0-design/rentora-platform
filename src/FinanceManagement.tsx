import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, RefreshCw, Upload } from 'lucide-react';
import { api, supabase } from './lib/supabase';
import { formatCurrency, formatDate, formatDateTime, formatNumber, uiText } from './lib/locale';

type Props = { admin: boolean; officeId: string; notify: (message: string) => void };
type Proof = { id: string; storage_path: string; original_filename: string; mime_type: string; byte_size: number };
type Payment = { id: string; booking_id: string; payment_method: string; payment_type: string; amount: number; currency: string; status: string; reference: string | null; notes: string | null; created_at: string; payment_proofs?: Proof[] };
type Refund = { id: string; booking_id: string; payment_id: string; amount: number; currency: string; reason: string; status: string; refund_method: string; manual_reference: string | null; created_at: string };
type Commission = { id: string; booking_id: string; gross_amount: number; commission_amount: number; currency: string; status: string; created_at: string };
type Payout = { id: string; office_id: string; amount: number; currency: string; status: string; requested_at: string; notes: string | null; reference: string | null };
type PayoutSettlement = { id: string; payout_id: string; amount: number; currency: string; payment_method: string; reference: string | null; notes: string | null; settled_at: string };
type Expense = { id: string; category: string; description: string | null; amount: number; currency: string; expense_date: string };
type Deposit = { id: string; booking_id: string; amount: number; collected_amount: number; deduction_amount: number; currency: string; status: string; reason: string | null; created_at: string };
type DepositActivity = { id: string; deposit_id: string; transaction_type: string; amount: number; currency: string; method: string | null; reference: string | null; reason: string | null; created_at: string };
type BookingOption = { id: string; booking_number: string; total_amount: number; deposit_amount: number; currency: string; payment_status: string; profiles?: { full_name: string } | null; vehicles?: { make: string; model: string } | null };
type ReportRow = { currency: string; collected: number; refunds: number; commissions: number; payouts: number; expenses: number; deposit_collected: number; deposit_refunded: number; deposit_deductions: number };
type AuditEvent = { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; office_id: string | null; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; created_at: string };
type Tab = 'payments' | 'refunds' | 'commissions' | 'payouts' | 'expenses' | 'deposits' | 'reports' | 'audit' | 'instructions';

const money = (amount: number, currency: string) => formatCurrency(amount, currency);
const shortId = (value: string | null) => value ? value.slice(0, 8).toUpperCase() : '—';
const pretty = (value: string) => uiText(value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()));
const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

function printPage(title: string, html: string) {
  const page = window.open('', '_blank');
  if (!page) return false;
  page.document.write(`<!doctype html><html><head><title>${safe(title)}</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#17231b;margin:48px;max-width:780px}header{display:flex;justify-content:space-between;border-bottom:2px solid #243c2c;padding-bottom:20px;margin-bottom:28px}.brand{font-size:22px;font-weight:800;letter-spacing:1px}.muted{color:#607066}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5eae5}.total{font-weight:bold;font-size:17px;text-align:right;margin-top:22px}@media print{body{margin:16mm}}</style></head><body>${html}<script>window.onload=()=>window.print()</script></body></html>`);
  page.document.close();
  return true;
}

export default function FinanceManagementPage({ admin, officeId, notify }: Props) {
  const [tab, setTab] = useState<Tab>('payments');
  const [officeUuid, setOfficeUuid] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutSettlements, setPayoutSettlements] = useState<PayoutSettlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositActivity, setDepositActivity] = useState<DepositActivity[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [instructions, setInstructions] = useState({ cash: '', bank_transfer: '' });
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Vehicle maintenance');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [paymentType, setPaymentType] = useState<'rental' | 'security_deposit'>('rental');
  const [selectedBooking, setSelectedBooking] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [reference, setReference] = useState('');
  const [depositDeduction, setDepositDeduction] = useState('0');
  const [proofBusy, setProofBusy] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');
  const [writePermissions, setWritePermissions] = useState<Set<string>>(new Set());

  const tabs: Tab[] = admin ? ['payments', 'refunds', 'deposits', 'commissions', 'payouts', 'reports', 'audit'] : ['payments', 'deposits', 'commissions', 'payouts', 'expenses', 'reports', 'instructions'];
  const load = useCallback(async () => {
    if (!supabase) { setError('Connect Supabase to load financial records.'); return; }
    setLoading(true); setError('');
    let scopeId = '';
    let officeOwnerId = '';
    if (!admin) {
      const officeResult = await supabase.from('rental_offices').select('id,owner_id,payment_instructions').eq('slug', officeId).maybeSingle();
      if (officeResult.error || !officeResult.data) { setError(officeResult.error?.message ?? 'Office workspace was not found.'); setLoading(false); return; }
      scopeId = officeResult.data.id; officeOwnerId = officeResult.data.owner_id; setOfficeUuid(scopeId);
      const stored = officeResult.data.payment_instructions as { cash?: string; bank_transfer?: string } | null;
      setInstructions({ cash: stored?.cash ?? '', bank_transfer: stored?.bank_transfer ?? '' });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (admin && user) {
      const [roleResult, permissionResult] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id).is('scope_office_id', null),
        supabase.from('role_permissions').select('permission_id').eq('role', 'admin_staff'),
      ]);
      const roles = roleResult.data ?? [];
      const grants = permissionResult.data?.map(row => row.permission_id) ?? [];
      setWritePermissions(new Set(roles.some(row => row.role === 'super_admin') ? ['platform.manage'] : grants));
    } else if (user && scopeId) {
      const { data: member } = await supabase.from('office_members').select('role,permissions').eq('office_id', scopeId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
      const role = member?.role;
      if (officeOwnerId === user.id || role === 'office_owner' || role === 'office_manager') setWritePermissions(new Set(['*']));
      else {
        const grants = member?.permissions && typeof member.permissions === 'object' ? Object.entries(member.permissions).filter(([, allowed]) => allowed === true).map(([permission]) => permission) : [];
        setWritePermissions(new Set(grants));
      }
    } else setWritePermissions(new Set());
    let paymentQuery = supabase.from('payments').select('id,booking_id,payment_method,payment_type,amount,currency,status,reference,notes,created_at,payment_proofs(id,storage_path,original_filename,mime_type,byte_size)').order('created_at', { ascending: false }).limit(300);
    let refundQuery = supabase.from('refunds').select('id,booking_id,payment_id,amount,currency,reason,status,refund_method,manual_reference,created_at,bookings!inner(office_id)').order('created_at', { ascending: false }).limit(300);
    let commissionQuery = supabase.from('commissions').select('id,booking_id,gross_amount,commission_amount,status,created_at,bookings(currency)').order('created_at', { ascending: false }).limit(300);
    let payoutQuery = supabase.from('payouts').select('id,office_id,amount,currency,status,requested_at,notes,reference').order('requested_at', { ascending: false }).limit(300);
    let depositQuery = supabase.from('deposits').select('id,booking_id,amount,collected_amount,deduction_amount,currency,status,reason,created_at,bookings!inner(office_id)').order('created_at', { ascending: false }).limit(300);
    let bookingQuery = supabase.from('bookings').select('id,booking_number,total_amount,deposit_amount,currency,payment_status,profiles!bookings_customer_id_fkey(full_name),vehicles(make,model)').order('created_at', { ascending: false }).limit(300);
    if (!admin && scopeId) {
      paymentQuery = paymentQuery.eq('office_id', scopeId); refundQuery = refundQuery.eq('bookings.office_id', scopeId);
      commissionQuery = commissionQuery.eq('office_id', scopeId); payoutQuery = payoutQuery.eq('office_id', scopeId);
      depositQuery = depositQuery.eq('bookings.office_id', scopeId); bookingQuery = bookingQuery.eq('office_id', scopeId);
    }
    let settlementQuery = supabase.from('payout_settlements').select('id,payout_id,amount,currency,payment_method,reference,notes,settled_at,payouts!inner(office_id)').order('settled_at', { ascending: false }).limit(500);
    if (!admin && scopeId) settlementQuery = settlementQuery.eq('payouts.office_id', scopeId);
    const [paymentResult, refundResult, commissionResult, payoutResult, settlementResult, depositResult, bookingResult, expenseResult, activityResult, auditResult] = await Promise.all([
      paymentQuery, refundQuery, commissionQuery, payoutQuery, settlementQuery, depositQuery, bookingQuery,
      !admin && scopeId ? supabase.from('office_expenses').select('id,category,description,amount,currency,expense_date').eq('office_id', scopeId).order('expense_date', { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
      supabase.from('deposit_transactions').select('id,deposit_id,transaction_type,amount,currency,method,reference,reason,created_at').order('created_at', { ascending: false }).limit(300),
      admin ? supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,office_id,before_data,after_data,created_at').in('entity_type',['payment','refund','deposit','payout','invoice','rental_office']).order('created_at',{ascending:false}).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    const problems = [paymentResult.error, refundResult.error, commissionResult.error, payoutResult.error, settlementResult.error, depositResult.error, bookingResult.error, expenseResult.error, activityResult.error, auditResult.error].filter(Boolean);
    if (problems.length) setError(problems[0]?.message ?? 'Some financial records could not be loaded.');
    setPayments((paymentResult.data ?? []) as unknown as Payment[]); setRefunds((refundResult.data ?? []) as unknown as Refund[]);
    setCommissions((commissionResult.data ?? []).map((row: { id: string; booking_id: string; gross_amount: number; commission_amount: number; status: string; created_at: string; bookings: { currency: string }[] }) => ({ ...row, currency: row.bookings?.[0]?.currency ?? 'USD' })));
    setPayouts((payoutResult.data ?? []) as Payout[]); setPayoutSettlements((settlementResult.data ?? []) as unknown as PayoutSettlement[]); setDeposits((depositResult.data ?? []) as Deposit[]); setBookings((bookingResult.data ?? []) as unknown as BookingOption[]); setExpenses((expenseResult.data ?? []) as Expense[]); setDepositActivity((activityResult.data ?? []) as DepositActivity[]); setAuditEvents((auditResult.data ?? []) as unknown as AuditEvent[]);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const qs = new URLSearchParams(); if (!admin && scopeId) qs.set('office_id', scopeId); if (dateFrom) qs.set('from', dateFrom); if (dateTo) qs.set('to', dateTo);
        const result = await api<{ report: ReportRow[] }>(`/finance/report${qs.size ? '?' + qs.toString() : ''}`, { headers: { authorization: `Bearer ${session.access_token}` } });
        setReport(result.report);
      } catch { setReport([]); }
    }
    setLoading(false);
  }, [admin, officeId, dateFrom, dateTo]);
  useEffect(() => { void load(); }, [load]);

  const can = (permission: string) => admin ? writePermissions.has('platform.manage') : writePermissions.has('*') || writePermissions.has(permission);

  const withSession = async <T,>(path: string, body: unknown, success: string) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { notify(uiText('Sign in with an authorized account to update finance records.')); return; }
    setSaving(true);
    try { await api<T>(path, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) }); await load(); notify(success); }
    catch (failure) { notify(failure instanceof Error ? failure.message : 'The financial action was not accepted.'); }
    finally { setSaving(false); }
  };

  const verifyPayment = (payment: Payment, approved: boolean) => void withSession(`/payments/${payment.id}/verify`, { approved }, approved ? 'Payment verified and booking balance updated.' : 'Payment marked as not received.');
  const recordRefund = async () => {
    if (!selectedPayment) return;
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !refundReason.trim()) { notify(uiText('Enter a positive refund amount and reason.')); return; }
    await withSession('/refunds/manual', { payment_id: selectedPayment.id, amount, method: paymentMethod, reason: refundReason.trim(), reference: reference.trim() || null }, 'Manual refund added to the ledger.');
    setSelectedPayment(null); setRefundReason(''); setReference(''); setFormAmount('');
  };
  const releaseDeposit = async () => {
    if (!selectedDeposit) return;
    const amount = Number(depositDeduction);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(selectedDeposit.collected_amount) || (amount > 0 && !refundReason.trim())) { notify(uiText('Enter a deduction within the collected deposit and explain the deduction.')); return; }
    await withSession(`/deposits/${selectedDeposit.id}/release`, { deduction: amount, reason: refundReason.trim() || null, method: paymentMethod, reference: reference.trim() || null }, 'Deposit settlement and manual refund recorded.');
    setSelectedDeposit(null); setRefundReason(''); setReference(''); setDepositDeduction('0');
  };
  const decidePayout = (payout: Payout, approved: boolean) => void withSession(`/payouts/${payout.id}/decision`, { approved }, approved ? 'Payout request approved.' : 'Payout request rejected.');
  const settlePayout = async () => {
    if (!selectedPayout) return;
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0) { notify(uiText('Enter a positive settlement amount.')); return; }
    await withSession(`/payouts/${selectedPayout.id}/settle`, { amount, method: paymentMethod, reference: reference.trim() || null, notes: description.trim() || null }, 'Manual payout settlement recorded.');
    setSelectedPayout(null); setFormAmount(''); setReference(''); setDescription('');
  };
  const recordPayment = async () => {
    const amount = Number(formAmount);
    if (!selectedBooking || !Number.isFinite(amount) || amount <= 0) { notify(uiText('Choose a booking and enter a positive amount.')); return; }
    await withSession('/payments/record', { booking_id: selectedBooking, amount, method: paymentMethod, payment_type: paymentType, reference: reference.trim() || null, notes: description.trim() || null }, 'Manual payment recorded and awaiting verification.');
    setShowForm(false); setFormAmount(''); setReference(''); setDescription(''); setSelectedBooking('');
  };
  const saveInstructions = async () => {
    await withSession(`/offices/${officeId}/payment-instructions`, instructions, 'Customer payment instructions saved.');
    setShowInstructions(false);
  };
  const createExpense = async () => {
    if (!supabase || admin || !officeUuid) return;
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !category.trim()) { notify(uiText('Enter an expense category and positive amount.')); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { notify(uiText('Sign in to record an office expense.')); return; }
    setSaving(true);
    const result = await supabase.from('office_expenses').insert({ office_id: officeUuid, created_by: user.id, category: category.trim(), description: description.trim() || null, amount, currency });
    setSaving(false);
    if (result.error) { notify(result.error.message); return; }
    setShowForm(false); setFormAmount(''); setDescription(''); await load(); notify(uiText('Office expense recorded.'));
  };

  const openProof = async (proof: Proof) => {
    if (!supabase) return;
    setProofBusy(proof.id);
    const { data, error: signError } = await supabase.storage.from('payment-proofs').createSignedUrl(proof.storage_path, 60);
    setProofBusy('');
    if (signError || !data?.signedUrl) { notify(uiText('Payment evidence could not be opened.')); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };
  const printReceipt = (payment: Payment) => {
    const html = `<header><div><div class="brand">MOTARA</div><div class="muted">Payment receipt · Manual payment</div></div><div>${safe(payment.id.toUpperCase())}<br>${safe(formatDate(payment.created_at, { dateStyle: 'medium' }))}</div></header><h1>Payment receipt</h1><p>Booking <b>${safe(shortId(payment.booking_id))}</b></p><table><tbody><tr><th>Type</th><td>${safe(pretty(payment.payment_type))}</td></tr><tr><th>Method</th><td>${safe(pretty(payment.payment_method))}</td></tr><tr><th>Status</th><td>${safe(pretty(payment.status))}</td></tr><tr><th>Reference</th><td>${safe(payment.reference || '—')}</td></tr></tbody></table><div class="total">Received: ${safe(money(Number(payment.amount), payment.currency))}</div><p class="muted">Manually verified by Motara office staff.</p>`;
    if (!printPage('Motara payment receipt', html)) notify(uiText('Allow pop-ups to print the receipt.'));
  };
  const issueInvoice = async (bookingId: string) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession(); if (!session) { notify(uiText('Sign in to issue an invoice.')); return; }
    try {
      const { invoice } = await api<{ invoice: { invoice_number: string; subtotal: number; tax_amount: number; total: number; currency: string; issued_at: string } }>(`/bookings/${bookingId}/invoice`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: '{}' });
      const item = bookings.find(row => row.id === bookingId);
      const html = `<header><div><div class="brand">MOTARA</div><div class="muted">Rental invoice</div></div><div>${safe(invoice.invoice_number)}<br>${safe(formatDate(invoice.issued_at, { dateStyle: 'medium' }))}</div></header><h1>Rental invoice</h1><p>Booking <b>${safe(item?.booking_number ?? shortId(bookingId))}</b> · ${safe(item?.profiles?.full_name ?? 'Customer')}</p><table><tbody><tr><th>Subtotal</th><td>${safe(money(Number(invoice.subtotal), invoice.currency))}</td></tr><tr><th>Tax</th><td>${safe(money(Number(invoice.tax_amount), invoice.currency))}</td></tr></tbody></table><div class="total">Invoice total: ${safe(money(Number(invoice.total), invoice.currency))}</div>`;
      if (!printPage(`Invoice ${invoice.invoice_number}`, html)) notify(uiText('Allow pop-ups to print the invoice.'));
      await load();
    } catch (failure) { notify(failure instanceof Error ? failure.message : 'Invoice could not be issued.'); }
  };
  const exportCsv = () => {
    const rows: Array<Array<string | number>> = tab === 'payments' ? [['id','booking','type','method','amount','currency','status','reference'], ...payments.map(row => [row.id,row.booking_id,row.payment_type,row.payment_method,row.amount,row.currency,row.status,row.reference ?? ''])]
      : tab === 'refunds' ? [['id','booking','payment','amount','currency','method','reference','reason','status'], ...refunds.map(row => [row.id,row.booking_id,row.payment_id,row.amount,row.currency,row.refund_method,row.manual_reference ?? '',row.reason,row.status])]
        : tab === 'commissions' ? [['id','booking','gross','commission','currency','status'], ...commissions.map(row => [row.id,row.booking_id,row.gross_amount,row.commission_amount,row.currency,row.status])]
          : tab === 'payouts' ? [['id','office','amount','currency','status','reference'], ...payouts.map(row => [row.id,row.office_id,row.amount,row.currency,row.status,row.reference ?? ''])]
            : tab === 'deposits' ? [['id','booking','expected','collected','deduction','currency','status'], ...deposits.map(row => [row.id,row.booking_id,row.amount,row.collected_amount,row.deduction_amount,row.currency,row.status])]
      : tab === 'reports' ? [['currency','collected','refunds','commissions','payouts','expenses','deposit collected','deposit refunded','deposit deductions'], ...report.map(row => [row.currency,row.collected,row.refunds,row.commissions,row.payouts,row.expenses,row.deposit_collected,row.deposit_refunded,row.deposit_deductions])]
                : tab === 'audit' ? [['date','actor','action','entity','entity id','office','before','after'], ...auditEvents.map(row => [row.created_at,row.actor_id ?? '',row.action,row.entity_type,row.entity_id ?? '',row.office_id ?? '',JSON.stringify(row.before_data ?? {}),JSON.stringify(row.after_data ?? {})])]
                : [['id','category','description','amount','currency','date'], ...expenses.map(row => [row.id,row.category,row.description ?? '',row.amount,row.currency,row.expense_date])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `motara-${tab}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const filtered = <T extends object>(rows: T[], text: (row: T) => string) => rows.filter(row => !query || text(row).toLowerCase().includes(query.toLowerCase()));
  const statusBadge = (value: string) => <span className={`status-pill ${value}`}>{pretty(value)}</span>;

  return <>
    <div className="stats-grid"><div className="stat-card"><div className="stat-label">{uiText('Payment records')}</div><div className="stat-value">{formatNumber(payments.length)}</div></div><div className="stat-card"><div className="stat-label">{uiText('Awaiting verification')}</div><div className="stat-value">{formatNumber(payments.filter(row => row.status === 'pending_verification').length)}</div></div><div className="stat-card"><div className="stat-label">{uiText('Commission records')}</div><div className="stat-value">{formatNumber(commissions.length)}</div></div><div className="stat-card"><div className="stat-label">{uiText('Manual refunds')}</div><div className="stat-value">{formatNumber(refunds.filter(row => row.status === 'completed').length)}</div></div></div>
    <div className="panel-card"><div className="panel-head"><div><h3>{admin ? 'Platform finance' : 'Office finance'}</h3><p>{uiText('Manual payment records, booking balances, deposits, refunds, commissions, and settlements.')}</p></div><div className="toolbar"><button className="quiet-button" onClick={exportCsv}><Download size={13} /> {uiText('Export CSV')}</button><button className="quiet-button" onClick={() => void load()}><RefreshCw size={13} /> {uiText('Refresh')}</button>{!admin&&tab==='payments'&&can('payments.record')&&<button className="btn btn-sm" onClick={()=>{setFormAmount('');setDescription('');setShowForm(true);}}>{uiText('Record payment')}</button>}{!admin&&tab==='payouts'&&can('finance.read')&&<button className="btn btn-sm" onClick={()=>{setFormAmount('');setDescription('');setShowForm(true);}}>{uiText('Request payout')}</button>}{!admin&&tab==='expenses'&&can('office.manage')&&<button className="btn btn-sm" onClick={()=>{setFormAmount('');setDescription('');setShowForm(true);}}>{uiText('Add expense')}</button>}{!admin&&tab==='instructions'&&can('office.manage')&&<button className="btn btn-sm" onClick={()=>setShowInstructions(true)}>{uiText('Edit instructions')}</button>}</div></div>
      <div className="toolbar" style={{ marginBottom: 12 }}><div className="tabs">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setQuery(''); }}>{item}</button>)}</div>{tab !== 'reports' && tab !== 'instructions' && <input className="search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${tab}`} />}</div>
      {error && <div className="empty-note" role="alert">{error}</div>}
      {tab === 'payments' && <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Payment')}</th><th>{uiText('Booking')}</th><th>{uiText('Type')}</th><th>{uiText('Method')}</th><th>{uiText('Amount')}</th><th>{uiText('Status')}</th><th>{uiText('Proof / receipt')}</th><th>{uiText('Actions')}</th></tr></thead><tbody>{filtered(payments,row=>`${row.id} ${row.booking_id} ${row.status} ${row.payment_method} ${row.reference}`).map(row=><tr key={row.id}><td><strong>{shortId(row.id)}</strong><small style={{display:'block'}}>{formatDateTime(row.created_at)}</small></td><td>{shortId(row.booking_id)}{can('invoices.issue')&&<button className="quiet-button" onClick={()=>void issueInvoice(row.booking_id)}><FileText size={12}/> {uiText('Invoice')}</button>}</td><td>{pretty(row.payment_type)}</td><td>{pretty(row.payment_method)}</td><td>{money(Number(row.amount),row.currency)}</td><td>{statusBadge(row.status)}</td><td><div className="toolbar">{row.payment_proofs?.map(proof=><button key={proof.id} className="quiet-button" disabled={proofBusy===proof.id} onClick={()=>void openProof(proof)}><Upload size={12}/>{proof.original_filename}</button>)}{['paid','partially_paid','partially_refunded','refunded'].includes(row.status)&&<button className="quiet-button" onClick={()=>printReceipt(row)}>{uiText('Receipt')}</button>}</div></td><td>{row.status==='pending_verification'&&can('payments.verify')&&<div className="toolbar"><button className="btn btn-sm" onClick={()=>verifyPayment(row,true)}>{uiText('Verify')}</button><button className="quiet-button" onClick={()=>verifyPayment(row,false)}>{uiText('Reject')}</button></div>}{['paid','partially_paid','partially_refunded'].includes(row.status)&&row.payment_type==='rental'&&can('refunds.manage')&&<button className="quiet-button" onClick={()=>{setSelectedPayment(row);setFormAmount('');setRefundReason('');setReference('');}}>{uiText('Manual refund')}</button>}</td></tr>)}</tbody></table>{!payments.length&&<div className="empty-note">{uiText('No manual payment records are available.')}</div>}</div>}
      {tab === 'refunds' && <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Refund')}</th><th>{uiText('Booking')}</th><th>{uiText('Payment')}</th><th>{uiText('Amount')}</th><th>{uiText('Method')}</th><th>{uiText('Reference')}</th><th>{uiText('Reason')}</th><th>{uiText('Status')}</th></tr></thead><tbody>{filtered(refunds,row=>`${row.id} ${row.booking_id} ${row.reason} ${row.status}`).map(row=><tr key={row.id}><td>{shortId(row.id)}</td><td>{shortId(row.booking_id)}</td><td>{shortId(row.payment_id)}</td><td>{money(Number(row.amount),row.currency)}</td><td>{pretty(row.refund_method)}</td><td>{row.manual_reference??'—'}</td><td>{row.reason}</td><td>{statusBadge(row.status)}</td></tr>)}</tbody></table>{!refunds.length&&<div className="empty-note">{uiText('No refunds have been manually recorded.')}</div>}</div>}
      {tab === 'commissions' && <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Commission')}</th><th>{uiText('Booking')}</th><th>{uiText('Gross amount')}</th><th>{uiText('Commission')}</th><th>{uiText('Status')}</th><th>{uiText('Date')}</th></tr></thead><tbody>{filtered(commissions,row=>`${row.id} ${row.booking_id} ${row.status}`).map(row=><tr key={row.id}><td>{shortId(row.id)}</td><td>{shortId(row.booking_id)}</td><td>{money(Number(row.gross_amount),row.currency)}</td><td>{money(Number(row.commission_amount),row.currency)}</td><td>{statusBadge(row.status)}</td><td>{formatDate(row.created_at, { dateStyle: 'medium' })}</td></tr>)}</tbody></table>{!commissions.length&&<div className="empty-note">{uiText('No commission statements yet.')}</div>}</div>}
      {tab === 'payouts' && <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Payout')}</th><th>{uiText('Office')}</th><th>{uiText('Amount')}</th><th>{uiText('Status')}</th><th>{uiText('Requested')}</th><th>{uiText('Reference / notes')}</th><th>{uiText('Manual settlement')}</th></tr></thead><tbody>{filtered(payouts,row=>`${row.id} ${row.office_id} ${row.status} ${row.notes}`).map(row=><tr key={row.id}><td>{shortId(row.id)}</td><td>{shortId(row.office_id)}</td><td>{money(Number(row.amount),row.currency)}</td><td>{statusBadge(row.status)}</td><td>{formatDate(row.requested_at, { dateStyle: 'medium' })}</td><td>{row.reference??row.notes??'—'}</td><td>{admin&&can('platform.manage')&&row.status==='requested'&&<div className="toolbar"><button className="btn btn-sm" onClick={()=>decidePayout(row,true)}>{uiText('Approve')}</button><button className="quiet-button" onClick={()=>decidePayout(row,false)}>{uiText('Reject')}</button></div>}{admin&&can('platform.manage')&&['approved','processing'].includes(row.status)&&<button className="quiet-button" onClick={()=>{setSelectedPayout(row);setFormAmount(String(row.amount));setPaymentMethod('bank_transfer');setReference('');setDescription('');}}>{uiText('Record settlement')}</button>}</td></tr>)}</tbody></table>{!payouts.length&&<div className="empty-note">{uiText('No payout requests are available.')}</div>}</div>}
      {tab === 'payouts' && <><h4 style={{ margin: '18px 0 8px' }}>{uiText('Payout settlement history')}</h4><div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Settlement')}</th><th>{uiText('Payout')}</th><th>{uiText('Amount')}</th><th>{uiText('Method')}</th><th>{uiText('Reference')}</th><th>{uiText('Notes')}</th><th>{uiText('Date')}</th></tr></thead><tbody>{filtered(payoutSettlements,row=>`${row.id} ${row.payout_id} ${row.payment_method} ${row.reference} ${row.notes}`).map(row=><tr key={row.id}><td>{shortId(row.id)}</td><td>{shortId(row.payout_id)}</td><td>{money(Number(row.amount),row.currency)}</td><td>{pretty(row.payment_method)}</td><td>{row.reference??'—'}</td><td>{row.notes??'—'}</td><td>{formatDateTime(row.settled_at)}</td></tr>)}</tbody></table>{!payoutSettlements.length&&<div className="empty-note">{uiText('No manual payout settlements have been recorded.')}</div>}</div></>}
      {tab === 'deposits' && <><div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Deposit')}</th><th>{uiText('Booking')}</th><th>{uiText('Expected')}</th><th>{uiText('Collected')}</th><th>{uiText('Deduction')}</th><th>{uiText('Status')}</th><th>{uiText('Action')}</th></tr></thead><tbody>{filtered(deposits,row=>`${row.id} ${row.booking_id} ${row.status} ${row.reason}`).map(row=><tr key={row.id}><td>{shortId(row.id)}</td><td>{shortId(row.booking_id)}</td><td>{money(Number(row.amount),row.currency)}</td><td>{money(Number(row.collected_amount),row.currency)}</td><td>{money(Number(row.deduction_amount),row.currency)}</td><td>{statusBadge(row.status)}</td><td>{can('deposits.manage')&&['held','partially_funded'].includes(row.status)&&Number(row.collected_amount)>0&&<button className="btn btn-sm" onClick={()=>{setSelectedDeposit(row);setDepositDeduction('0');setRefundReason('');setReference('');setPaymentMethod('bank_transfer');}}>{uiText('Settle / refund deposit')}</button>}</td></tr>)}</tbody></table>{!deposits.length&&<div className="empty-note">{uiText('No security deposits have been collected.')}</div>}</div><h4 style={{margin:'18px 0 8px'}}>{uiText('Deposit activity')}</h4><div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Deposit')}</th><th>{uiText('Activity')}</th><th>{uiText('Amount')}</th><th>{uiText('Method')}</th><th>{uiText('Reference / reason')}</th><th>{uiText('Date')}</th></tr></thead><tbody>{filtered(depositActivity,row=>`${row.deposit_id} ${row.transaction_type} ${row.reference} ${row.reason}`).map(row=><tr key={row.id}><td>{shortId(row.deposit_id)}</td><td>{pretty(row.transaction_type)}</td><td>{money(Number(row.amount),row.currency)}</td><td>{row.method?pretty(row.method):'—'}</td><td>{row.reference??row.reason??'—'}</td><td>{formatDate(row.created_at, { dateStyle: 'medium' })}</td></tr>)}</tbody></table>{!depositActivity.length&&<div className="empty-note">{uiText('No deposit collections or manual settlements recorded yet.')}</div>}</div></>}
      {tab === 'expenses' && <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Expense')}</th><th>{uiText('Category')}</th><th>{uiText('Description')}</th><th>{uiText('Amount')}</th><th>{uiText('Date')}</th></tr></thead><tbody>{filtered(expenses,row=>`${row.category} ${row.description} ${row.id}`).map(row=><tr key={row.id}><td>{shortId(row.id)}</td><td>{row.category}</td><td>{row.description??'—'}</td><td>{money(Number(row.amount),row.currency)}</td><td>{row.expense_date}</td></tr>)}</tbody></table>{!expenses.length&&<div className="empty-note">{uiText('No expenses have been recorded.')}</div>}</div>}
      {tab === 'reports' && <><div className="toolbar" style={{marginBottom:14}}><label className="field">{uiText("From")}<input type="date" value={dateFrom} onChange={event=>setDateFrom(event.target.value)}/></label><label className="field">{uiText("To")}<input type="date" value={dateTo} onChange={event=>setDateTo(event.target.value)}/></label><button className="quiet-button" onClick={()=>void load()}><RefreshCw size={13}/> {uiText('Run report')}</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Currency')}</th><th>{uiText('Collected')}</th><th>{uiText('Refunds')}</th><th>{uiText('Commissions')}</th><th>{uiText('Settled payouts')}</th><th>{uiText('Expenses')}</th><th>{uiText('Deposits collected')}</th><th>{uiText('Deposit refunds')}</th><th>{uiText('Deductions')}</th></tr></thead><tbody>{report.map(row=><tr key={row.currency}><td>{row.currency}</td><td>{money(Number(row.collected),row.currency)}</td><td>{money(Number(row.refunds),row.currency)}</td><td>{money(Number(row.commissions),row.currency)}</td><td>{money(Number(row.payouts),row.currency)}</td><td>{money(Number(row.expenses),row.currency)}</td><td>{money(Number(row.deposit_collected),row.currency)}</td><td>{money(Number(row.deposit_refunded),row.currency)}</td><td>{money(Number(row.deposit_deductions),row.currency)}</td></tr>)}</tbody></table>{!report.length&&<div className="empty-note">{uiText('No financial activity matches this period.')}</div>}</div></>}
      {tab === 'audit' && <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Date')}</th><th>{uiText('Action')}</th><th>{uiText('Entity')}</th><th>{uiText('Record')}</th><th>{uiText('Office')}</th><th>{uiText('Changes / details')}</th></tr></thead><tbody>{filtered(auditEvents,row=>`${row.action} ${row.entity_type} ${row.entity_id} ${row.office_id} ${JSON.stringify(row.after_data)}`).map(row=><tr key={row.id}><td>{formatDateTime(row.created_at)}</td><td><strong>{row.action}</strong></td><td>{pretty(row.entity_type)}</td><td>{shortId(row.entity_id)}</td><td>{shortId(row.office_id)}</td><td><small>{JSON.stringify(row.after_data ?? {})}</small></td></tr>)}</tbody></table>{!auditEvents.length&&<div className="empty-note">{uiText('No financial audit events are recorded.')}</div>}</div>}
      {tab === 'instructions' && <div className="form-grid"><div className="field"><label>{uiText('Cash payment instructions')}</label><div className="empty-note">{instructions.cash||'No cash instructions configured.'}</div></div><div className="field"><label>{uiText('Bank transfer instructions')}</label><div className="empty-note">{instructions.bank_transfer||'No bank transfer instructions configured.'}</div></div>{can('office.manage')&&<button className="btn btn-sm" onClick={()=>setShowInstructions(true)}>{uiText('Edit customer instructions')}</button>}</div>}
      {loading&&<div className="empty-note">{uiText('Refreshing financial records…')}</div>}
    </div>

    {showInstructions&&<div className="modal-backdrop" onClick={()=>setShowInstructions(false)}><section className="modal" role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>{uiText('Customer payment instructions')}</h2><p>{uiText('These details appear on each booking payment page.')}</p></div><button className="modal-close" onClick={()=>setShowInstructions(false)}>×</button></div><div className="form-grid"><div className="field full"><label>{uiText('Cash arrangements')}</label><textarea rows={3} maxLength={1500} value={instructions.cash} onChange={event=>setInstructions(current=>({...current,cash:event.target.value}))}/></div><div className="field full"><label>{uiText('Bank transfer details')}</label><textarea rows={4} maxLength={1500} value={instructions.bank_transfer} onChange={event=>setInstructions(current=>({...current,bank_transfer:event.target.value}))}/></div></div><button className="btn btn-block" disabled={saving} onClick={()=>void saveInstructions()}>{saving?'Saving…':'Save instructions'}</button></section></div>}
    {showForm&&<div className="modal-backdrop" onClick={()=>setShowForm(false)}><section className="modal" role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>{tab==='payments'?'Record a manual payment':tab==='payouts'?'Request an office payout':'Record an office expense'}</h2><p>{tab==='payments'?'Payment amount and balance are validated by the database.':tab==='payouts'?'The platform team will review this bank transfer request.':'Add an operating expense.'}</p></div><button className="modal-close" onClick={()=>setShowForm(false)}>×</button></div><div className="form-grid">
      {tab==='payments'&&<><div className="field full"><label>{uiText('Booking')}</label><select value={selectedBooking} onChange={event=>setSelectedBooking(event.target.value)}><option value="">{uiText('Choose a booking')}</option>{bookings.map(row=><option key={row.id} value={row.id}>{row.booking_number} · {row.profiles?.full_name??'Customer'} · {row.vehicles?row.vehicles.make+' '+row.vehicles.model:''} · {pretty(row.payment_status)}</option>)}</select></div><div className="field"><label>{uiText('Payment type')}</label><select value={paymentType} onChange={event=>setPaymentType(event.target.value as typeof paymentType)}><option value="rental">{uiText('Rental balance')}</option><option value="security_deposit">{uiText('Security deposit')}</option></select></div><div className="field"><label>{uiText('Method')}</label><select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">{uiText('Cash')}</option><option value="bank_transfer">{uiText('Bank transfer')}</option></select></div></>}
      {tab==='expenses'&&<div className="field full"><label>{uiText('Category')}</label><input value={category} onChange={event=>setCategory(event.target.value)}/></div>}
      <div className="field"><label>{uiText('Amount')}</label><input type="number" min="0.01" step="0.01" value={formAmount} onChange={event=>setFormAmount(event.target.value)}/></div>
      {tab!=='payments'&&<div className="field"><label>{uiText('Currency')}</label><select value={currency} onChange={event=>setCurrency(event.target.value)}><option>{uiText('USD')}</option><option>{uiText('SYP')}</option></select></div>}
      <div className="field full"><label>{tab==='payouts'?'Bank transfer destination':tab==='payments'?'Manual reference / notes':'Description or receipt reference'}</label><textarea rows={3} value={tab==='payments'?reference:description} onChange={event=>tab==='payments'?setReference(event.target.value):setDescription(event.target.value)}/></div>
      </div><button className="btn btn-block" disabled={saving} onClick={()=>void(tab==='payments'?recordPayment():tab==='expenses'?createExpense():withSession('/payouts/request',{office_id:officeUuid,amount:Number(formAmount),currency,destination:description.trim(),notes:description.trim()},'Payout request submitted for review.').then(()=>setShowForm(false)))}>{saving?'Saving…':tab==='payments'?'Record payment':tab==='expenses'?'Save expense':'Submit payout request'}</button></section></div>}

    {selectedPayment&&<div className="modal-backdrop" onClick={()=>setSelectedPayment(null)}><section className="modal" role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>{uiText('Record a manual refund')}</h2><p>{uiText("Payment")} {shortId(selectedPayment.id)} {uiText("· original")} {money(Number(selectedPayment.amount),selectedPayment.currency)}</p></div><button className="modal-close" onClick={()=>setSelectedPayment(null)}>×</button></div><div className="form-grid"><div className="field"><label>{uiText("Refund amount ·")} {selectedPayment.currency}</label><input type="number" min="0.01" max={selectedPayment.amount} step="0.01" value={formAmount} onChange={event=>setFormAmount(event.target.value)}/></div><div className="field"><label>{uiText('Refund method')}</label><select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">{uiText('Cash')}</option><option value="bank_transfer">{uiText('Bank transfer')}</option></select></div><div className="field full"><label>{uiText('Reason')}</label><textarea rows={3} value={refundReason} onChange={event=>setRefundReason(event.target.value)}/></div><div className="field full"><label>{uiText('Manual reference')}</label><input value={reference} onChange={event=>setReference(event.target.value)}/></div></div><button className="btn btn-block" disabled={saving} onClick={()=>void recordRefund()}>{saving?'Recording…':'Record refund'}</button></section></div>}

    {selectedDeposit&&<div className="modal-backdrop" onClick={()=>setSelectedDeposit(null)}><section className="modal" role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>{uiText('Settle security deposit')}</h2><p>{uiText("Booking")} {shortId(selectedDeposit.booking_id)} {uiText("· collected")} {money(Number(selectedDeposit.collected_amount),selectedDeposit.currency)}</p></div><button className="modal-close" onClick={()=>setSelectedDeposit(null)}>×</button></div><div className="form-grid"><div className="field"><label>{uiText("Deduction amount ·")} {selectedDeposit.currency}</label><input type="number" min="0" max={selectedDeposit.collected_amount} step="0.01" value={depositDeduction} onChange={event=>setDepositDeduction(event.target.value)}/></div><div className="field"><label>{uiText('Manual refund method')}</label><select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">{uiText('Cash')}</option><option value="bank_transfer">{uiText('Bank transfer')}</option></select></div><div className="field full"><label>{uiText('Reason for deduction')}</label><textarea rows={3} value={refundReason} onChange={event=>setRefundReason(event.target.value)} placeholder={uiText('Required when deducting funds')}/></div><div className="field full"><label>{uiText('Manual reference')}</label><input value={reference} onChange={event=>setReference(event.target.value)}/></div></div><button className="btn btn-block" disabled={saving} onClick={()=>void releaseDeposit()}>{saving?'Recording…':Number(depositDeduction)>0?'Record deduction and refund':'Record full manual refund'}</button></section></div>}

    {selectedPayout&&<div className="modal-backdrop" onClick={()=>setSelectedPayout(null)}><section className="modal" role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>{uiText('Record payout settlement')}</h2><p>{uiText("Approved payout")} {shortId(selectedPayout.id)} · {money(Number(selectedPayout.amount),selectedPayout.currency)}</p></div><button className="modal-close" onClick={()=>setSelectedPayout(null)}>×</button></div><div className="form-grid"><div className="field"><label>{uiText('Settlement amount')}</label><input type="number" min="0.01" max={selectedPayout.amount} step="0.01" value={formAmount} onChange={event=>setFormAmount(event.target.value)}/></div><div className="field"><label>{uiText('Method')}</label><select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="bank_transfer">{uiText('Bank transfer')}</option><option value="cash">{uiText('Cash')}</option></select></div><div className="field full"><label>{uiText('Bank / cash reference')}</label><input value={reference} onChange={event=>setReference(event.target.value)}/></div><div className="field full"><label>{uiText('Notes')}</label><textarea rows={2} value={description} onChange={event=>setDescription(event.target.value)}/></div></div><button className="btn btn-block" disabled={saving} onClick={()=>void settlePayout()}>{saving?'Saving…':'Record settlement'}</button></section></div>}
  </>;
}
