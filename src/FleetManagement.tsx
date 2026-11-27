import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { CarFront, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { getOffice, money, type Vehicle } from './lib/domain';
import { supabase } from './lib/supabase';
import { formatCurrency, formatNumber, uiText } from './lib/locale';

type Props = { officeId: string; fleet: Vehicle[]; setFleet: Dispatch<SetStateAction<Vehicle[]>>; notify: (message: string) => void };
type Category = { id: string; name: string };
type VehicleRecord = {
  id: string; slug: string; make: string; model: string; model_year: number; category_id: string | null;
  transmission: string; fuel_type: string; seating_capacity: number; daily_rate: number; weekly_rate: number | null;
  monthly_rate: number | null; deposit_amount: number; daily_rate_syp?: number | null; weekly_rate_syp?: number | null; monthly_rate_syp?: number | null; deposit_amount_syp?: number | null; mileage_limit_daily: number | null; color: string | null;
  status: string; is_published: boolean; vehicle_categories?: { name: string } | null;
  rental_offices?: { slug: string; name: string } | null;
  vehicle_images?: Array<{ storage_path: string; is_primary: boolean; sort_order: number }>;
};
type FormState = {
  make: string; model: string; year: string; categoryId: string; transmission: string; fuel: string;
  seats: string; daily: string; weekly: string; monthly: string; deposit: string; dailySyp: string; weeklySyp: string; monthlySyp: string; depositSyp: string; mileage: string;
  description: string; status: 'draft' | 'available' | 'maintenance' | 'rented';
};

const blankForm = (): FormState => ({ make: '', model: '', year: String(new Date().getFullYear()), categoryId: '', transmission: 'automatic', fuel: 'petrol', seats: '5', daily: '', weekly: '', monthly: '', deposit: '0', dailySyp: '', weeklySyp: '', monthlySyp: '', depositSyp: '0', mileage: '250', description: '', status: 'draft' });
const demoCategories: Category[] = [{ id: 'Economy', name: 'Economy' }, { id: 'Comfort', name: 'Comfort' }, { id: 'SUV', name: 'SUV' }, { id: 'Premium', name: 'Premium' }, { id: 'Van', name: 'Van' }];
const slugify = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function fromRecord(row: VehicleRecord): Vehicle {
  const image = row.vehicle_images?.slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)[0];
  const imageUrl = image && supabase ? supabase.storage.from('vehicle-images').getPublicUrl(image.storage_path).data.publicUrl : undefined;
  const officeId = row.rental_offices?.slug ?? '';
  const office = getOffice(officeId);
  return {
    id: row.id, name: `${row.make} ${row.model}`, make: row.make, model: row.model, year: row.model_year,
    category: row.vehicle_categories?.name ?? 'Other', transmission: row.transmission === 'manual' ? 'Manual' : 'Automatic',
    fuel: (row.fuel_type.charAt(0).toUpperCase() + row.fuel_type.slice(1)) as Vehicle['fuel'], seats: row.seating_capacity,
    price: Number(row.daily_rate), weeklyPrice: row.weekly_rate ? Number(row.weekly_rate) : undefined,
    monthlyPrice: row.monthly_rate ? Number(row.monthly_rate) : undefined, deposit: Number(row.deposit_amount),
    dailyPriceSyp: row.daily_rate_syp == null ? undefined : Number(row.daily_rate_syp), weeklyPriceSyp: row.weekly_rate_syp == null ? undefined : Number(row.weekly_rate_syp), monthlyPriceSyp: row.monthly_rate_syp == null ? undefined : Number(row.monthly_rate_syp), depositSyp: Number(row.deposit_amount_syp ?? 0),
    officeId, officeName: row.rental_offices?.name ?? office.name, city: office.city, rating: 0, reviews: 0,
    color: row.color ?? '#e5eae5', imageUrl, available: row.status === 'available' && row.is_published, status: row.status as Vehicle['status'],
    mileage: `${row.mileage_limit_daily ?? 250} km/day included`,
  };
}

