import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Bell, CalendarDays, CarFront, Check, ChevronDown, ChevronRight, Clock3, CreditCard, Download, FileText, Fuel, Gauge, Globe2, Heart, LayoutDashboard, LifeBuoy, LogOut, MapPin, Menu, MoreHorizontal, Search, Settings, ShieldCheck, SlidersHorizontal, Star, Users, Wallet, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cities, getOffice, getVehicle, initialBookings, money, monthRevenue, offices, vehicles as seededVehicles, type Booking, type BookingStatus, type Vehicle } from './lib/domain';
import { calculateQuote } from './lib/pricing';
import { api, isBackendConfigured, isDemoMode, supabase } from './lib/supabase';
import FleetManagementPage from './FleetManagement';
import AdminOfficeManagement from './AdminOfficeManagement';
import FinanceManagementPage from './FinanceManagement';
import CustomerPaymentCenter from './CustomerPaymentCenter';
import { CmsHomeHighlights, CmsManagement, CmsPublicFaqs, CmsPublicPage, CustomerDirectory, NotificationsManagement, OfficeProfileManagement, OfficeStaffManagement, PlatformSettingsManagement, PlatformStaffManagement, PromotionsManagement, RentalCalendar, ReviewsManagement, SubscriptionManagement, SupportManagement } from './OperationalModules';

type Lang = 'en' | 'ar';
type BookingUpdateDetails = { odometer?: number; fuel?: string; lateMinutes?: number; damage?: Array<{ description: string }>; photos?: File[]; notes?: string };
const labels: Record<string, { en: string; ar: string }> = {
  cars: { en: 'Find a car', ar: 'ابحث عن سيارة' }, offices: { en: 'Rental offices', ar: 'مكاتب التأجير' }, cities: { en: 'Cities', ar: 'المدن' }, offers: { en: 'Offers', ar: 'العروض' }, about: { en: 'About', ar: 'من نحن' }, login: { en: 'Log in', ar: 'تسجيل الدخول' }, signup: { en: 'Get started', ar: 'ابدأ الآن' },
  pickup: { en: 'Pick-up location', ar: 'موقع الاستلام' }, pickupDate: { en: 'Pick-up date', ar: 'تاريخ الاستلام' }, returnDate: { en: 'Return date', ar: 'تاريخ الإعادة' }, search: { en: 'Search cars', ar: 'ابحث عن سيارة' },
};
const tr = (key: string, lang: Lang) => labels[key]?.[lang] ?? key;
const persist = <T,>(key: string, initial: T): T => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) as T : initial; } catch { return initial; } };
const todayPlus = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
type FleetContextValue = { fleet: Vehicle[]; setFleet: Dispatch<SetStateAction<Vehicle[]>> };
const FleetContext = createContext<FleetContextValue>({ fleet: isDemoMode ? seededVehicles : [], setFleet: () => {} });
const useFleet = () => useContext(FleetContext);
type RemoteCar = { id: string; slug: string; office_id: string; office_slug: string; office_name: string; city: string; category: string; make: string; model: string; model_year: number; transmission: string; fuel_type: string; seating_capacity: number; daily_rate: number; weekly_rate?: number; monthly_rate?: number; deposit_amount: number; mileage_limit_daily?: number; color?: string; primary_image_path?: string; average_rating?: number; review_count?: number };
type RemoteBooking = { id: string; booking_number: string; customer_id: string; office_id: string; vehicle_id: string; pickup_address: string; return_address: string; pickup_at: string; return_at: string; status: BookingStatus; total_amount: number; vehicles?: { slug: string } | null; rental_offices?: { slug: string; name: string } | null; profiles?: { full_name: string } | null };
type OfficeWorkspace = { id: string; slug: string; name: string; office_role: string };
function mapRemoteCar(row: RemoteCar): Vehicle {
  const imageUrl = row.primary_image_path && supabase ? supabase.storage.from('vehicle-images').getPublicUrl(row.primary_image_path).data.publicUrl : undefined;
  return { id: row.id, name: `${row.make} ${row.model}`, make: row.make, model: row.model, year: row.model_year, category: row.category,
    transmission: row.transmission.toLowerCase() === 'manual' ? 'Manual' : 'Automatic', fuel: (row.fuel_type.charAt(0).toUpperCase() + row.fuel_type.slice(1)) as Vehicle['fuel'], seats: row.seating_capacity,
    price: Number(row.daily_rate), weeklyPrice: row.weekly_rate ? Number(row.weekly_rate) : undefined, monthlyPrice: row.monthly_rate ? Number(row.monthly_rate) : undefined,
    deposit: Number(row.deposit_amount), officeId: row.office_slug, officeName: row.office_name, city: row.city, rating: Number(row.average_rating) || 4.8,
    reviews: Number(row.review_count) || 0, color: row.color ?? '#e5eae5', imageUrl, available: true, status: 'available', mileage: `${row.mileage_limit_daily ?? 250} km/day included` };
}
function mapRemoteBooking(row: RemoteBooking): Booking {
  return { id: row.id, number: row.booking_number, customer: row.profiles?.full_name || 'Customer', vehicleId: row.vehicles?.slug || row.vehicle_id,
    officeId: row.rental_offices?.slug || row.office_id, pickup: row.pickup_address, dropoff: row.return_address,
    start: row.pickup_at.slice(0, 10), end: row.return_at.slice(0, 10), status: row.status, total: Number(row.total_amount) };
}

function useNotice() {
  const [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(timer); }, [notice]);
  return { notice, notify: setNotice, Notice: () => notice ? <div className="notice" role="status">{notice}</div> : null };
}

function Brand() { return <Link className="brand" to="/"><span className="brand-mark"><CarFront size={20} strokeWidth={2.5} /></span><span>rentora<small>DRIVE YOUR WAY</small></span></Link>; }

function MarketplaceHeader({ lang, setLang, notify }: { lang: Lang; setLang: (v: Lang) => void; notify: (s: string) => void }) {
  const nav = [{ to: '/cars', key: 'cars' }, { to: '/offices', key: 'offices' }, { to: '/cities', key: 'cities' }, { to: '/offers', key: 'offers' }, { to: '/about', key: 'about' }];
  const [menuOpen, setMenuOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) { setSignedIn(false); return; }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session)); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  return <header className="topbar"><div className="topbar-inner"><Brand /><nav className={`nav-links ${menuOpen ? 'open' : ''}`}>{nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{tr(item.key, lang)}</NavLink>)}</nav><div className="top-actions"><button className="icon-button language-action" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} aria-label="Switch language"><Globe2 size={15} /> {lang === 'en' ? 'EN' : 'عربي'} <ChevronDown size={13} /></button><button className="icon-button language-action" onClick={() => notify('Currency: USD. Configure the SYP rate in platform settings.')}>USD <ChevronDown size={13} /></button>{signedIn ? <Link className="btn btn-sm" to="/account">My account</Link> : <><Link className="quiet-button" to="/account">{tr('login', lang)}</Link><Link className="btn btn-sm" to="/account?mode=register">{tr('signup', lang)}</Link></>}<Link className="quiet-button" to="/register-office">Register your office</Link><button className="icon-button mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'}><Menu size={19} /></button></div></div></header>;
}

function SiteFooter() { return <footer className="site-footer"><div className="footer-inner"><div><Brand /><p style={{ maxWidth: 230, marginTop: 15 }}>A better way to explore. Find a local rental, book with confidence, and make the road yours.</p></div><div><h4>Explore</h4><Link to="/cars">Browse cars</Link><Link to="/offices">Rental offices</Link><Link to="/cities">Popular cities</Link><Link to="/offers">Latest offers</Link></div><div><h4>Rentora</h4><Link to="/about">About us</Link><Link to="/contact">Contact</Link><Link to="/faq">Help center</Link><Link to="/register-office">Register your rental office</Link></div><div><h4>Good to know</h4><Link to="/terms">Terms & conditions</Link><Link to="/privacy">Privacy policy</Link><Link to="/faq">Frequently asked questions</Link><p>English · العربية</p></div></div><div className="footer-bottom"><span>© 2026 Rentora Marketplace</span><span>Made for the road ahead.</span></div></footer>; }

function VehicleArt({ vehicle, large = false }: { vehicle: Vehicle; large?: boolean }) {
  const tone = vehicle.category === 'Premium' ? 'dark' : vehicle.category === 'SUV' ? 'blue' : vehicle.category === 'Economy' ? 'gold' : '';
  return <div className={`vehicle-art ${tone}`} style={large ? { height: 390, backgroundColor: vehicle.color } : { backgroundColor: vehicle.color }}>{vehicle.imageUrl ? <img className="vehicle-photo" src={vehicle.imageUrl} alt={`${vehicle.year} ${vehicle.name}`} /> : <div className="car-shape"><span className="wheel left" /><span className="wheel right" /></div>}<span className="art-type">{vehicle.category}</span><span className="art-label">{vehicle.make}</span>{large && <span style={{ position: 'absolute', right: 18, bottom: 17, color: '#7b8780', fontSize: 11 }}>{vehicle.year} · {vehicle.model}</span>}</div>;
}

function VehicleCard({ vehicle, favorite, onFavorite }: { vehicle: Vehicle; favorite: boolean; onFavorite: (id: string) => void }) {
  return <article className="vehicle-card"><div style={{ position: 'relative' }}><Link to={`/cars/${vehicle.id}`} aria-label={`View ${vehicle.name}`}><VehicleArt vehicle={vehicle} /></Link><button className={`heart ${favorite ? 'on' : ''}`} onClick={() => onFavorite(vehicle.id)} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /></button>{vehicle.popular && <span style={{ position: 'absolute', right: 14, bottom: 12, zIndex: 4, padding: '6px 8px', borderRadius: 7, background: '#ffffffdc', color: '#3b5546', fontSize: 9, fontWeight: 800 }}>POPULAR</span>}</div><div className="vehicle-info"><div className="vehicle-title-line"><div><Link to={`/cars/${vehicle.id}`}><h3>{vehicle.name}</h3></Link><p>{vehicle.year} · {vehicle.officeName ?? (isDemoMode ? getOffice(vehicle.officeId).name : 'Rental office')}</p></div><div className="rating"><Star size={12} /> {vehicle.rating}</div></div><div className="vehicle-specs"><span><Users size={13} /> {vehicle.seats} seats</span><span><Zap size={13} /> {vehicle.transmission}</span><span><Fuel size={13} /> {vehicle.fuel}</span></div><div className="vehicle-bottom"><div className="price">{money(vehicle.price)}<small> / day</small></div><Link className="link-arrow" to={`/cars/${vehicle.id}`}>View details <ArrowRight size={13} /></Link></div></div></article>;
}

