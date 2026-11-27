import { useCallback, useEffect, useState } from 'react';
import { FileText, Printer, RefreshCw, Upload } from 'lucide-react';
import type { Booking } from './lib/domain';
import { api, supabase } from './lib/supabase';
import { formatCurrency, formatDate, formatDateTime, uiText } from './lib/locale';

type PaymentProof = { id: string; storage_path: string; original_filename: string; mime_type: string; byte_size: number; created_at: string };
type PaymentRow = { id: string; payment_method: string; payment_type: string; amount: number; currency: string; status: string; reference: string | null; created_at: string; payment_proofs?: PaymentProof[] };
type RefundRow = { id: string; payment_id: string; amount: number; currency: string; reason: string; status: string; refund_method: string; manual_reference: string | null; created_at: string };
type FinanceResponse = {
  booking: { id: string; booking_number: string; status: string; currency: string; total_amount: number; deposit_amount: number };
  summary: { total: number; currency: string; payment_status: string; paid: number; refunded: number; pending_verification: number; outstanding: number; deposit_due: number; deposit_collected: number; deposit_outstanding: number; deposit_status: string };
  instructions: { cash?: string; bank_transfer?: string };
  office_name: string;
  payments: PaymentRow[];
  refunds: RefundRow[];
  deposit: { id: string; amount: number; collected_amount: number; deduction_amount: number; currency: string; status: string; reason: string | null } | null;
  deposit_transactions: Array<{ id: string; transaction_type: string; amount: number; currency: string; method: string | null; reference: string | null; reason: string | null; created_at: string }>;
};

const money = (amount: number, currency: string) => formatCurrency(amount, currency);
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

function printDocument(title: string, body: string) {
  const page = window.open('', '_blank');
  if (!page) return false;
  page.document.write(`<!doctype html><html><head><title>${safe(title)}</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#17231b;margin:48px;max-width:780px}header{display:flex;justify-content:space-between;border-bottom:2px solid #243c2c;padding-bottom:20px;margin-bottom:28px}.brand{font-size:22px;font-weight:800;letter-spacing:1px}.muted{color:#607066}.summary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}.box{border:1px solid #dbe3dc;padding:14px;border-radius:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5eae5}th{background:#f4f7f3}.total{font-weight:bold;font-size:17px;text-align:right;margin-top:22px}@media print{body{margin:16mm}}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`);
  page.document.close();
  return true;
}

export default function CustomerPaymentCenter({ bookings, sessionEmail, notify }: { bookings: Booking[]; sessionEmail: string; notify: (message: string) => void }) {
  if (!sessionEmail) return <div className="panel-card"><h3>{uiText('Sign in to view payments')}</h3><p>{uiText('Your booking balances, payment instructions, uploaded proofs, and receipts are private to your account.')}</p></div>;
  if (!supabase) return <div className="panel-card"><h3>{uiText('Payment history')}</h3><p>{uiText('Connect Rentora to Supabase to securely manage payment records. Demo mode does not save real payment data.')}</p></div>;
  if (!bookings.length) return <div className="panel-card"><h3>{uiText('Payment history')}</h3><p>{uiText('No booking payments yet. Once you request a car, the office will share its payment instructions here.')}</p></div>;
  return <div style={{ display: 'grid', gap: 14 }}>{bookings.map(booking => <BookingPaymentCard key={booking.id} bookingId={booking.id} booking={booking} notify={notify} />)}</div>;
}

