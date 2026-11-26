import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Building2, Check, Pencil, Plus, Search, X } from 'lucide-react';
import { supabase } from './lib/supabase';

type OfficeRow = { id: string; name: string; slug: string; status: string; city_id: string | null; owner_id: string; address: string; phone: string | null; email: string | null; commission_rate: number; created_at: string };
type UserRow = { id: string; full_name: string | null; email: string | null };
type CityRow = { id: string; name: string };
type OfficeForm = { name: string; slug: string; cityId: string; address: string; phone: string; email: string; ownerId: string };
const emptyForm: OfficeForm = { name: '', slug: '', cityId: '', address: '', phone: '', email: '', ownerId: '' };
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AdminOfficeManagement({ notify }: { notify: (message: string) => void }) {
  const [offices, setOffices] = useState<OfficeRow[]>([]); const [users, setUsers] = useState<UserRow[]>([]); const [cities, setCities] = useState<CityRow[]>([]);
  const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState('all'); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<OfficeRow | null>(null); const [form, setForm] = useState<OfficeForm>(emptyForm); const [saving, setSaving] = useState(false);
  const cityName = useMemo(() => new Map(cities.map(city => [city.id, city.name])), [cities]);
  const ownerName = useMemo(() => new Map(users.map(user => [user.id, user.full_name || user.email || 'Account'])), [users]);

  const load = useCallback(async () => {
    if (!supabase) { setError('Connect Supabase and sign in as an admin to manage office applications.'); return; }
    setLoading(true); setError('');
    const [officeResult, userResult, cityResult] = await Promise.all([
      supabase.from('rental_offices').select('id,name,slug,status,city_id,owner_id,address,phone,email,commission_rate,created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email').order('full_name'),
      supabase.from('cities').select('id,name').eq('is_active', true).order('name'),
    ]);
    if (officeResult.error) setError(officeResult.error.message);
    else setOffices((officeResult.data ?? []) as OfficeRow[]);
    if (userResult.data) setUsers(userResult.data as UserRow[]);
    if (cityResult.data) setCities(cityResult.data as CityRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, cityId: cities[0]?.id ?? '', ownerId: users[0]?.id ?? '' }); setShowForm(true); };
  const openEdit = (office: OfficeRow) => { setEditing(office); setForm({ name: office.name, slug: office.slug, cityId: office.city_id ?? '', address: office.address, phone: office.phone ?? '', email: office.email ?? '', ownerId: office.owner_id }); setShowForm(true); };

  const save = async () => {
    if (!supabase) return;
    if (!form.name.trim() || !form.slug.trim() || !form.cityId || (!editing && !form.ownerId)) { notify('Enter an office name, URL slug, city, and owner.'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), slug: slugify(form.slug), city_id: form.cityId, address: form.address.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null };
      if (editing) {
        const { error: updateError } = await supabase.from('rental_offices').update(payload).eq('id', editing.id);
        if (updateError) throw updateError;
      } else {
        const { error: createError } = await supabase.rpc('create_platform_office', {
          p_name: payload.name, p_slug: payload.slug, p_city_id: payload.city_id, p_address: payload.address,
          p_phone: payload.phone, p_email: payload.email, p_owner_id: form.ownerId,
        });
        if (createError) throw createError;
      }
      setShowForm(false); await load(); notify(editing ? 'Office details updated.' : 'Office application created and linked to its owner.');
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : 'Office could not be saved.'); }
    finally { setSaving(false); }
  };

  const setStatus = async (office: OfficeRow, status: 'approved' | 'rejected' | 'suspended' | 'pending') => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from('rental_offices').update({ status, verified_at: status === 'approved' ? new Date().toISOString() : null }).eq('id', office.id);
    if (updateError) { notify(updateError.message); return; }
    setOffices(current => current.map(item => item.id === office.id ? { ...item, status } : item));
    notify(`${office.name} ${status}.`);
  };

  const visible = offices.filter(office => (statusFilter === 'all' || office.status === statusFilter) && `${office.name} ${office.slug} ${cityName.get(office.city_id ?? '') ?? ''} ${ownerName.get(office.owner_id) ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="panel-card">
      <div className="panel-head"><div><h3>Rental offices</h3><p>Review applications, verify offices, and control account status.</p></div><button className="btn btn-sm" onClick={openCreate}><Plus size={14} /> Create office</button></div>
      <div className="toolbar" style={{ marginBottom: 12 }}><label style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Search size={13} /><input className="search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search office, city, or owner" /></label><select className="input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></div>
      {error && <div className="empty-note" role="alert">{error}</div>}
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Office</th><th>City</th><th>Owner</th><th>Commission</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map(office => <tr key={office.id}><td><strong>{office.name}</strong><small style={{ display: 'block', color: '#8a958e', marginTop: 3 }}>/{office.slug} · {office.address || 'Address not added'}</small></td><td>{cityName.get(office.city_id ?? '') ?? '—'}</td><td>{ownerName.get(office.owner_id) ?? 'Owner account'}</td><td>{(Number(office.commission_rate) * 100).toFixed(1)}%</td><td><span className={`status-pill ${office.status}`}>{office.status}</span></td><td><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><button className="quiet-button" onClick={() => openEdit(office)} aria-label={`Edit ${office.name}`}><Pencil size={14} /></button>{office.status === 'pending' && <><button className="btn btn-sm" onClick={() => void setStatus(office, 'approved')}><Check size={13} /> Approve</button><button className="quiet-button" onClick={() => void setStatus(office, 'rejected')} aria-label={`Reject ${office.name}`}><X size={14} /></button></>}{office.status === 'approved' && <button className="quiet-button" onClick={() => void setStatus(office, 'suspended')}><Ban size={14} /> Suspend</button>}{(office.status === 'suspended' || office.status === 'rejected') && <button className="btn btn-sm" onClick={() => void setStatus(office, 'approved')}><Check size={13} /> Activate</button>}</div></td></tr>)}</tbody></table>{loading && <div className="empty-note">Loading office records…</div>}{!loading && !error && !visible.length && <div className="empty-note"><Building2 size={17} /> No offices match this filter.</div>}</div>
    </div>
    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="office-form-title" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2 id="office-form-title">{editing ? 'Edit office' : 'Create office'}</h2><p>{editing ? 'Update the office profile.' : 'New applications begin as pending review.'}</p></div><button className="modal-close" onClick={() => setShowForm(false)} aria-label="Close"><X size={15} /></button></div><div className="form-grid"><div className="field"><label>Office name</label><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value, slug: editing ? current.slug : slugify(event.target.value) }))} required /></div><div className="field"><label>URL slug</label><input value={form.slug} onChange={event => setForm(current => ({ ...current, slug: slugify(event.target.value) }))} required /></div><div className="field"><label>City</label><select value={form.cityId} onChange={event => setForm(current => ({ ...current, cityId: event.target.value }))}><option value="">Select city</option>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></div>{!editing && <div className="field"><label>Office owner</label><select value={form.ownerId} onChange={event => setForm(current => ({ ...current, ownerId: event.target.value }))}><option value="">Select account</option>{users.map(user => <option key={user.id} value={user.id}>{user.full_name || user.email || user.id}</option>)}</select></div>}<div className="field full"><label>Address</label><input value={form.address} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} /></div><div className="field"><label>Phone</label><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></div><div className="field"><label>Email</label><input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></div></div><button className="btn btn-block" style={{ marginTop: 17 }} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create pending office'}</button></section></div>}
  </>;
}