function SearchBar({ lang, navigate }: { lang: Lang; navigate: (to: string) => void }) {
  const [city, setCity] = useState(isDemoMode ? cities[0]?.name ?? '' : ''); const [cityOptions,setCityOptions]=useState<string[]>(()=>isDemoMode?cities.map(item=>item.name):[]); const [start, setStart] = useState(todayPlus(2)); const [end, setEnd] = useState(todayPlus(5));
  useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('cities').select('name').eq('is_active',true).order('name').limit(300).then(result=>{if(!alive)return;if(result.error)return;const names=(result.data??[]).map(row=>row.name);setCityOptions(names);setCity(current=>names.includes(current)?current:names[0]??'');});return()=>{alive=false;};},[]);
  const submit = (event: FormEvent) => { event.preventDefault(); const params = new URLSearchParams({ city, start, end }); navigate(`/cars?${params.toString()}`); };
  return <form className="search-panel" onSubmit={submit}><div className="search-field"><label>{tr('pickup', lang)}</label><select value={city} onChange={e => setCity(e.target.value)} required disabled={!cityOptions.length}><option value="" disabled>{cityOptions.length?'Choose a city':'Loading cities…'}</option>{cityOptions.map(name=><option key={name}>{name}</option>)}</select></div><div className="search-field"><label>{tr('pickupDate', lang)}</label><input type="date" min={todayPlus(0)} value={start} onChange={e => setStart(e.target.value)} required /></div><div className="search-field"><label>{tr('returnDate', lang)}</label><input type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} required /></div><button className="btn" type="submit" disabled={!city}><Search size={15} /> {tr('search', lang)}</button></form>;
}

function Home({ lang, favorites, onFavorite, navigate }: { lang: Lang; favorites: string[]; onFavorite: (id: string) => void; navigate: (to: string) => void }) {
  const { fleet } = useFleet();
  return <><section className="hero"><div className="hero-inner"><div className="hero-copy"><span className="eyebrow"><span className="dot" /> THE ROAD IS YOURS</span><h1>Find your drive.<br /><span>Go your way.</span></h1><p>Discover trusted local rental offices and the right car for every journey. No guesswork, just a better way to get there.</p><SearchBar lang={lang} navigate={navigate} /><div className="hero-foot"><span>Browse local rental offices and compare clear daily prices.</span><BadgeCheck size={15} color="#5d8a62" /></div></div><div className="hero-art"><div className="hero-car"><span className="wheel left" /><span className="wheel right" /></div></div></div></section><CmsHomeHighlights language={lang}/><main className="content"><div className="section-head"><div><span className="eyebrow">A GOOD PLACE TO START</span><h2>Cars for every kind of day</h2><p>Handpicked rides from verified local partners.</p></div><Link to="/cars" className="link-arrow">Explore all cars <ArrowRight size={14} /></Link></div><div className="car-grid">{fleet.slice(0, 6).map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} favorite={favorites.includes(vehicle.id)} onFavorite={onFavorite} />)}</div><div className="content" style={{ padding: '42px 0 24px' }}><div className="trust-band"><div className="trust-item"><span className="trust-icon"><ShieldCheck size={19} /></span><span><b>Verified rental offices</b><small>Local partners, checked by our team</small></span></div><div className="trust-item"><span className="trust-icon"><Wallet size={18} /></span><span><b>Clear prices</b><small>Know what you pay before you book</small></span></div><div className="trust-item"><span className="trust-icon"><LifeBuoy size={19} /></span><span><b>Here when you need us</b><small>Real help from real people</small></span></div></div></div><div className="section-head"><div><span className="eyebrow">LOCAL KNOW-HOW</span><h2>Good people, good cars</h2><p>Independent rental offices that know their neighborhoods.</p></div><Link to="/offices" className="link-arrow">Meet our offices <ArrowRight size={14} /></Link></div><PublicOfficeDirectory limit={3}/></main><SiteFooter /></>;
}

function OfficeCard({ office }: { office: (typeof offices)[number] }) { return <Link to={`/offices/${office.id}`} className="office-card"><span className="office-logo" style={{ background: office.accent }}>{office.initials}</span><span><h3>{office.name} {office.verified && <BadgeCheck size={14} style={{ verticalAlign: 'middle', color: '#4e8b61' }} />}</h3><p><MapPin size={11} style={{ verticalAlign: 'middle' }} /> {office.address}</p><span className="office-meta"><span className="rating"><Star size={11} /> {office.rating}</span><span>{office.reviews} reviews</span><span>{office.fleet} cars</span></span></span></Link>; }

type PublicOfficeRow={id:string;slug:string;name:string;address:string;average_rating:number;review_count:number;cities:{name:string|null}|{name:string|null}[]|null;vehicles:Array<{id:string}>};
function LiveOfficeCard({office}:{office:PublicOfficeRow}){const city=Array.isArray(office.cities)?office.cities[0]?.name:office.cities?.name;return <Link to={`/offices/${office.slug}`} className="office-card"><span className="office-logo" style={{background:'#dcebdc'}}><BadgeCheck size={18}/></span><span><h3>{office.name}</h3><p><MapPin size={11} style={{verticalAlign:'middle'}}/> {office.address}{city?`, ${city}`:''}</p><span className="office-meta"><span className="rating"><Star size={11}/> {Number(office.average_rating).toFixed(1)}</span><span>{office.review_count} reviews</span><span>{office.vehicles?.length??0} cars</span></span></span></Link>;}
function PublicOfficeDirectory({limit=500,columns}:{limit?:number;columns?:number}){const [rows,setRows]=useState<PublicOfficeRow[]>([]);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;void supabase.from('rental_offices').select('id,slug,name,address,average_rating,review_count,cities(name),vehicles(id)').eq('status','approved').order('name').limit(limit).then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setRows((result.data??[]) as unknown as PublicOfficeRow[]);setLoading(false);});return()=>{alive=false;};},[limit]);return <>{loading&&<div className="empty-note">Loading rental offices…</div>}{error&&<div className="empty-note" role="alert">{error}</div>}<div className="office-strip" style={columns?{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}:undefined}>{!supabase?offices.slice(0,limit).map(office=><OfficeCard key={office.id} office={office}/>):rows.map(office=><LiveOfficeCard key={office.id} office={office}/>)}</div>{supabase&&!loading&&!error&&!rows.length&&<div className="empty-note">No verified rental offices are listed yet.</div>}</>;}
type PublicCityRow={id:string;slug:string;name:string;name_ar:string;governorate:string|null};
function PublicCityDirectory({language}:{language:Lang}){const [rows,setRows]=useState<PublicCityRow[]>([]);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;void supabase.from('cities').select('id,slug,name,name_ar,governorate').eq('is_active',true).order('name').limit(300).then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setRows((result.data??[]) as PublicCityRow[]);setLoading(false);});return()=>{alive=false;};},[]);const cityRows=supabase?rows:cities;return <>{loading&&<div className="empty-note">Loading cities…</div>}{error&&<div className="empty-note" role="alert">{error}</div>}<div className="office-strip">{cityRows.map(city=><Link key={city.id} to={`/cars?city=${encodeURIComponent(city.name)}`} className="office-card"><span className="office-logo" style={{background:'#e4eee3'}}><MapPin size={18}/></span><span><h3>{language==='ar'&&'name_ar' in city?city.name_ar:city.name}</h3><p>{'governorate' in city?city.governorate:city.region}</p><span className="office-meta">Browse cars <ArrowRight size={12}/></span></span></Link>)}</div>{supabase&&!loading&&!error&&!rows.length&&<div className="empty-note">No active cities are listed yet.</div>}</>;}
type PublicPromotion={id:string;title:string;description:string|null;starts_at:string;ends_at:string;rental_offices:{name:string;slug:string}|null};
function PublicOffers({lang}:{lang:Lang}){const [rows,setRows]=useState<PublicPromotion[]>([]);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;const now=new Date().toISOString();void supabase.from('promotions').select('id,title,description,starts_at,ends_at,rental_offices(name,slug)').eq('is_active',true).lte('starts_at',now).gt('ends_at',now).order('ends_at').limit(200).then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setRows((result.data??[]) as unknown as PublicPromotion[]);setLoading(false);});return()=>{alive=false;};},[]);if(!supabase)return <div className="empty-note">Connect Supabase to see current rental office offers.</div>;return <><CmsHomeHighlights language={lang}/>{loading&&<div className="empty-note">Loading current offers…</div>}{error&&<div className="empty-note" role="alert">{error}</div>}{!loading&&!error&&!rows.length&&<div className="empty-note">There are no current offers right now.</div>}<div className="office-strip">{rows.map(row=><article className="office-card" key={row.id}><span><small>{row.rental_offices?.name??'Rentora offer'} · Ends {new Date(row.ends_at).toLocaleDateString()}</small><h3>{row.title}</h3><p>{row.description??'Ask the rental office for details.'}</p>{row.rental_offices?.slug&&<Link className="link-arrow" to={`/offices/${row.rental_offices.slug}`}>View office <ArrowRight size={13}/></Link>}</span></article>)}</div><Link className="btn" to="/cars">Find a car <ArrowRight size={15}/></Link></>;}