function BookingPaymentCard({ bookingId, booking, notify }: { bookingId: string; booking: Booking; notify: (message: string) => void }) {
  const [finance, setFinance] = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [type, setType] = useState<'rental' | 'security_deposit'>('rental');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [proofBusy, setProofBusy] = useState('');
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await api<FinanceResponse>(`/bookings/${bookingId}/finance`, { headers: { authorization: `Bearer ${session.access_token}` } });
      setFinance(result);
      setAmount(String(type === 'rental' ? result.summary.outstanding : result.summary.deposit_outstanding));
    } catch (error) { notify(error instanceof Error ? error.message : 'Payment history could not be loaded.'); }
    finally { setLoading(false); }
  }, [bookingId, notify, type]);
  useEffect(() => { void load(); }, [load]);

  const requestPayment = async () => {
    if (!supabase || !finance) return;
    const value = Number(amount);
    const cap = type === 'rental' ? finance.summary.outstanding : finance.summary.deposit_outstanding;
    if (!Number.isFinite(value) || value <= 0 || value > cap) { notify(`Enter an amount between 0.01 and ${money(cap, finance.booking.currency)}.`); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { notify(uiText('Sign in before requesting a payment.')); return; }
    setSaving(true);
    try {
      const result = await api<{ payment: PaymentRow }>(`/payments/manual`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ booking_id: bookingId, method, amount: value, payment_type: type, reference: reference.trim() || undefined }) });
      notify(`Manual payment request ${result.payment.id.slice(0, 8)} is awaiting office verification.`);
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : 'Payment request could not be recorded.'); }
    finally { setSaving(false); }
  };

  const uploadProof = async (payment: PaymentRow, file?: File) => {
    if (!supabase || !file) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { notify(uiText('Sign in before uploading payment proof.')); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) { notify(uiText('Upload a JPG, PNG, WebP, or PDF file up to 10 MB.')); return; }
    setProofBusy(payment.id);
    const filename = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-160) || 'payment-proof';
    const path = `${session.user.id}/${payment.id}/${crypto.randomUUID()}_${filename}`;
    try {
      const upload = await supabase.storage.from('payment-proofs').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      await api(`/payments/${payment.id}/proofs`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ storage_path: path, original_filename: file.name.slice(0, 180), mime_type: file.type, byte_size: file.size }) });
      notify(uiText('Payment proof uploaded securely. The office can now verify the transfer.'));
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : 'Payment proof could not be uploaded.'); }
    finally { setProofBusy(''); }
  };

  const viewProof = async (proof: PaymentProof) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(proof.storage_path, 60);
    if (error || !data?.signedUrl) { notify(uiText('Payment proof could not be opened.')); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const printReceipt = (payment: PaymentRow) => {
    if (!finance) return;
    const body = `<header><div><div class="brand">RENTORA</div><div class="muted">DRIVE YOUR WAY · Payment receipt</div></div><div><b>Receipt</b><br>${safe(payment.id.toUpperCase())}<br>${safe(formatDate(payment.created_at, { dateStyle: 'medium' }))}</div></header><h1>Payment receipt</h1><p>Booking <b>${safe(finance.booking.booking_number)}</b> · ${safe(finance.office_name)}</p><div class="summary"><div class="box">Payment method<br><b>${safe(label(payment.payment_method))}</b></div><div class="box">Payment type<br><b>${safe(label(payment.payment_type))}</b></div><div class="box">Status<br><b>${safe(label(payment.status))}</b></div><div class="box">Payment reference<br><b>${safe(payment.reference || payment.id.slice(0, 8).toUpperCase())}</b></div></div><div class="total">Received: ${safe(money(Number(payment.amount), payment.currency))}</div><p class="muted">This receipt records a manually verified payment. Keep it with your rental agreement.</p>`;
    if (!printDocument(`Rentora receipt ${payment.id}`, body)) notify(uiText('Allow pop-ups to print this receipt.'));
  };

  const issueInvoice = async () => {
    if (!supabase || !finance) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { notify(uiText('Sign in to issue this invoice.')); return; }
    setInvoiceBusy(true);
    try {
      const { invoice } = await api<{ invoice: { invoice_number: string; subtotal: number; tax_amount: number; total: number; currency: string; issued_at: string } }>(`/bookings/${bookingId}/invoice`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: '{}' });
      const body = `<header><div><div class="brand">RENTORA</div><div class="muted">DRIVE YOUR WAY · Rental invoice</div></div><div><b>${safe(invoice.invoice_number)}</b><br>${safe(formatDate(invoice.issued_at, { dateStyle: 'medium' }))}</div></header><h1>Rental invoice</h1><p>Booking <b>${safe(finance.booking.booking_number)}</b> · ${safe(finance.office_name)}</p><div class="summary"><div class="box">Rental dates<br><b>${safe(booking.start)} – ${safe(booking.end)}</b></div><div class="box">Vehicle<br><b>${safe(booking.vehicleId)}</b></div></div><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>Rental and configured booking charges</td><td>${safe(money(Number(invoice.subtotal), invoice.currency))}</td></tr><tr><td>Tax</td><td>${safe(money(Number(invoice.tax_amount), invoice.currency))}</td></tr></tbody></table><div class="total">Invoice total: ${safe(money(Number(invoice.total), invoice.currency))}<br><small>Paid ${safe(money(finance.summary.paid, invoice.currency))} · Outstanding ${safe(money(finance.summary.outstanding, invoice.currency))}</small></div>`;
      if (!printDocument(`Rentora invoice ${invoice.invoice_number}`, body)) notify(uiText('Allow pop-ups to print this invoice.'));
    } catch (error) { notify(error instanceof Error ? error.message : 'Invoice could not be issued.'); }
    finally { setInvoiceBusy(false); }
  };

  if (loading) return <div className="panel-card">{uiText('Loading secure payment records…')}</div>;
  if (!finance) return <div className="panel-card"><div className="panel-head"><div><h3>{uiText("Booking")} {booking.number ?? booking.id}</h3><p>{uiText('Payment records are unavailable until the booking finance workspace loads.')}</p></div><button className="quiet-button" onClick={() => void load()}><RefreshCw size={13} /> {uiText('Retry')}</button></div></div>;
  const summary = finance.summary;
  const canRequest = !['cancelled','rejected'].includes(finance.booking.status);
  return <article className="panel-card">
    <div className="panel-head"><div><h3>{uiText("Booking")} {finance.booking.booking_number}</h3><p>{finance.office_name} · {booking.start} – {booking.end}</p></div><span className={`status-pill ${summary.payment_status}`}>{label(summary.payment_status)}</span></div>
    <div className="stats-grid"><div className="stat-card"><div className="stat-label">{uiText('Booking total')}</div><div className="stat-value">{money(Number(summary.total), summary.currency)}</div></div><div className="stat-card"><div className="stat-label">{uiText('Paid')}</div><div className="stat-value">{money(Number(summary.paid), summary.currency)}</div></div><div className="stat-card"><div className="stat-label">{uiText('Outstanding')}</div><div className="stat-value">{money(Number(summary.outstanding), summary.currency)}</div></div><div className="stat-card"><div className="stat-label">{uiText('Pending verification')}</div><div className="stat-value">{money(Number(summary.pending_verification), summary.currency)}</div></div></div>
    <div className="form-grid" style={{ margin: '16px 0' }}><div className="field"><label>{uiText('Cash payment instructions')}</label><div className="empty-note">{finance.instructions.cash || 'Contact the office for cash payment arrangements.'}</div></div><div className="field"><label>{uiText('Bank transfer instructions')}</label><div className="empty-note">{finance.instructions.bank_transfer || 'Contact the office for bank account details.'}</div></div></div>
    {canRequest && <div className="panel-card" style={{ background: '#f8faf7', marginBottom: 14 }}><div className="panel-head"><div><h4>{uiText('Record a manual payment')}</h4><p>{uiText('Choose a partial or full amount. Payment status changes only after office verification.')}</p></div></div><div className="form-grid"><div className="field"><label>{uiText('Payment for')}</label><select value={type} onChange={event => { const next = event.target.value as typeof type; setType(next); setAmount(String(next === 'rental' ? summary.outstanding : summary.deposit_outstanding)); }}><option value="rental">{uiText("Rental balance · due")} {money(Number(summary.outstanding), summary.currency)}</option>{Number(summary.deposit_due) > 0 && <option value="security_deposit">{uiText("Security deposit · due")} {money(Number(summary.deposit_outstanding), summary.currency)}</option>}</select></div><div className="field"><label>{uiText('Payment method')}</label><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="cash">{uiText('Cash')}</option><option value="bank_transfer">{uiText('Bank transfer')}</option></select></div><div className="field"><label>{uiText("Amount ·")} {summary.currency}</label><input type="number" min="0.01" max={type === 'rental' ? summary.outstanding : summary.deposit_outstanding} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></div>{method === 'bank_transfer' && <div className="field"><label>{uiText('Transfer reference · optional')}</label><input value={reference} maxLength={160} onChange={event => setReference(event.target.value)} placeholder={uiText('Bank receipt or transfer number')} /></div>}<div className="field" style={{ alignSelf: 'end' }}><button className="btn" disabled={saving || Number(type === 'rental' ? summary.outstanding : summary.deposit_outstanding) <= 0} onClick={() => void requestPayment()}>{saving ? 'Recording…' : 'Submit payment details'}</button></div></div></div>}
    <div className="panel-head"><div><h4>{uiText('Payment history')}</h4><p>{uiText('Every recorded amount and verification is linked to this booking.')}</p></div><div className="toolbar"><button className="quiet-button" onClick={() => void load()}><RefreshCw size={13} /> {uiText('Refresh')}</button><button className="btn btn-sm" disabled={invoiceBusy} onClick={() => void issueInvoice()}><FileText size={13} /> {invoiceBusy ? 'Preparing…' : 'Issue / print invoice'}</button></div></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Payment')}</th><th>{uiText('Type')}</th><th>{uiText('Method')}</th><th>{uiText('Amount')}</th><th>{uiText('Status')}</th><th>{uiText('Proof / receipt')}</th></tr></thead><tbody>{finance.payments.map(payment => <tr key={payment.id}><td><strong>{payment.id.slice(0, 8).toUpperCase()}</strong><small style={{ display: 'block' }}>{new Date(payment.created_at).toLocaleString()}</small></td><td>{label(payment.payment_type)}</td><td>{label(payment.payment_method)}</td><td>{money(Number(payment.amount), payment.currency)}</td><td><span className={`status-pill ${payment.status}`}>{label(payment.status)}</span></td><td><div className="toolbar">{payment.payment_proofs?.map(proof => <button key={proof.id} className="quiet-button" onClick={() => void viewProof(proof)}>{proof.original_filename}</button>)}{payment.status === 'pending_verification' && <label className="quiet-button" style={{ cursor: proofBusy === payment.id ? 'wait' : 'pointer' }}><Upload size={13} /> {proofBusy === payment.id ? 'Uploading…' : 'Upload proof'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={proofBusy === payment.id} style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; void uploadProof(payment, file); event.currentTarget.value = ''; }} /></label>}{['paid','partially_paid','partially_refunded','refunded'].includes(payment.status) && <button className="quiet-button" onClick={() => printReceipt(payment)}><Printer size={13} /> {uiText('Receipt')}</button>}</div></td></tr>)}</tbody></table>{finance.payments.length === 0 && <div className="empty-note">{uiText('No payment transactions have been recorded for this booking.')}</div>}</div>
    {finance.refunds.length > 0 && <><h4 style={{ margin: '18px 0 8px' }}>{uiText('Refund history')}</h4><div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Refund')}</th><th>{uiText('Amount')}</th><th>{uiText('Method')}</th><th>{uiText('Reason')}</th><th>{uiText('Status')}</th></tr></thead><tbody>{finance.refunds.map(refund => <tr key={refund.id}><td>{refund.id.slice(0, 8).toUpperCase()}</td><td>{money(Number(refund.amount), refund.currency)}</td><td>{label(refund.refund_method)}</td><td>{refund.reason}</td><td><span className={`status-pill ${refund.status}`}>{label(refund.status)}</span></td></tr>)}</tbody></table></div></>}
    {finance.deposit && <><div className="empty-note" style={{ marginTop: 14 }}>{uiText("Security deposit:")} {money(Number(summary.deposit_collected), summary.currency)} {uiText("collected of")} {money(Number(summary.deposit_due), summary.currency)} · {label(summary.deposit_status)}{finance.deposit.reason ? ` · ${finance.deposit.reason}` : ''}</div>{finance.deposit_transactions.length > 0 && <div className="table-wrap" style={{ marginTop: 8 }}><table className="data-table"><thead><tr><th>{uiText('Deposit activity')}</th><th>{uiText('Amount')}</th><th>{uiText('Method')}</th><th>{uiText('Reference / reason')}</th><th>{uiText('Date')}</th></tr></thead><tbody>{finance.deposit_transactions.map(transaction => <tr key={transaction.id}><td>{label(transaction.transaction_type)}</td><td>{money(Number(transaction.amount), transaction.currency)}</td><td>{transaction.method ? label(transaction.method) : '—'}</td><td>{transaction.reference ?? transaction.reason ?? '—'}</td><td>{new Date(transaction.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</>}
  </article>;
}