export default function FleetManagementPage({ officeId, fleet, setFleet, notify }: Props) {
  const [officeUuid, setOfficeUuid] = useState('');
  const [officeName, setOfficeName] = useState('Rental office');
  const [categories, setCategories] = useState<Category[]>(demoCategories);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const officeFleet = useMemo(() => fleet.filter(vehicle => vehicle.officeId === officeId), [fleet, officeId]);

  const loadOfficeFleet = useCallback(async () => {
    if (!supabase) return;
    if (!officeId) { setLoadError('Sign in with an office account to load its fleet.'); return; }
    const { data: office, error: officeError } = await supabase.from('rental_offices').select('id,name').eq('slug', officeId).maybeSingle();
    if (officeError || !office) { setLoadError(officeError?.message ?? 'This account is not linked to an office.'); return; }
    setOfficeUuid(office.id); setOfficeName(office.name);
    const [vehicleResult, categoryResult] = await Promise.all([
      supabase.from('vehicles').select('id,slug,make,model,model_year,category_id,transmission,fuel_type,seating_capacity,daily_rate,weekly_rate,monthly_rate,deposit_amount,daily_rate_syp,weekly_rate_syp,monthly_rate_syp,deposit_amount_syp,mileage_limit_daily,color,status,is_published,vehicle_categories(name),rental_offices(slug,name),vehicle_images(storage_path,is_primary,sort_order)').eq('office_id', office.id).order('created_at', { ascending: false }),
      supabase.from('vehicle_categories').select('id,name').eq('is_active', true).order('sort_order'),
    ]);
    if (vehicleResult.error) { setLoadError(vehicleResult.error.message); return; }
    setLoadError('');
    if (categoryResult.data?.length) setCategories(categoryResult.data as Category[]);
    const mapped = ((vehicleResult.data ?? []) as unknown as VehicleRecord[]).map(fromRecord);
    setFleet(current => [...current.filter(vehicle => vehicle.officeId !== officeId), ...mapped]);
  }, [officeId, setFleet]);

  useEffect(() => { void loadOfficeFleet(); }, [loadOfficeFleet]);

  const openNew = () => { setEditing(null); setForm(blankForm()); setPhotos([]); setShowForm(true); };
  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setForm({ make: vehicle.make, model: vehicle.model, year: String(vehicle.year), categoryId: categories.find(category => category.name === vehicle.category)?.id ?? '', transmission: vehicle.transmission.toLowerCase(), fuel: vehicle.fuel.toLowerCase(), seats: String(vehicle.seats), daily: String(vehicle.price), weekly: String(vehicle.weeklyPrice ?? ''), monthly: String(vehicle.monthlyPrice ?? ''), deposit: String(vehicle.deposit), dailySyp: String(vehicle.dailyPriceSyp ?? ''), weeklySyp: String(vehicle.weeklyPriceSyp ?? ''), monthlySyp: String(vehicle.monthlyPriceSyp ?? ''), depositSyp: String(vehicle.depositSyp ?? 0), mileage: vehicle.mileage.match(/\d+/)?.[0] ?? '250', description: '', status: vehicle.status === 'rented' ? 'rented' : vehicle.status === 'maintenance' ? 'maintenance' : vehicle.available ? 'available' : 'draft' });
    setPhotos([]); setShowForm(true);
  };

  const save = async () => {
    const daily = Number(form.daily); const year = Number(form.year); const seats = Number(form.seats);
    const optionalRates = [form.weekly, form.monthly, form.deposit, form.dailySyp, form.weeklySyp, form.monthlySyp, form.depositSyp].filter(value => value.trim() !== '').map(Number);
    const hasInvalidOptionalRate = optionalRates.some(value => !Number.isFinite(value) || value < 0);
    const hasInvalidSypPrecision = [form.dailySyp, form.weeklySyp, form.monthlySyp, form.depositSyp].some(value => value.trim() !== '' && !Number.isInteger(Number(value)));
    if (!form.make.trim() || !form.model.trim() || form.dailySyp.trim() === '' || !Number.isInteger(year) || year < 1950 || year > 2100 || !Number.isFinite(daily) || daily < 0 || !Number.isInteger(seats) || seats < 1 || seats > 20 || hasInvalidOptionalRate || hasInvalidSypPrecision) {
      notify(uiText('Enter valid vehicle details and both daily prices in USD and SYP. SYP prices must be whole numbers.')); return;
    }
    setSaving(true);
    try {
      if (supabase) {
        if (!officeUuid) throw new Error('The office workspace is not ready yet. Refresh the fleet list and try again.');
        const category = categories.find(item => item.id === form.categoryId);
        const payload = {
          office_id: officeUuid, category_id: category?.id ?? null, make: form.make.trim(), model: form.model.trim(), model_year: year,
          slug: slugify(`${form.make}-${form.model}-${year}`), transmission: form.transmission, fuel_type: form.fuel,
          seating_capacity: seats, daily_rate: daily, weekly_rate: form.weekly ? Number(form.weekly) : null,
          monthly_rate: form.monthly ? Number(form.monthly) : null, deposit_amount: form.deposit ? Number(form.deposit) : 0,
          daily_rate_syp: form.dailySyp ? Number(form.dailySyp) : null, weekly_rate_syp: form.weeklySyp ? Number(form.weeklySyp) : null,
          monthly_rate_syp: form.monthlySyp ? Number(form.monthlySyp) : null, deposit_amount_syp: form.depositSyp ? Number(form.depositSyp) : 0,
          mileage_limit_daily: form.mileage ? Number(form.mileage) : null, description: form.description.trim() || null,
          status: 'draft', is_published: false, moderation_status: 'pending', archived_at: null,
        };
        const { data: saved, error } = editing
          ? await supabase.from('vehicles').update(payload).eq('id', editing.id).select('id').single()
          : await supabase.from('vehicles').insert(payload).select('id').single();
        if (error || !saved) throw new Error(error?.message ?? 'Vehicle could not be saved.');
        const failedPhotos: string[] = [];
        for (const [index, photo] of photos.entries()) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 12 * 1024 * 1024) { failedPhotos.push(`${photo.name} is not a supported image under 12 MB`); continue; }
          const path = `${saved.id}/${crypto.randomUUID()}_${photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error: uploadError } = await supabase.storage.from('vehicle-images').upload(path, photo, { contentType: photo.type });
          if (uploadError) { failedPhotos.push(`${photo.name}: ${uploadError.message}`); continue; }
          const { error: imageError } = await supabase.from('vehicle_images').insert({ vehicle_id: saved.id, storage_path: path, alt_text: `${form.make} ${form.model}`, sort_order: index, is_primary: index === 0 });
          if (imageError) failedPhotos.push(`${photo.name}: ${imageError.message}`);
        }
        await loadOfficeFleet();
        setShowForm(false);
        notify(failedPhotos.length ? `Vehicle submitted for platform review. Image issue: ${failedPhotos.join('; ')}` : 'Vehicle submitted for platform review. It will appear publicly after approval.');
      } else {
        const nextVehicle: Vehicle = { id: editing?.id ?? `demo-${Date.now()}`, name: `${form.make.trim()} ${form.model.trim()}`, make: form.make.trim(), model: form.model.trim(), year, category: categories.find(item => item.id === form.categoryId)?.name ?? 'Other', transmission: form.transmission === 'manual' ? 'Manual' : 'Automatic', fuel: (form.fuel.charAt(0).toUpperCase() + form.fuel.slice(1)) as Vehicle['fuel'], seats, price: daily, weeklyPrice: form.weekly ? Number(form.weekly) : undefined, monthlyPrice: form.monthly ? Number(form.monthly) : undefined, dailyPriceSyp: form.dailySyp ? Number(form.dailySyp) : undefined, weeklyPriceSyp: form.weeklySyp ? Number(form.weeklySyp) : undefined, monthlyPriceSyp: form.monthlySyp ? Number(form.monthlySyp) : undefined, depositSyp: form.depositSyp ? Number(form.depositSyp) : 0, deposit: form.deposit ? Number(form.deposit) : 0, officeId, officeName: getOffice(officeId).name, city: getOffice(officeId).city, rating: 0, reviews: 0, color: '#e5eae5', available: form.status === 'available', status: form.status, mileage: `${form.mileage || 250} km/day included` };
        setFleet(current => editing ? current.map(vehicle => vehicle.id === editing.id ? nextVehicle : vehicle) : [nextVehicle, ...current]);
        setShowForm(false); notify(editing ? 'Vehicle details updated.' : 'Vehicle added to the demo fleet.');
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Vehicle could not be saved.'); }
    finally { setSaving(false); }
  };

  const archive = async (vehicle: Vehicle) => {
    if (!window.confirm(`Archive ${vehicle.name} from the active fleet?`)) return;
    if (supabase) {
      const { error } = await supabase.from('vehicles').update({ status: 'archived', is_published: false, archived_at: new Date().toISOString() }).eq('id', vehicle.id);
      if (error) { notify(error.message); return; }
    }
    setFleet(current => current.filter(item => item.id !== vehicle.id));
    notify(`${vehicle.name} archived.`);
  };

  const visible = officeFleet.filter(vehicle => {
    const matchesQuery = !query || `${vehicle.make} ${vehicle.model} ${vehicle.city}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = filter === 'all' || (filter === 'available' ? vehicle.available : !vehicle.available);
    return matchesQuery && matchesStatus;
  });

  return <>
    <div className="panel-card">
      <div className="panel-head"><div><h3>{uiText('Fleet inventory')}</h3><p>{officeName} {uiText("· Add, edit, publish, or archive vehicles.")}</p></div><button className="btn btn-sm" onClick={openNew}><Plus size={14} /> {uiText('Add vehicle')}</button></div>
      <div className="toolbar" style={{ marginBottom: 12 }}><label style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Search size={13} /><input className="search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder={uiText('Search make, model or city')} /></label><select className="input" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{uiText('All statuses')}</option><option value="available">{uiText('Available')}</option><option value="draft">{uiText('Draft or unavailable')}</option></select></div>
      {loadError && <div className="empty-note" role="alert">{loadError}</div>}
      <div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Vehicle')}</th><th>{uiText('Category')}</th><th>{uiText('City')}</th><th>{uiText('Daily rate')}</th><th>{uiText('Deposit')}</th><th>{uiText('Status')}</th><th>{uiText('Actions')}</th></tr></thead><tbody>{visible.map(vehicle => <tr key={vehicle.id}><td><strong>{vehicle.name}</strong><small style={{ display: 'block', color: '#8a958e', marginTop: 3 }}>{formatNumber(vehicle.year)} · {vehicle.transmission} · {formatNumber(vehicle.seats)} {uiText("seats")}</small></td><td>{vehicle.category}</td><td>{vehicle.city}</td><td><strong>{formatCurrency(vehicle.price, 'USD')}</strong><small style={{display:'block',color:'#7c887f'}}>{vehicle.dailyPriceSyp == null ? uiText('Not set') : formatCurrency(vehicle.dailyPriceSyp, 'SYP')}</small></td><td><strong>{formatCurrency(vehicle.deposit, 'USD')}</strong><small style={{display:'block',color:'#7c887f'}}>{vehicle.depositSyp == null ? uiText('Not set') : formatCurrency(vehicle.depositSyp, 'SYP')}</small></td><td><span className={`status-pill ${vehicle.status ?? (vehicle.available ? 'available' : 'draft')}`}>{uiText(vehicle.status ?? (vehicle.available ? 'Available' : 'Draft / hidden'))}</span></td><td><div style={{ display: 'flex', gap: 6 }}><button className="quiet-button" aria-label={`Edit ${vehicle.name}`} onClick={() => openEdit(vehicle)}><Pencil size={14} /> {uiText('Edit')}</button><button className="quiet-button" aria-label={`Archive ${vehicle.name}`} onClick={() => void archive(vehicle)}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table>{!visible.length && !loadError && <div className="empty-note"><CarFront size={17} /> {uiText('No vehicles match this filter.')}</div>}</div>
    </div>
    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-form-title" onClick={event => event.stopPropagation()}>
      <div className="modal-head"><div><h2 id="vehicle-form-title">{editing ? 'Edit vehicle' : 'Add a vehicle'}</h2><p>{uiText('Listing updates are protected by your office permissions.')}</p></div><button className="modal-close" onClick={() => setShowForm(false)} aria-label={uiText('Close')}><X size={15} /></button></div>
      <div className="form-grid"><div className="field"><label>{uiText('Make')}</label><input value={form.make} onChange={event => setForm({ ...form, make: event.target.value })} placeholder={uiText('Toyota')} required /></div><div className="field"><label>{uiText('Model')}</label><input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder={uiText('Camry')} required /></div><div className="field"><label>{uiText('Model year')}</label><input type="number" min="1950" max="2100" value={form.year} onChange={event => setForm({ ...form, year: event.target.value })} required /></div><div className="field"><label>{uiText('Category')}</label><select value={form.categoryId} onChange={event => setForm({ ...form, categoryId: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="field"><label>{uiText('Transmission')}</label><select value={form.transmission} onChange={event => setForm({ ...form, transmission: event.target.value })}><option value="automatic">{uiText('Automatic')}</option><option value="manual">{uiText('Manual')}</option></select></div><div className="field"><label>{uiText('Fuel type')}</label><select value={form.fuel} onChange={event => setForm({ ...form, fuel: event.target.value })}><option value="petrol">{uiText('Petrol')}</option><option value="diesel">{uiText('Diesel')}</option><option value="hybrid">{uiText('Hybrid')}</option><option value="electric">{uiText('Electric')}</option><option value="other">{uiText('Other')}</option></select></div><div className="field"><label>{uiText('Seats')}</label><input type="number" min="1" max="20" value={form.seats} onChange={event => setForm({ ...form, seats: event.target.value })} /></div><div className="field"><label>{uiText('Daily rate · USD')}</label><input type="number" min="0" step="0.01" value={form.daily} onChange={event => setForm({ ...form, daily: event.target.value })} required /></div><div className="field"><label>{uiText('Weekly rate · USD')}</label><input type="number" min="0" step="0.01" value={form.weekly} onChange={event => setForm({ ...form, weekly: event.target.value })} /></div><div className="field"><label>{uiText('Monthly rate · USD')}</label><input type="number" min="0" step="0.01" value={form.monthly} onChange={event => setForm({ ...form, monthly: event.target.value })} /></div><div className="field"><label>{uiText('Refundable deposit · USD')}</label><input type="number" min="0" step="0.01" value={form.deposit} onChange={event => setForm({ ...form, deposit: event.target.value })} /></div><div className="field full"><strong>{uiText('Syrian pound prices (SYP)')}</strong><small>{uiText('Set these independently. The office can edit either currency at any time.')}</small></div><div className="field"><label>{uiText('Daily rate · SYP')}</label><input type="number" min="0" step="1" value={form.dailySyp} onChange={event => setForm({ ...form, dailySyp: event.target.value })} /></div><div className="field"><label>{uiText('Weekly rate · SYP')}</label><input type="number" min="0" step="1" value={form.weeklySyp} onChange={event => setForm({ ...form, weeklySyp: event.target.value })} /></div><div className="field"><label>{uiText('Monthly rate · SYP')}</label><input type="number" min="0" step="1" value={form.monthlySyp} onChange={event => setForm({ ...form, monthlySyp: event.target.value })} /></div><div className="field"><label>{uiText('Refundable deposit · SYP')}</label><input type="number" min="0" step="1" value={form.depositSyp} onChange={event => setForm({ ...form, depositSyp: event.target.value })} /></div><div className="field"><label>{uiText('Daily mileage limit')}</label><input type="number" min="0" value={form.mileage} onChange={event => setForm({ ...form, mileage: event.target.value })} /></div><div className="field"><label>{uiText('Listing status')}</label><select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as FormState['status'] })}><option value="draft">{uiText('Draft')}</option><option value="available">{uiText('Available and published')}</option><option value="maintenance">{uiText('Maintenance')}</option>{form.status === 'rented' && <option value="rented" disabled>{uiText('Rented · controlled by booking')}</option>}</select></div><div className="field full"><label>{uiText('Description')}</label><textarea rows={3} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder={uiText('Describe the vehicle and its features')} /></div><div className="field full"><label>{uiText('Vehicle photos')}</label><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => setPhotos(Array.from(event.target.files ?? []))} /><small>{uiText('JPEG, PNG, or WebP · up to 12 MB each.')}</small></div></div>
      <button className="btn btn-block" style={{ marginTop: 17 }} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save vehicle'}</button>
    </section></div>}
  </>;
}