function CarsPage({ favorites, onFavorite }: { favorites: string[]; onFavorite: (id: string) => void }) {
  const [params, setParams] = useSearchParams(); const { fleet, setFleet } = useFleet(); const [category, setCategory] = useState('Any type'); const [gearbox, setGearbox] = useState('Any'); const [maxPrice, setMaxPrice] = useState('200'); const [minSeats,setMinSeats]=useState(1);const [sortBy,setSortBy]=useState('recommended');const [cityOptions,setCityOptions]=useState(()=>isDemoMode?cities.map(city=>city.name):[]);const [categoryOptions,setCategoryOptions]=useState(()=>isDemoMode?['Economy','Comfort','SUV','Premium','Van']:[]); const city = params.get('city') ?? 'All cities';
  useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('cities').select('name').eq('is_active',true).order('name').limit(300).then(result=>{if(!alive)return;if(!result.error)setCityOptions((result.data??[]).map(row=>row.name));});return()=>{alive=false;};},[]);
  useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('vehicle_categories').select('name').order('sort_order').limit(100).then(result=>{if(!alive)return;if(!result.error)setCategoryOptions((result.data??[]).map(row=>row.name));});return()=>{alive=false;};},[]);
  useEffect(() => { if (!isBackendConfigured) return; const search = params.toString(); api<{ cars: RemoteCar[] }>(`/cars${search ? `?${search}` : ''}`).then(data => setFleet(data.cars.map(mapRemoteCar))).catch(() => {}); }, [params, setFleet]);
  const result = useMemo(() => {const filtered=fleet.filter(v => (city === 'All cities' || v.city === city) && (category === 'Any type' || v.category === category) && (gearbox === 'Any' || v.transmission === gearbox) && v.price <= Number(maxPrice) && v.seats>=minSeats);return filtered.sort((a,b)=>sortBy==='price'?a.price-b.price:sortBy==='rating'?b.rating-a.rating:((b.popular?1:0)-(a.popular?1:0))||a.price-b.price);}, [fleet, city, category, gearbox, maxPrice,minSeats,sortBy]);
  const clearFilters=()=>{setCategory('Any type');setGearbox('Any');setMaxPrice('200');setMinSeats(1);setSortBy('recommended');params.delete('city');setParams(params);};
  return <><div className="page-heading"><span className="eyebrow">THE RIGHT CAR IS CLOSER THAN YOU THINK</span><h1>Find your next drive</h1><p>Compare trusted local cars and book in just a few easy steps.</p></div><div className="catalog-layout"><aside className="filter-panel"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3><SlidersHorizontal size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Filters</h3><button className="quiet-button" onClick={clearFilters}>Reset</button></div><div className="filter-group"><label>Pick-up city</label><select className="input" value={city} onChange={e => { if (e.target.value === 'All cities') params.delete('city'); else params.set('city', e.target.value); setParams(params); }}><option>All cities</option>{cityOptions.map(name => <option key={name}>{name}</option>)}</select></div><div className="filter-group"><label>Vehicle category</label><select className="input" value={category} onChange={e => setCategory(e.target.value)}>{['Any type', ...categoryOptions].map(x => <option key={x}>{x}</option>)}</select></div><div className="filter-group"><label>Price up to · ${maxPrice} / day</label><input type="range" min="25" max="200" step="5" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} /></div><div className="filter-group"><label>Transmission</label><div className="checks">{['Any', 'Automatic', 'Manual'].map(x => <label key={x}><input type="radio" name="gearbox" checked={gearbox === x} onChange={() => setGearbox(x)} /> {x}</label>)}</div></div><div className="filter-group"><label>Seats</label><div className="checks"><label><input type="checkbox" checked={minSeats===7} onChange={event=>setMinSeats(event.target.checked?7:1)} /> 7+ seats</label></div></div></aside><section><div className="catalog-toolbar"><span><strong>{result.length} cars</strong> available {city !== 'All cities' && `in ${city}`}</span><select aria-label="Sort cars" value={sortBy} onChange={event=>setSortBy(event.target.value)}><option value="recommended">Recommended</option><option value="price">Price: low to high</option><option value="rating">Top rated</option></select></div>{result.length ? <div className="car-grid">{result.map(v => <VehicleCard key={v.id} vehicle={v} favorite={favorites.includes(v.id)} onFavorite={onFavorite} />)}</div> : <div className="empty-state"><CarFront size={28} /><h3>No cars match these filters</h3><p>Try another city or raise your daily price range.</p><button className="btn btn-sm" onClick={clearFilters}>Clear filters</button></div>}</section></div><SiteFooter /></>;
}

function VehicleDetails({ favorites, onFavorite, onBook, notify }: { favorites: string[]; onFavorite: (id: string) => void; onBook: (vehicle: Vehicle, fields: { start: string; end: string; name: string; delivery: boolean; insurance: boolean; extraDriver: boolean }) => void; notify: (s: string) => void }) {
  const { vehicleId = '' } = useParams(); const { fleet, setFleet } = useFleet(); const [remoteLoading,setRemoteLoading]=useState(Boolean(supabase)); const [remoteError,setRemoteError]=useState('');
  const [start, setStart] = useState(todayPlus(2)); const [end, setEnd] = useState(todayPlus(5)); const [name, setName] = useState(''); const [delivery, setDelivery] = useState(false); const [insurance, setInsurance] = useState(false); const [extraDriver, setExtraDriver] = useState(false); const [tab, setTab] = useState('Overview');
  useEffect(()=>{if(!isBackendConfigured)return;let alive=true;setRemoteLoading(true);void api<{cars:RemoteCar[]}>('/cars').then(data=>{if(!alive)return;setFleet(data.cars.map(mapRemoteCar));setRemoteLoading(false);}).catch(error=>{if(!alive)return;setRemoteError(error instanceof Error?error.message:'Vehicle details could not be loaded.');setRemoteLoading(false);});return()=>{alive=false;};},[vehicleId,setFleet]);
  const vehicle = fleet.find(v => v.id === vehicleId) ?? (isDemoMode ? fleet[0] ?? seededVehicles[0] : null);
  if(!vehicle)return <><main className="content">{remoteLoading?<div className="empty-note">Loading vehicle details…</div>:<div className="empty-note" role={remoteError?'alert':undefined}>{remoteError||'This vehicle is not available.'}</div>}</main><SiteFooter/></>;
  const office = getOffice(vehicle.officeId); const officeName=vehicle.officeName??(isDemoMode?office.name:'Rental office');
  const quote = calculateQuote(vehicle, { start, end, delivery, insurance, extraDriver });
  const submit = (e: FormEvent) => { e.preventDefault(); if (!name.trim()) { notify('Enter your full name to send a booking request.'); return; } onBook(vehicle, { start, end, name, delivery, insurance, extraDriver }); };
  return <><div className="page-heading" style={{ paddingBottom: 4 }}><Link to="/cars" className="link-arrow"><ArrowLeft size={13} /> Back to cars</Link></div><div className="detail-layout"><section><div className="detail-hero"><VehicleArt vehicle={vehicle} large /></div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}><div><span className="eyebrow"><MapPin size={12} /> {vehicle.city}, Syria</span><h1 style={{ font: '800 29px var(--display)', letterSpacing: '-1px', margin: '8px 0' }}>{vehicle.name} <span style={{ color: '#89958d', fontSize: 17 }}>{vehicle.year}</span></h1></div><button className={`icon-button ${favorites.includes(vehicle.id) ? 'active' : ''}`} onClick={() => onFavorite(vehicle.id)}><Heart size={17} fill={favorites.includes(vehicle.id) ? 'currentColor' : 'none'} /> Save</button></div><div className="detail-tags"><span className="tag"><Users size={14} /> {vehicle.seats} seats</span><span className="tag"><Zap size={14} /> {vehicle.transmission}</span><span className="tag"><Fuel size={14} /> {vehicle.fuel}</span><span className="tag"><Gauge size={14} /> {vehicle.mileage}</span></div><div className="tabs">{['Overview', 'Features', 'Rental terms', 'Reviews'].map(x => <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>{x}</button>)}</div><p style={{ color: '#6e7b73', fontSize: 12, lineHeight: 1.8 }}>{tab === 'Overview' ? `Enjoy a smooth, comfortable ride in this ${vehicle.year} ${vehicle.name}. Prepared and maintained by ${officeName}, with flexible pickup options in ${vehicle.city}.` : tab === 'Features' ? 'Air conditioning · Bluetooth · USB charging · Phone holder · Unlimited roadside assistance.' : tab === 'Rental terms' ? 'Valid driving license required. Minimum driver age 21. Security deposit is shown separately and is refundable after return inspection.' : `${vehicle.reviews} verified renter reviews · ${vehicle.rating} average rating. Reviews are collected after completed reservations.`}</p><div style={{ marginTop: 28 }}>{isBackendConfigured?<Link className="office-card" to={`/offices/${vehicle.officeId}`}><span className="office-logo" style={{background:"#dcebdc"}}><BadgeCheck size={18}/></span><span><h3>{officeName}</h3><p><MapPin size={11}/> {vehicle.city}</p></span></Link>:<OfficeCard office={office}/>}</div></section><aside className="detail-panel"><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#698171' }}><BadgeCheck size={15} color="#4b8b59" /> Verified local rental office</div><h1>{vehicle.name}</h1><div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#79867e' }}><Star size={13} fill="#e3bc5d" color="#c3922b" /> {vehicle.rating} · {vehicle.reviews} reviews · {officeName}</div><div className="price">{money(vehicle.price)}<small> / day</small></div><form className="booking-form" onSubmit={submit}><label>Pick-up date<input type="date" min={todayPlus(0)} value={start} onChange={e => setStart(e.target.value)} required /></label><label>Return date<input type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} required /></label><label>Your full name<input value={name} onChange={e => setName(e.target.value)} placeholder="As shown on your license" required /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, margin: '3px 0' }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" checked={delivery} onChange={e => setDelivery(e.target.checked)} /> Delivery +$18</label><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" checked={insurance} onChange={e => setInsurance(e.target.checked)} /> Protection +$8/day</label><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" checked={extraDriver} onChange={e => setExtraDriver(e.target.checked)} /> Extra driver</label></div><div style={{ borderTop: '1px solid #edf0ec', paddingTop: 8 }}><div className="quote-row"><span>{quote.days} days × {money(vehicle.price)}</span><span>{money(quote.rental)}</span></div>{quote.delivery > 0 && <div className="quote-row"><span>Delivery</span><span>{money(quote.delivery)}</span></div>}{quote.insurance > 0 && <div className="quote-row"><span>Protection</span><span>{money(quote.insurance)}</span></div>}{quote.extraDriver > 0 && <div className="quote-row"><span>Extra driver</span><span>{money(quote.extraDriver)}</span></div>}<div className="quote-row"><span>Service fee</span><span>{money(quote.serviceFee)}</span></div><div className="quote-row quote-total"><span>Estimated total</span><span>{money(quote.total)}</span></div><div className="quote-row"><span>Refundable deposit</span><span>{money(vehicle.deposit)}</span></div></div><button className="btn btn-block" type="submit">Request to book <ArrowRight size={15} /></button><small style={{ textAlign: 'center', color: '#89958d', fontSize: 9 }}>No charge now · Office confirms your request</small></form></aside></div><SiteFooter /></>;
}

function OfficesPage() { return <><div className="page-heading"><span className="eyebrow">LOCAL PARTNERS</span><h1>Rental offices you can trust</h1><p>Independent teams across Syria, verified and ready to help.</p></div><main className="content"><PublicOfficeDirectory columns={2}/></main><SiteFooter /></>; }
function OfficeDetailsPage() { const { officeId = '' } = useParams(); const { fleet } = useFleet(); const [office,setOffice]=useState<PublicOfficeRow|null>(null);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;void supabase.from('rental_offices').select('id,slug,name,address,average_rating,review_count,cities(name),vehicles(id)').eq('slug',officeId).eq('status','approved').maybeSingle().then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setOffice(result.data as unknown as PublicOfficeRow|null);setLoading(false);});return()=>{alive=false;};},[officeId]);const demoOffice=isDemoMode?offices.find(o=>o.id===officeId):undefined;const inventory=fleet.filter(vehicle=>vehicle.officeId===officeId);if(supabase&&(loading||error||!office))return <><main className="content">{loading?<div className="empty-note">Loading office profile…</div>:error?<div className="empty-note" role="alert">{error}</div>:<div className="empty-note">This rental office is not available.</div>}</main><SiteFooter/></>;const name=office?.name??demoOffice?.name??'Rental office';const address=office?.address??demoOffice?.address??'';const rating=office?Number(office.average_rating):demoOffice?.rating??0;const reviews=office?.review_count??demoOffice?.reviews??0;const fleetCount=office?.vehicles?.length??demoOffice?.fleet??inventory.length;return <><div className="page-heading"><Link to="/offices" className="link-arrow"><ArrowLeft size={13} /> All rental offices</Link><h1 style={{ marginTop: 18 }}>{name}</h1><p><MapPin size={13} style={{ verticalAlign: 'middle' }} /> {address}</p></div><main className="content"><div className="trust-band"><div className="trust-item"><span className="trust-icon"><BadgeCheck size={18} /></span><span><b>Verified by Rentora</b><small>Identity and rental documents checked</small></span></div><div className="trust-item"><span className="trust-icon"><Star size={18} /></span><span><b>{rating} average rating</b><small>From {reviews} renter reviews</small></span></div><div className="trust-item"><span className="trust-icon"><CarFront size={18} /></span><span><b>{fleetCount} vehicles</b><small>Browse their available fleet</small></span></div></div><div className="section-head"><div><h2>Cars from {name}</h2><p>Choose a ride, request your dates, and let the office confirm.</p></div></div><div className="car-grid">{inventory.map(v => <VehicleCard key={v.id} vehicle={v} favorite={false} onFavorite={() => {}} />)}</div>{!inventory.length&&<div className="empty-note">No vehicles are available from this office right now.</div>}</main><SiteFooter /></>; }

function ContentPage({ page, lang }: { page: string; lang: Lang }) {
  const pages: Record<string, [string, string]> = { cities: ['Explore Syria, one city at a time', 'Choose a city and find a local car for your next journey.'], offers: ['A little more road for less', 'Seasonal deals and first-booking savings from our local rental partners.'], about: ['A better way to get there', 'Rentora connects people with trusted independent rental offices, so getting on the road feels easy and clear.'], contact: ['We are here to help', 'Talk to our team about a booking, an office partnership, or anything in between.'], faq: ['Frequently asked questions', 'Helpful answers for a smooth start to your journey.'], terms: ['Terms and conditions', 'Clear booking, payment, cancellation, and rental expectations.'], privacy: ['Privacy policy', 'How Rentora handles account, booking, and support information.'] };
  const [title, desc] = pages[page] ?? pages.about;
  if (['about','contact','terms','privacy'].includes(page)) return <><main className="content"><CmsPublicPage slug={page} language={lang}/></main><SiteFooter/></>;
  return <><div className="page-heading"><span className="eyebrow">RENTORA · DRIVE YOUR WAY</span><h1>{title}</h1><p>{desc}</p></div><main className="content">{page === 'cities' ? <PublicCityDirectory language={lang}/> : page === 'offers' ? <PublicOffers lang={lang}/> : <CmsPublicFaqs language={lang}/>}</main><SiteFooter /></>;
}

const signSchema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().optional(), fullName: z.string().optional() });
type SignValues = z.infer<typeof signSchema>;
function AccountPage({ bookings, notify, favorites, onFavorite, onOfficeActivated }: { bookings: Booking[]; notify: (s: string) => void; favorites: string[]; onFavorite: (id: string) => void; onOfficeActivated: (slug: string) => void }) {
  const [tab, setTab] = useState<'bookings' | 'profile' | 'favorites' | 'payments' | 'support'>('bookings');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(() => new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login');
  const [sessionEmail, setSessionEmail] = useState('');
  const inviteAttempted = useRef(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';
  const platformInviteToken = searchParams.get('platform_invite') ?? '';
  const platformInviteAttempted = useRef(false);
  const [profile, setProfile] = useState({ fullName: '', phone: '', language: 'en' });
  const { fleet } = useFleet();
  const savedVehicles = fleet.filter(vehicle => favorites.includes(vehicle.id));

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const loadProfile = async (userId: string) => {
      const { data } = await client.from('profiles').select('full_name,phone,preferred_language').eq('id', userId).maybeSingle();
      if (data) setProfile({ fullName: data.full_name ?? '', phone: data.phone ?? '', language: data.preferred_language ?? 'en' });
    };
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setSessionEmail(user?.email ?? '');
      if (user) void loadProfile(user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? '');
      if (session) void loadProfile(session.user.id);
      else setProfile({ fullName: '', phone: '', language: 'en' });
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !inviteToken || !sessionEmail || inviteAttempted.current) return;
    inviteAttempted.current = true;
    let cancelled = false;
    void supabase.rpc('accept_office_invitation', { p_token: inviteToken }).then(result => {
      if (cancelled) return;
      if (result.error) { inviteAttempted.current = false; notify(`Staff invitation could not be activated: ${result.error.message}`); return; }
      const office = result.data as { office_name?: string; office_slug?: string };
      notify(`Staff access activated for ${office.office_name ?? 'your office'}.`);
      if (office.office_slug) { onOfficeActivated(office.office_slug); navigate('/office'); }
      const url = new URL(window.location.href); url.searchParams.delete('invite'); window.history.replaceState({}, '', url.toString());
    });
    return () => { cancelled = true; };
  }, [sessionEmail, inviteToken, notify, onOfficeActivated, navigate]);

  useEffect(() => {
    if (!supabase || !platformInviteToken || !sessionEmail || platformInviteAttempted.current) return;
    platformInviteAttempted.current = true;
    let cancelled = false;
    void supabase.rpc('accept_platform_invitation', { p_token: platformInviteToken }).then(result => {
      if (cancelled) return;
      if (result.error) { platformInviteAttempted.current = false; notify(`Platform staff invitation could not be activated: ${result.error.message}`); return; }
      notify('Platform staff access activated.');
      const url = new URL(window.location.href); url.searchParams.delete('platform_invite'); window.history.replaceState({}, '', url.toString());
      navigate('/admin');
    });
    return () => { cancelled = true; };
  }, [sessionEmail, platformInviteToken, notify, navigate]);

  const accountSchema = signSchema.superRefine((data, ctx) => {
    if (mode !== 'forgot' && (!data.password || data.password.length < 8)) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use at least 8 characters' });
  });
  const { register, handleSubmit, formState: { errors } } = useForm<SignValues>({ resolver: zodResolver(accountSchema) });
  const submit = handleSubmit(async data => {
    if (!supabase) { setSessionEmail(data.email); notify('Demo mode cannot create a secure account. Connect Supabase to sign in.'); return; }
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, { redirectTo: window.location.origin + '/account' });
      notify(error ? error.message : 'Password reset email sent.');
      return;
    }
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email: data.email, password: data.password ?? '', options: { data: { full_name: data.fullName ?? '' }, emailRedirectTo: window.location.origin + `/account${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : platformInviteToken ? `?platform_invite=${encodeURIComponent(platformInviteToken)}` : ''}` } })
      : await supabase.auth.signInWithPassword({ email: data.email, password: data.password ?? '' });
    notify(result.error ? result.error.message : mode === 'register' && !result.data.session ? 'Check your email to verify your account.' : 'You are signed in.');
  });
  const saveProfile = async () => {
    if (!supabase) { notify('Profile changes require a connected Supabase account.'); return; }
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { notify('Sign in before updating your profile.'); return; }
    const { error } = await supabase.from('profiles').update({ full_name: profile.fullName.trim(), phone: profile.phone.trim() || null, preferred_language: profile.language }).eq('id', user.id);
    notify(error ? error.message : 'Profile information saved.');
  };

  return <>
    <div className="page-heading"><span className="eyebrow">YOUR RENTORA ACCOUNT</span><h1>{inviteToken||platformInviteToken?'Activate your staff invitation':'Welcome back'}</h1><p>{inviteToken||platformInviteToken?'Sign in or create an account with the invited email address to activate staff access.':'Manage your trips, profile, payments, and saved cars.'}</p></div>
    <main className="content" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, paddingTop: 20 }}>
      <aside className="filter-panel"><div className="avatar" style={{ width: 46, height: 46, marginBottom: 10 }}>RH</div><h3 style={{ marginBottom: 4 }}>Renter account</h3><p style={{ fontSize: 10, color: '#869189', marginTop: 0 }}>{sessionEmail || 'Sign in to your account'}</p>
        {sessionEmail && <button className="quiet-button" onClick={async () => { await supabase?.auth.signOut(); setSessionEmail(''); }}><LogOut size={13} /> Sign out</button>}
        {[['bookings', 'My bookings'], ['profile', 'Profile'], ['favorites', 'Saved cars'], ['payments', 'Payments'], ['support', 'Support']].map(([id, labelText]) =>
          <button key={id} className={'side-link ' + (tab === id ? 'active' : '')} style={{ color: '#3d5044', background: tab === id ? '#edf2ec' : 'transparent', width: '100%', border: 0, textAlign: 'left' }} onClick={() => setTab(id as typeof tab)}>{labelText}</button>)}
      </aside>
      <section>
        {tab === 'bookings' && <><div className="panel-head"><div><h3>Your bookings</h3><p>Track requests, rental dates, and balances.</p></div><Link className="btn btn-sm" to="/cars">Find a car</Link></div>
          <div className="panel-card table-wrap"><table className="data-table"><thead><tr><th>Booking</th><th>Car</th><th>Dates</th><th>Office</th><th>Status</th><th>Total</th><th>Payments</th></tr></thead><tbody>
            {bookings.map(booking => <tr key={booking.id}><td><strong>{booking.number ?? booking.id}</strong></td><td>{fleet.find(vehicle => vehicle.id === booking.vehicleId)?.name ?? (isDemoMode ? getVehicle(booking.vehicleId).name : 'Vehicle details unavailable')}</td><td>{booking.start} – {booking.end}</td><td>{isDemoMode ? offices.find(office => office.id === booking.officeId)?.name ?? booking.officeId : booking.officeId}</td><td><span className={'status-pill ' + booking.status}>{booking.status}</span></td><td>{money(booking.total)}</td><td><button className="quiet-button" onClick={() => setTab('payments')}>Payment details</button></td></tr>)}
          </tbody></table>{!bookings.length && <div className="empty-note">No bookings yet. Your first trip is waiting.</div>}</div>
        </>}
        {tab === 'profile' && <div className="panel-card"><div className="panel-head"><div><h3>Profile information</h3><p>Keep your contact details up to date.</p></div></div><div className="form-grid"><div className="field"><label>Full name</label><input value={profile.fullName} onChange={event => setProfile(current => ({ ...current, fullName: event.target.value }))} /></div><div className="field"><label>Email address</label><input value={sessionEmail} readOnly /></div><div className="field"><label>Phone</label><input value={profile.phone} onChange={event => setProfile(current => ({ ...current, phone: event.target.value }))} placeholder="+963 …" /></div><div className="field"><label>Preferred language</label><select value={profile.language} onChange={event => setProfile(current => ({ ...current, language: event.target.value }))}><option value="en">English</option><option value="ar">العربية</option></select></div><button className="btn btn-sm" onClick={() => void saveProfile()}>Save changes</button></div></div>}
        {tab === 'favorites' && <div>{savedVehicles.length ? <div className="car-grid">{savedVehicles.map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} favorite onFavorite={onFavorite} />)}</div> : <div className="empty-state"><Heart size={26} /><h3>Saved cars stay here</h3><p>Tap the heart on any car to keep it close.</p><Link className="btn btn-sm" to="/cars">Browse cars</Link></div>}</div>}
        {tab === 'payments' && <CustomerPaymentCenter bookings={bookings} sessionEmail={sessionEmail} notify={notify} />}
        {tab === 'support' && <SupportManagement mode="customer" bookings={bookings} notify={notify} />}
      </section>
    </main>
    {!sessionEmail && <section className="content" style={{ paddingTop: 8 }}><div className="panel-card" style={{ maxWidth: 480, margin: 'auto' }}><div className="panel-head"><div><h3>{mode === 'login' ? 'Sign in to Rentora' : mode === 'register' ? 'Create your account' : 'Reset your password'}</h3><p>Access your bookings and secure payment history.</p></div></div>
      <form className="booking-form" onSubmit={submit}>{mode === 'register' && <label>Full name<input {...register('fullName')} placeholder="Your full name" /></label>}
        <label>Email<input {...register('email')} type="email" placeholder="you@example.com" />{errors.email && <small style={{ color: '#bb544a' }}>{errors.email.message}</small>}</label>
        {mode !== 'forgot' && <label>Password<input {...register('password')} type="password" placeholder="At least 8 characters" />{errors.password && <small style={{ color: '#bb544a' }}>{errors.password.message}</small>}</label>}
        <button className="btn btn-block">{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button>
        <button type="button" className="quiet-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New to Rentora? Create an account' : 'Already have an account? Sign in'}</button>
        {mode === 'login' && <button type="button" className="quiet-button" onClick={() => setMode('forgot')}>Forgot password?</button>}
      </form></div></section>}
    <SiteFooter />
  </>;
}
function RegisterOfficePage({ notify, onOfficeActivated }: { notify: (message: string) => void; onOfficeActivated: (slug: string) => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', address: '', phone: '', email: '', description: '' });
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, []);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) { notify('Connect Supabase before registering a rental office.'); return; }
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { notify('Please sign in or create a customer account first.'); navigate('/account?mode=register'); return; }
      const cityName = form.city.trim();
      const { data: city, error: cityError } = await supabase.from('cities').select('id').ilike('name', cityName).limit(1).maybeSingle();
      if (cityError) throw cityError;
      const baseSlug = form.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'rental-office';
      const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
      const { data, error } = await supabase.from('rental_offices').insert({
        owner_id: user.id, city_id: city?.id ?? null, name: form.name.trim(), slug,
        description: form.description.trim() || null, address: form.address.trim(),
        phone: form.phone.trim() || null, email: form.email.trim() || user.email,
        status: 'pending', verified_at: null, commission_rate: 0.1
      }).select('id,name,slug').single();
      if (error) throw error;
      notify(`Office application submitted for ${data.name}. It is awaiting admin approval.`);
      onOfficeActivated(data.slug);
      navigate('/office');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not submit the office application.');
    } finally { setLoading(false); }
  };
  return <><div className="page-heading"><span className="eyebrow">PARTNER WITH RENTORA</span><h1>Register your rental office</h1><p>Create an office account to list your vehicles and manage bookings. Your application will be reviewed before the office appears publicly.</p></div><main className="content" style={{ paddingTop: 22, maxWidth: 760 }}><div className="panel-card"><div className="panel-head"><div><h3>Office application</h3><p>Enter your rental business details.</p></div></div>{!signedIn ? <div className="empty-state"><h3>Sign in required</h3><p>Create a Rentora customer account or sign in first. You can then submit your office application.</p><Link className="btn" to="/account?mode=register">Create account / Sign in</Link></div> : <form className="booking-form" onSubmit={submit}><div className="form-grid"><label>Office name *<input required maxLength={120} value={form.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Damascus Car Rental" /></label><label>City *<input required maxLength={100} value={form.city} onChange={event => update('city', event.target.value)} placeholder="e.g. Damascus" /></label><label>Business address *<input required maxLength={240} value={form.address} onChange={event => update('address', event.target.value)} placeholder="Street, district, city" /></label><label>Business phone<input maxLength={40} value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="+963..." /></label><label>Business email<input type="email" maxLength={254} value={form.email} onChange={event => update('email', event.target.value)} placeholder="office@example.com" /></label><label className="full">Description<textarea rows={4} maxLength={1200} value={form.description} onChange={event => update('description', event.target.value)} placeholder="Tell customers about your rental office and services." /></label></div><p className="empty-note">Your application will be marked Pending until a Rentora administrator reviews it. You can access the office workspace after submitting.</p><button className="btn btn-block" disabled={loading}>{loading ? 'Submitting…' : 'Submit office registration'}</button></form>}</div></main><SiteFooter /></>;
}

function SiteLayout({ children, lang, setLang, notify }: { children: ReactNode; lang: Lang; setLang: (v: Lang) => void; notify: (s: string) => void }) { return <div className="app-shell"><MarketplaceHeader lang={lang} setLang={setLang} notify={notify} />{children}</div>; }

const officeNav: Array<[string, string, LucideIcon]> = [['overview', 'Overview', LayoutDashboard], ['fleet', 'Fleet management', CarFront], ['bookings', 'Bookings', CalendarDays], ['calendar', 'Rental calendar', CalendarDays], ['finance', 'Finance', Wallet], ['subscription', 'Subscription', CreditCard], ['customers', 'Customers', Users], ['staff', 'Office staff', Users], ['support', 'Support', LifeBuoy], ['reviews', 'Reviews', Star], ['promotions', 'Promotions', Zap], ['profile', 'Office profile', BadgeCheck], ['settings', 'Settings', Settings]];
const platformSectionPermissions: Record<string, string> = { overview: 'platform.read', offices: 'offices.manage', customers: 'customers.manage', subscriptions: 'subscriptions.manage', content: 'cms.manage', support: 'support.manage', staff: 'platform.manage', reviews: 'reviews.manage', promotions: 'promotions.manage', notifications: 'notifications.manage', settings: 'settings.manage', finance: 'finance.read', calendar: 'platform.read', bookings: 'bookings.manage' };
const officeSectionPermissions: Record<string, string> = { fleet: 'fleet.manage', bookings: 'bookings.manage', calendar: 'bookings.manage', finance: 'finance.read', customers: 'customers.read', staff: 'staff.manage', support: 'support.manage', reviews: 'reviews.manage', promotions: 'promotions.manage', profile: 'office.manage', settings: 'office.manage' };
const adminNav: Array<[string, string, LucideIcon]> = [['overview', 'Overview', LayoutDashboard], ['offices', 'Rental offices', BadgeCheck], ['customers', 'Customers', Users], ['bookings', 'All bookings', CalendarDays], ['finance', 'Finance', Wallet], ['subscriptions', 'Subscriptions', CreditCard], ['content', 'Content manager', FileText], ['promotions', 'Promotions', Zap], ['reviews', 'Review moderation', Star], ['support', 'Support & disputes', LifeBuoy], ['notifications', 'Notifications', Bell], ['staff', 'Admin & security', ShieldCheck], ['settings', 'Platform settings', Settings]];

function Status({ status }: { status: string }) { return <span className={`status-pill ${status}`}>{status}</span>; }
function DashboardStats({ rows }: { rows: Array<[string, string, string, string, LucideIcon]> }) { return <div className="stats-grid">{rows.map(([label, value, delta, direction, Icon]) => <div className="stat-card" key={label}><div className="stat-label">{label}<Icon size={15} /></div><div className="stat-value">{value}</div><div className={`stat-delta ${direction === 'down' ? 'down' : ''}`}>{direction === 'down' ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />} {delta === 'live Supabase records' ? delta : `${delta} vs last month`}</div></div>)}</div>; }
function RevenueChart({ admin = false }: { admin?: boolean }) { return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthRevenue} margin={{ top: 15, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id={admin ? 'adminRevenue' : 'officeRevenue'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={admin ? '#65afc9' : '#83ad73'} stopOpacity={0.25} /><stop offset="95%" stopColor={admin ? '#65afc9' : '#83ad73'} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#edf0ec" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 9, fill: '#8b968f' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#8b968f' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10, borderRadius: 10, border: '1px solid #e4e9e2' }} formatter={(value: number) => [money(value), 'Revenue']} /><Area type="monotone" dataKey="revenue" stroke={admin ? '#3886a4' : '#5d9160'} strokeWidth={2.3} fill={`url(#${admin ? 'adminRevenue' : 'officeRevenue'})`} /></AreaChart></ResponsiveContainer></div>; }
function RecentActivity({ admin = false }: { admin?: boolean }) { const items = admin ? [['New office application', 'Nour Car Rentals · Damascus', '8 min'], ['Booking dispute opened', 'RN-2046 · payment question', '42 min'], ['Payout processed', 'Levant Mobility · $2,840', '2 hr'], ['Review reported', 'Cedar Drive Co. · 1 report', '3 hr']] : [['New booking request', 'Yazan Mahmoud · BMW 3 Series', '8 min'], ['Pickup completed', 'Lina Saleh · Toyota Corolla', '1 hr'], ['New 5-star review', '“Great service, easy pickup”', '3 hr'], ['Vehicle added', 'Hyundai Tucson · 2022', 'yesterday']]; return <div className="activity-list">{items.map(([title, subtitle, time], index) => <div className="activity-item" key={title}><span className="activity-icon">{index === 0 ? <CalendarDays size={14} /> : index === 1 ? <Check size={14} /> : index === 2 ? <Star size={14} /> : <Activity size={14} />}</span><span><b>{title}</b><small>{subtitle}</small></span><span className="activity-time">{time}</span></div>)}</div>; }

function BookingTable({ bookings, onChange, admin = false }: { bookings: Booking[]; onChange: (id: string, status: BookingStatus, details?: BookingUpdateDetails) => void; admin?: boolean }) {
  const { fleet } = useFleet();
  const [filter, setFilter] = useState('All bookings'); const statuses = ['All bookings', 'pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected']; const filtered = filter === 'All bookings' ? bookings : bookings.filter(b => b.status === filter);
  const carName = (id: string) => fleet.find(v => v.id === id)?.name ?? (isDemoMode ? getVehicle(id).name : 'Vehicle details unavailable');
  return <div className="panel-card"><div className="panel-head"><div><h3>{admin ? 'Latest platform bookings' : 'Booking requests'}</h3><p>Review and move each rental through its lifecycle.</p></div><div className="toolbar"><select className="input" value={filter} onChange={e => setFilter(e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select><button className="quiet-button" onClick={() => { const csv = ['booking,customer,vehicle,status,total', ...filtered.map(b => `${b.number ?? b.id},${b.customer},${carName(b.vehicleId)},${b.status},${b.total}`)].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'rentora-bookings.csv'; a.click(); URL.revokeObjectURL(a.href); }}><Download size={13} /> CSV</button></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Booking ID</th><th>Customer</th><th>Vehicle</th><th>Rental dates</th>{admin && <th>Office</th>}<th>Status</th><th>Total</th><th>Action</th></tr></thead><tbody>{filtered.map(b => <tr key={b.id}><td><strong>{b.number ?? b.id}</strong></td><td>{b.customer}</td><td>{carName(b.vehicleId)}</td><td>{b.start} – {b.end}</td>{admin && <td>{isDemoMode ? offices.find(o => o.id === b.officeId)?.name ?? b.officeId : b.officeId}</td>}<td><Status status={b.status} /></td><td><strong>{money(b.total)}</strong></td><td><BookingOperations booking={b} onChange={(status, details) => onChange(b.id, status, details)} /></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-note">No bookings in this status.</div>}</div></div>;
}

function PortalDashboard({ admin, bookings, officeId }: { admin: boolean; bookings: Booking[]; officeId: string }) {
  if (isBackendConfigured) {
    const visibleBookings = admin ? bookings : bookings.filter(booking => booking.officeId === officeId);
    const liveStats: Array<[string, string, string, string, LucideIcon]> = [
      ['Bookings in view', String(visibleBookings.length), 'live Supabase records', 'up', CalendarDays],
      ['Pending requests', String(visibleBookings.filter(booking => booking.status === 'pending').length), 'awaiting a decision', 'up', Clock3],
      ['Active rentals', String(visibleBookings.filter(booking => booking.status === 'active').length), 'currently checked out', 'up', CarFront],
    ];
    return <><DashboardStats rows={liveStats} /><div className="panel-card"><h3>{admin ? 'Live platform activity' : 'Live office activity'}</h3><p style={{ color: '#758178', fontSize: 12 }}>Booking totals reflect the records available to your account. Open <Link to={admin ? '/admin/finance' : '/office/finance'}>Finance</Link> for payment records and reports, or <Link to={admin ? '/admin/support' : '/office/support'}>Support</Link> for current tickets and disputes.</p></div></>;
  }
  const stats: Array<[string, string, string, string, LucideIcon]> = admin ? [['Total customers', '2,480', '+12.8%', 'up', Users], ['Rental offices', '68', '+8.4%', 'up', BadgeCheck], ['Total bookings', '1,924', '+18.2%', 'up', CalendarDays], ['Platform revenue', '$18,420', '+14.1%', 'up', Wallet]] : [['Total revenue', '$6,240', '+12.4%', 'up', Wallet], ['Total bookings', '79', '+18.2%', 'up', CalendarDays], ['Pending requests', String(bookings.filter(b => b.status === 'pending').length + 4), '+2 new', 'up', Clock3], ['Available vehicles', '18', '92% fleet active', 'up', CarFront]];
  return <><DashboardStats rows={stats} /><div className="dash-grid"><section className="panel-card"><div className="panel-head"><div><h3>{admin ? 'Platform revenue' : 'Revenue overview'}</h3><p>Revenue performance over the last 6 months</p></div><select className="input"><option>Last 6 months</option><option>This year</option></select></div><RevenueChart admin={admin} /></section><section className="panel-card"><div className="panel-head"><div><h3>{admin ? 'Platform activity' : 'Recent activity'}</h3><p>What’s happening across your workspace</p></div><MoreHorizontal size={16} color="#849087" /></div><RecentActivity admin={admin} /></section></div><div style={{ marginTop: 15 }}><BookingTable bookings={bookings.slice(0, 5)} onChange={() => {}} admin={admin} /></div></>;
}

function BookingOperations({ booking, onChange }: { booking: Booking; onChange: (status: BookingStatus, details?: BookingUpdateDetails) => void }) {
  const [panel, setPanel] = useState(''); const [mileage, setMileage] = useState(''); const [fuel, setFuel] = useState('Full');
  const [lateMinutes, setLateMinutes] = useState('0'); const [damage, setDamage] = useState(''); const [notes, setNotes] = useState(''); const [photos, setPhotos] = useState<File[]>([]);
  const [history, setHistory] = useState<Array<{ old_status: string | null; new_status: string; created_at: string; note: string | null }>>([]); const [historyLoading, setHistoryLoading] = useState(false);
  const steps: Array<[string, BookingStatus, string]> = [['Confirm request', 'confirmed', 'Approve this booking and reserve the vehicle.'], ['Record pickup', 'active', 'Capture starting condition, mileage, and fuel level.'], ['Complete return', 'completed', 'Record return condition, late minutes, damage, and photos.']];
  const next = steps.find(step => step[1] === (booking.status === 'pending' ? 'confirmed' : booking.status === 'confirmed' ? 'active' : booking.status === 'active' ? 'completed' : ''));
  useEffect(() => {
    if (panel !== 'history' || !supabase || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(booking.id)) return;
    let cancelled = false; setHistoryLoading(true);
    void supabase.from('booking_status_history').select('old_status,new_status,created_at,note').eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => {
      if (!cancelled) { setHistory((data ?? []) as typeof history); setHistoryLoading(false); }
    });
    return () => { cancelled = true; };
  }, [panel, booking.id]);
  const submit = () => {
    if (panel === 'active' || panel === 'completed') {
      if (!mileage || !Number.isFinite(Number(mileage)) || Number(mileage) < 0) return;
      onChange(panel as BookingStatus, { odometer: Number(mileage), fuel, lateMinutes: Number(lateMinutes) || 0, damage: damage.trim() ? [{ description: damage.trim() }] : [], photos, notes });
    } else onChange(panel as BookingStatus, { notes });
    setPanel('');
  };
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><button className="btn btn-light btn-sm" onClick={() => setPanel(panel ? '' : 'history')}>History</button>{next && <button className="btn btn-sm" onClick={() => { setMileage(''); setPhotos([]); setDamage(''); setNotes(''); setPanel(next[1]); }}>{next[0]}</button>}{booking.status === 'pending' && <button className="quiet-button" onClick={() => onChange('rejected')}>Reject</button>}{panel && <div className="modal-backdrop" onClick={() => setPanel('')}><div className="modal" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2>{panel === 'history' ? 'Booking history' : steps.find(step => step[1] === panel)?.[0]}</h2><p>{booking.number ?? booking.id} · {booking.customer}</p></div><button className="modal-close" onClick={() => setPanel('')}><X size={15} /></button></div>{panel === 'history' ? <div className="activity-list">{historyLoading ? <div className="empty-note">Loading recorded activity…</div> : history.length ? history.map((item, index) => <div className="activity-item" key={item.created_at + index}><span className="activity-icon"><Activity size={14} /></span><span><b>{item.old_status ? item.old_status + ' → ' + item.new_status : 'Request ' + item.new_status}</b><small>{item.note ?? 'Booking status recorded'}</small></span><span className="activity-time">{new Date(item.created_at).toLocaleString()}</span></div>) : <div className="empty-note">Current status: {booking.status}. Status changes appear here after the database records them.</div>}</div> : <><p style={{ fontSize: 12, color: '#718078' }}>{steps.find(step => step[1] === panel)?.[2]}</p>{(panel === 'active' || panel === 'completed') && <div className="form-grid"><div className="field"><label>Odometer (km)</label><input type="number" min="0" value={mileage} onChange={event => setMileage(event.target.value)} placeholder="e.g. 42,180" required /></div><div className="field"><label>Fuel level</label><select value={fuel} onChange={event => setFuel(event.target.value)}><option>Full</option><option>Three-quarters</option><option>Half</option><option>Quarter</option><option>Empty</option></select></div>{panel === 'completed' && <><div className="field"><label>Late minutes</label><input type="number" min="0" value={lateMinutes} onChange={event => setLateMinutes(event.target.value)} /></div><div className="field"><label>Damage / additional charge notes</label><input value={damage} onChange={event => setDamage(event.target.value)} placeholder="Describe damage or additional charge" /></div></>}<div className="field full"><label>Inspection notes</label><textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Condition, handover notes, or other details" /></div><div className="field full"><label>Inspection photos</label><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setPhotos(Array.from(event.target.files ?? []))} /><small>JPEG, PNG, or WebP · up to 12 MB each.</small></div></div>}<button className="btn btn-block" style={{ marginTop: 17 }} onClick={submit}>{panel === 'active' ? 'Confirm pickup' : panel === 'completed' ? 'Complete return' : panel === 'confirmed' ? 'Approve booking' : 'Save update'}</button></>}</div></div>}</div>;
}

function DataTablePage({ section, admin, bookings, officeId, onChange, notify }: { section: string; admin: boolean; bookings: Booking[]; officeId: string; onChange: (id: string, status: BookingStatus, details?: BookingUpdateDetails) => void; notify: (s: string) => void }) {
  const { fleet, setFleet } = useFleet();
  const officeBookings = admin ? bookings : bookings.filter(b => b.officeId === officeId);
  if (section === 'overview') return <PortalDashboard admin={admin} bookings={bookings} officeId={officeId} />;
  if (section === 'bookings') return <BookingTable bookings={officeBookings} onChange={onChange} admin={admin} />;
  if (admin && section === 'offices') return <AdminOfficeManagement notify={notify} />;
  if (section === 'fleet') return <FleetManagementPage officeId={officeId} fleet={fleet} setFleet={setFleet} notify={notify} />;
  if (section === 'finance') return <FinanceManagementPage admin={admin} officeId={officeId} notify={notify} />;
  if (section === 'calendar') return <RentalCalendar officeId={admin ? '' : officeId} />;
  if (section === 'subscriptions' || section === 'subscription') return <SubscriptionManagement admin={admin} officeId={officeId} notify={notify} />;
  if (section === 'content') return <CmsManagement notify={notify} />;
  if (section === 'support') return <SupportManagement mode={admin ? 'admin' : 'office'} officeId={officeId} bookings={officeBookings} notify={notify} />;
  if (section === 'staff') return admin ? <PlatformStaffManagement notify={notify} /> : <OfficeStaffManagement officeId={officeId} notify={notify} />;
  if (section === 'customers') return <CustomerDirectory officeId={admin ? undefined : officeId} notify={notify} />;
  if (section === 'reviews') return <ReviewsManagement admin={admin} officeId={officeId} notify={notify} />;
  if (section === 'promotions') return <PromotionsManagement admin={admin} officeId={officeId} notify={notify} />;
  if (section === 'notifications') return <NotificationsManagement notify={notify} />;
  if (section === 'settings' && admin) return <PlatformSettingsManagement notify={notify} />;
  if (section === 'settings' || section === 'profile') return <OfficeProfileManagement officeId={officeId} notify={notify} />;
  const title = (admin ? adminNav : officeNav).find(x => x[0] === section)?.[1] ?? 'Workspace section';
  return <div className="panel-card"><h3>{title}</h3><div className="empty-note">This section is not available. Choose a module from the navigation.</div></div>;
}

function PortalShell({ admin, bookings, officeId, onChange, notify }: { admin: boolean; bookings: Booking[]; officeId: string; onChange: (id: string, status: BookingStatus, details?: BookingUpdateDetails) => void; notify: (s: string) => void }) {
  const location = useLocation(); const section = location.pathname.split('/')[2] || 'overview'; const [mobileOpen, setMobileOpen] = useState(false); const nav = admin ? adminNav : officeNav; const base = admin ? '/admin' : '/office'; const title = nav.find(x => x[0] === section)?.[1] ?? 'Overview';
  const [workspaceName,setWorkspaceName]=useState(admin?'Rentora':'Workspace');const [roleName,setRoleName]=useState(admin?'Platform staff':'Office member');const [profileName,setProfileName]=useState('');
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>(() => isBackendConfigured ? 'loading' : 'allowed');
  useEffect(() => {
    if (!supabase) { setAccess('allowed'); return; }
    const client = supabase;
    let active = true;
    const checkAccess = async () => {
      setAccess('loading');
      const { data: { session } } = await client.auth.getSession();
      if (!session) { if (active) setAccess('denied'); return; }
      const profile = await client.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
      if (active) setProfileName(profile.data?.full_name ?? '');
      let allowed = false;
      if (admin) {
        const roles = await client.from('user_roles').select('role').eq('user_id', session.user.id).is('scope_office_id', null);
        const isSuperAdmin = roles.data?.some(row => row.role === 'super_admin') ?? false;
        const isAdminStaff = roles.data?.some(row => row.role === 'admin_staff') ?? false;
        if (active) { setWorkspaceName('Rentora'); setRoleName(isSuperAdmin ? 'Super Admin' : isAdminStaff ? 'Admin Staff' : ''); }
        if (isSuperAdmin) allowed = true;
        else if (isAdminStaff) {
          const required = platformSectionPermissions[section];
          if (required) {
            const permissions = await client.from('role_permissions').select('permission_id').eq('role', 'admin_staff').in('permission_id', [required, 'platform.manage']);
            allowed = Boolean(permissions.data?.length);
          }
        }
      } else {
        const offices = await client.rpc('list_my_offices');
        const office = !offices.error ? (offices.data ?? []).find((row: { id: string; slug: string; name: string; office_role: string }) => row.slug === officeId) : undefined;
        if (office) {
          if (active) { setWorkspaceName(office.name); setRoleName(office.office_role.replaceAll('_', ' ')); }
          const required = officeSectionPermissions[section];
          if (section === 'subscription') allowed = office.office_role === 'office_owner';
          else if (!required || section === 'overview') allowed = true;
          else {
            const permission = await client.rpc('has_office_permission', { target_office: office.id, required_permission: required });
            allowed = permission.data === true;
          }
        }
      }
      if (active) setAccess(allowed ? 'allowed' : 'denied');
    };
    let accessTimeout = 0;
    void checkAccess();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) setAccess('denied');
      else { setAccess('loading'); accessTimeout = window.setTimeout(() => { void checkAccess(); }, 0); }
    });
    return () => { active = false; window.clearTimeout(accessTimeout); subscription.unsubscribe(); };
  }, [admin, officeId, section]);
  if (access !== 'allowed') return <div className="app-shell"><div className="page-heading"><span className="eyebrow">{admin ? 'ADMINISTRATION' : 'OFFICE WORKSPACE'}</span><h1>{access === 'loading' ? 'Checking access…' : 'Access required'}</h1><p>{access === 'loading' ? 'Verifying your account permissions.' : admin ? 'Sign in with an authorized platform admin account.' : 'Sign in with an active member account for this rental office.'}</p><Link to="/account" className="btn btn-sm">Sign in</Link></div></div>;
  const initials=(profileName||workspaceName).trim().split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'R';
  const exportReport=()=>{const rows=admin?bookings:bookings.filter(booking=>booking.officeId===officeId);if(!rows.length){notify('There are no bookings to export.');return;}const encode=(value:string|number)=>{const safe=String(value).replace(/^[=+\-@]/,'\'$&');return `"${safe.replaceAll('"','""')}"`;};const csv=[['Booking','Customer','Status','Pick-up','Return','Total'],...rows.map(booking=>[booking.number??booking.id,booking.customer,booking.status,booking.start,booking.end,booking.total])].map(row=>row.map(value=>encode(value)).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`rentora-bookings-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);notify('Booking report downloaded.');};
  return <div className="dashboard-shell"><div className={`mobile-side-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} /><aside className={`side-nav ${admin ? 'admin' : ''} ${mobileOpen ? 'open' : ''}`}><div className="side-brand"><Brand /></div><div className="workspace-label">{admin ? 'Platform control' : 'Workspace'}<div style={{ float: 'right', color: '#c8f169' }}>●</div></div>{nav.map(([id, label, Icon]) => <NavLink key={id} to={`${base}/${id}`} onClick={() => setMobileOpen(false)} className={({ isActive }) => `side-link ${isActive || (id === 'overview' && section === '') ? 'active' : ''}`}><Icon size={15} />{label}{id === 'bookings' && bookings.filter(b => b.status === 'pending').length > 0 && <span style={{ marginLeft: 'auto', background: '#c8f169', color: '#1d382f', padding: '2px 6px', borderRadius: 8, fontSize: 8 }}>{bookings.filter(b => b.status === 'pending').length}</span>}</NavLink>)}<div className="side-nav-bottom"><Link className="side-link" to="/"><ArrowLeft size={15} /> Back to marketplace</Link><div className="side-user"><span className="avatar" style={{ background: '#d2ebcb' }}>{initials}</span><span style={{ fontSize: 11, fontWeight: 700 }}>{profileName || workspaceName}<small>{roleName}</small></span><MoreHorizontal size={17} style={{ marginLeft: 'auto' }} /></div></div></aside><section className="dashboard-main"><header className="dash-topbar"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={18} /></button><span className="crumb">{admin ? 'Admin panel' : 'Office portal'} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} /> <b>{title}</b></span></div><div className="dash-actions"><span className="avatar">{initials}</span></div></header><main className="dash-body"><div className="dash-title"><div><h1>{section === 'overview' ? (admin ? 'Platform overview' : 'Welcome' + (profileName ? ', ' + profileName : '')) : title}</h1><p>{section === 'overview' ? (admin ? 'Here’s what’s happening across Rentora today.' : 'Here’s the latest from your rental office.') : `Manage ${title.toLowerCase()} and keep your operation moving.`}</p></div>{section === 'overview' && <button className="btn btn-sm btn-light" onClick={exportReport}><Download size={13} /> Download report</button>}</div><DataTablePage key={`${admin}-${section}`} section={section} admin={admin} bookings={bookings} officeId={officeId} onChange={onChange} notify={notify} /></main></section></div>;
}

export default function App() {
  const navigate = useNavigate(); const [lang, setLang] = useState<Lang>(() => persist<Lang>('rentora.language', 'en'));
  const [favorites, setFavorites] = useState<string[]>(() => isDemoMode ? persist('rentora.favorites', ['car-3']) : []);
  const [fleet, setFleet] = useState<Vehicle[]>(() => isDemoMode ? persist('rentora.fleet.demo', seededVehicles) : []);
  const fleetContext = useMemo(() => ({ fleet, setFleet }), [fleet]);
  const [officeId, setOfficeId] = useState<string>(() => isDemoMode ? persist('rentora.officeId', 'levant-mobility') : '');
  const [bookings, setBookings] = useState<Booking[]>(() => isDemoMode ? persist('rentora.bookings.demo', initialBookings) : []);
  const { notify, Notice } = useNotice();
  useEffect(() => { if (!isBackendConfigured) return; api<{ cars: RemoteCar[] }>('/cars').then(data => setFleet(data.cars.map(mapRemoteCar))).catch(() => {}); }, []);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const refreshSession = async (token: string, userId: string) => {
      try { const result = await api<{ bookings: RemoteBooking[] }>('/bookings', { headers: { authorization: `Bearer ${token}` } }); setBookings(result.bookings.map(mapRemoteBooking)); } catch { /* customer sessions can have no bookings */ }
      try { const result = await api<{ offices: OfficeWorkspace[] }>('/offices/mine', { headers: { authorization: `Bearer ${token}` } }); if (result.offices[0]) setOfficeId(result.offices[0].slug); } catch { /* account may not have an office workspace */ }
      try { const result = await client.from('favorites').select('vehicle_id').eq('user_id', userId); if (!result.error) setFavorites((result.data ?? []).map(row => row.vehicle_id)); } catch { /* favorites can be unavailable until migrations are applied */ }
    };
    client.auth.getSession().then(({ data }) => { if (data.session) void refreshSession(data.session.access_token, data.session.user.id); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { if (session) void refreshSession(session.access_token, session.user.id); else { setBookings([]); setOfficeId(''); setFavorites([]); } });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { localStorage.setItem('rentora.language', JSON.stringify(lang)); document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('rentora.fleet.demo', JSON.stringify(fleet)); }, [fleet]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('rentora.favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('rentora.bookings.demo', JSON.stringify(bookings)); }, [bookings]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('rentora.officeId', JSON.stringify(officeId)); }, [officeId]);
  const toggleFavorite = async (id: string) => {
    const removing = favorites.includes(id);
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { notify('Sign in to save cars to your account.'); navigate('/account'); return; }
      const result = removing
        ? await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('vehicle_id', id)
        : await supabase.from('favorites').insert({ user_id: session.user.id, vehicle_id: id });
      if (result.error) { notify(result.error.message); return; }
    }
    setFavorites(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const createBooking = async (vehicle: Vehicle, fields: { start: string; end: string; name: string; delivery: boolean; insurance: boolean; extraDriver: boolean }) => {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { notify('Sign in before requesting a booking.'); navigate('/account'); return; }
      try {
        const response = await api<{ booking: RemoteBooking & { total_amount: number; status: BookingStatus } }>('/bookings', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({
          vehicle_id: vehicle.id, pickup_at: new Date(`${fields.start}T12:00:00.000Z`).toISOString(), return_at: new Date(`${fields.end}T12:00:00.000Z`).toISOString(),
          pickup_address: `${vehicle.city} City`, return_address: `${vehicle.city} City`, delivery: fields.delivery, insurance: fields.insurance, extra_driver: fields.extraDriver, note: `Driver: ${fields.name}`,
        }) });
        const row = response.booking;
        setBookings(current => [mapRemoteBooking({ ...row, booking_number: row.booking_number ?? row.id, customer_id: row.customer_id ?? session.user.id, office_id: row.office_id ?? '', vehicle_id: row.vehicle_id ?? vehicle.id, pickup_address: row.pickup_address ?? `${vehicle.city} City`, return_address: row.return_address ?? `${vehicle.city} City`, pickup_at: row.pickup_at ?? new Date(`${fields.start}T12:00:00.000Z`).toISOString(), return_at: row.return_at ?? new Date(`${fields.end}T12:00:00.000Z`).toISOString(), profiles: { full_name: session.user.user_metadata.full_name ?? fields.name }, vehicles: { slug: vehicle.id }, rental_offices: { slug: vehicle.officeId, name: vehicle.officeName ?? (isDemoMode ? getOffice(vehicle.officeId).name : 'Rental office') } }), ...current]);
        notify(`Request ${row.booking_number ?? row.id} sent to ${vehicle.officeName ?? (isDemoMode ? getOffice(vehicle.officeId).name : 'Rental office')}.`); navigate('/account');
      } catch (error) { notify(error instanceof Error ? error.message : 'Booking request could not be created.'); }
      return;
    }
    if (!isDemoMode) { notify('Connect Supabase before requesting a booking.'); return; }
    const quote = calculateQuote(vehicle, fields); const id = `RN-${Math.floor(3000 + Math.random() * 6000)}`;
    setBookings(current => [{ id, number: id, customer: fields.name, vehicleId: vehicle.id, officeId: vehicle.officeId, pickup: `${vehicle.city} City`, dropoff: `${vehicle.city} City`, start: fields.start, end: fields.end, status: 'pending', total: quote.total }, ...current]);
    notify(`Request ${id} sent to ${vehicle.officeName ?? (isDemoMode ? getOffice(vehicle.officeId).name : 'Rental office')}.`); navigate('/account');
  };
  const updateBooking = async (id: string, status: BookingStatus, details?: BookingUpdateDetails) => {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { notify('Sign in with an office account to manage bookings.'); return; }
      const action = status === 'confirmed' || status === 'rejected' ? 'decision' : status === 'active' ? 'pickup' : status === 'completed' ? 'return' : 'cancel';
      const body = action === 'decision' ? { approve: status === 'confirmed' }
        : action === 'pickup' ? { odometer_km: details?.odometer, fuel_level: details?.fuel, notes: details?.notes }
          : action === 'return' ? { odometer_km: details?.odometer, fuel_level: details?.fuel, late_minutes: details?.lateMinutes ?? 0, damage: details?.damage ?? [] }
            : { reason: 'Cancelled by office' };
      try {
        await api(`/bookings/${id}/${action}`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
        setBookings(current => current.map(b => b.id === id ? { ...b, status } : b));
        if ((action === 'pickup' || action === 'return') && details?.photos?.length) {
          const inspectionType = action;
          const { data: existingInspection, error: inspectionError } = await supabase.from('inspection_records').select('id').eq('booking_id', id).eq('inspection_type', inspectionType).order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (inspectionError) throw new Error(`Booking updated, but inspection photos could not be attached: ${inspectionError.message}`);
          let inspection = existingInspection;
          if (!inspection) {
            const created = await supabase.from('inspection_records').insert({ booking_id: id, inspection_type: inspectionType, damage_report: details.damage ?? [], condition_summary: details.notes ?? null }).select('id').single();
            if (created.error) throw new Error(`Booking updated, but inspection photos could not be attached: ${created.error.message}`);
            inspection = created.data;
          }
          const photoRows: Array<{ inspection_id: string; storage_path: string; caption: string }> = [];
          for (const [index, photo] of details.photos.entries()) {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 12 * 1024 * 1024) throw new Error(`${photo.name} must be a JPEG, PNG, or WebP image under 12 MB.`);
            const path = `${id}/${inspectionType}/${crypto.randomUUID()}_${photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const upload = await supabase.storage.from('booking-inspections').upload(path, photo, { contentType: photo.type });
            if (upload.error) throw new Error(`Booking updated, but ${photo.name} could not be uploaded: ${upload.error.message}`);
            photoRows.push({ inspection_id: inspection.id, storage_path: path, caption: `${inspectionType} inspection photo ${index + 1}` });
          }
          const savedPhotos = await supabase.from('inspection_photos').insert(photoRows);
          if (savedPhotos.error) throw new Error(`Booking updated, but photo records could not be saved: ${savedPhotos.error.message}`);
        }
        notify(`${id} updated to ${status}.`);
      }
      catch (error) { notify(error instanceof Error ? error.message : 'Booking update was not accepted.'); }
      return;
    }
    if (!isDemoMode) { notify('Connect Supabase before updating bookings.'); return; }
    setBookings(current => current.map(b => b.id === id ? { ...b, status } : b)); notify(`${id} updated to ${status}.`);
  };
  const pathname = useLocation().pathname;
  if (!supabase && import.meta.env.PROD) return <main className="app-shell"><section className="page-heading"><span className="eyebrow">RENTORA SETUP</span><h1>Connect your Supabase project</h1><p>This production build needs its Supabase URL and public anon key before it can display marketplace inventory or open customer, office, and admin workspaces.</p><p>Set <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>, and the Worker API URL in the production build environment, then rebuild.</p></section></main>;
  return <FleetContext.Provider value={fleetContext}><Routes><Route path="/" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><Home lang={lang} favorites={favorites} onFavorite={toggleFavorite} navigate={navigate} /></SiteLayout>} /><Route path="/cars" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><CarsPage favorites={favorites} onFavorite={toggleFavorite} /></SiteLayout>} /><Route path="/cars/:vehicleId" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><VehicleDetails favorites={favorites} onFavorite={toggleFavorite} onBook={createBooking} notify={notify} /></SiteLayout>} /><Route path="/offices" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><OfficesPage /></SiteLayout>} /><Route path="/offices/:officeId" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><OfficeDetailsPage /></SiteLayout>} /><Route path="/register-office" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><RegisterOfficePage notify={notify} onOfficeActivated={setOfficeId} /></SiteLayout>} /><Route path="/account/*" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><AccountPage bookings={bookings} notify={notify} favorites={favorites} onFavorite={toggleFavorite} onOfficeActivated={setOfficeId} /></SiteLayout>} />{['cities', 'offers', 'about', 'contact', 'faq', 'terms', 'privacy'].map(page => <Route key={page} path={`/${page}`} element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><ContentPage page={page} lang={lang} /></SiteLayout>} />)}<Route path="/office" element={<PortalShell admin={false} bookings={bookings} officeId={officeId} onChange={updateBooking} notify={notify} />} /><Route path="/office/*" element={<PortalShell admin={false} bookings={bookings} officeId={officeId} onChange={updateBooking} notify={notify} />} /><Route path="/admin" element={<PortalShell admin bookings={bookings} officeId={officeId} onChange={updateBooking} notify={notify} />} /><Route path="/admin/*" element={<PortalShell admin bookings={bookings} officeId={officeId} onChange={updateBooking} notify={notify} />} /><Route path="*" element={<SiteLayout lang={lang} setLang={setLang} notify={notify}><ContentPage page="about" lang={lang} /></SiteLayout>} /></Routes><Notice />{(pathname.startsWith('/office') || pathname.startsWith('/admin')) && isDemoMode && <div style={{ position: 'fixed', bottom: 10, left: 255, zIndex: 25, fontSize: 8, background: '#e8f0e7', color: '#53705b', padding: '5px 8px', borderRadius: 7 }}>{pathname.startsWith('/admin') ? 'DEMO ADMIN · sample records' : 'DEMO OFFICE · local session'}</div>}</FleetContext.Provider>;
}
