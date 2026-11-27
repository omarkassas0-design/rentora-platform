import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Bell, CalendarDays, CarFront, Check, ChevronDown, ChevronRight, Clock3, CreditCard, Download, FileText, Fuel, Gauge, Globe2, Heart, LayoutDashboard, LifeBuoy, LogOut, MapPin, Megaphone, Menu, MoreHorizontal, Search, Settings, ShieldCheck, SlidersHorizontal, Star, Users, Wallet, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cities, getOffice, getVehicle, initialBookings, money, monthRevenue, offices, vehicles as seededVehicles, type Booking, type BookingStatus, type Vehicle } from './lib/domain';
import { calculateQuote } from './lib/pricing';
import { hasPlatformSectionAccess, resolvePlatformLanding } from './lib/portalAccess';
import { currentLanguage, formatCurrency, formatDate, formatDateTime, formatNumber, uiText } from './lib/locale';
import { api, isBackendConfigured, isDemoMode, supabase } from './lib/supabase';
import FleetManagementPage from './FleetManagement';
import AdminOfficeManagement from './AdminOfficeManagement';
import FinanceManagementPage from './FinanceManagement';
import CustomerPaymentCenter from './CustomerPaymentCenter';
import AdsManagement, { PublicAdCarousel } from './AdsManagement';
import SalesMarketplace from './SalesMarketplace';
import RentalListingModeration from './RentalListingModeration';
import { CmsHomeHighlights, CmsManagement, CmsPublicFaqs, CmsPublicPage, CustomerDirectory, NotificationsManagement, OfficeProfileManagement, OfficeStaffManagement, PlatformSettingsManagement, PlatformStaffManagement, PromotionsManagement, RentalCalendar, ReviewsManagement, SubscriptionManagement, SupportManagement } from './OperationalModules';

type Lang = 'en' | 'ar';
type Currency = 'USD' | 'SYP';
type CityOption = { name: string; name_ar?: string | null };
const formatPrice = (vehicle: Vehicle, currency: Currency, period: 'daily' | 'weekly' | 'monthly' | 'deposit' = 'daily') => {
  const usd = period === 'daily' ? vehicle.price : period === 'weekly' ? vehicle.weeklyPrice : period === 'monthly' ? vehicle.monthlyPrice : vehicle.deposit;
  const syp = period === 'daily' ? vehicle.dailyPriceSyp : period === 'weekly' ? vehicle.weeklyPriceSyp : period === 'monthly' ? vehicle.monthlyPriceSyp : vehicle.depositSyp;
  if (currency === 'SYP') return syp == null ? (document.documentElement.lang === 'ar' ? '— ل.س' : '— SYP') : formatCurrency(syp, 'SYP');
  return formatCurrency(usd ?? 0, 'USD');
};
type BookingUpdateDetails = { odometer?: number; fuel?: string; lateMinutes?: number; damage?: Array<{ description: string }>; photos?: File[]; notes?: string };
const labels: Record<string, { en: string; ar: string }> = {
  cars: { en: 'Rent a car', ar: 'استئجار سيارة' }, buyCars: { en: 'Buy a car', ar: 'شراء سيارة' }, offices: { en: 'Rental offices', ar: 'مكاتب التأجير' }, cities: { en: 'Cities', ar: 'المدن' }, offers: { en: 'Offers', ar: 'العروض' }, about: { en: 'About', ar: 'من نحن' }, login: { en: 'Log in', ar: 'تسجيل الدخول' }, signup: { en: 'Get started', ar: 'ابدأ الآن' },
  pickup: { en: 'Pick-up location', ar: 'موقع الاستلام' }, pickupDate: { en: 'Pick-up date', ar: 'تاريخ الاستلام' }, returnDate: { en: 'Return date', ar: 'تاريخ الإعادة' }, search: { en: 'Search cars', ar: 'ابحث عن سيارة' },
};
const tr = (key: string, lang: Lang) => labels[key]?.[lang] ?? key;
const persist = <T,>(key: string, initial: T): T => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) as T : initial; } catch { return initial; } };
const todayPlus = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
type FleetContextValue = { fleet: Vehicle[]; setFleet: Dispatch<SetStateAction<Vehicle[]>> };
const FleetContext = createContext<FleetContextValue>({ fleet: isDemoMode ? seededVehicles : [], setFleet: () => {} });
const useFleet = () => useContext(FleetContext);
type RemoteCar = { id: string; slug: string; office_id: string; office_slug: string; office_name: string; city: string; category: string; make: string; model: string; model_year: number; transmission: string; fuel_type: string; seating_capacity: number; daily_rate: number; weekly_rate?: number; monthly_rate?: number; deposit_amount: number; daily_rate_syp?: number | null; weekly_rate_syp?: number | null; monthly_rate_syp?: number | null; deposit_amount_syp?: number | null; mileage_limit_daily?: number; color?: string; primary_image_path?: string; average_rating?: number; review_count?: number };
type RemoteBooking = { id: string; booking_number: string; customer_id: string; office_id: string; vehicle_id: string; pickup_address: string; return_address: string; pickup_at: string; return_at: string; status: BookingStatus; total_amount: number; vehicles?: { slug: string } | null; rental_offices?: { slug: string; name: string } | null; profiles?: { full_name: string } | null };
type OfficeWorkspace = { id: string; slug: string; name: string; office_role: string };
function mapRemoteCar(row: RemoteCar): Vehicle {
  const imageUrl = row.primary_image_path && supabase ? supabase.storage.from('vehicle-images').getPublicUrl(row.primary_image_path).data.publicUrl : undefined;
  return { id: row.id, name: `${row.make} ${row.model}`, make: row.make, model: row.model, year: row.model_year, category: row.category,
    transmission: row.transmission.toLowerCase() === 'manual' ? 'Manual' : 'Automatic', fuel: (row.fuel_type.charAt(0).toUpperCase() + row.fuel_type.slice(1)) as Vehicle['fuel'], seats: row.seating_capacity,
    price: Number(row.daily_rate), weeklyPrice: row.weekly_rate ? Number(row.weekly_rate) : undefined, monthlyPrice: row.monthly_rate ? Number(row.monthly_rate) : undefined,
    deposit: Number(row.deposit_amount), dailyPriceSyp: row.daily_rate_syp == null ? undefined : Number(row.daily_rate_syp), weeklyPriceSyp: row.weekly_rate_syp == null ? undefined : Number(row.weekly_rate_syp), monthlyPriceSyp: row.monthly_rate_syp == null ? undefined : Number(row.monthly_rate_syp), depositSyp: Number(row.deposit_amount_syp ?? 0), officeId: row.office_slug, officeName: row.office_name, city: row.city, rating: Number(row.average_rating) || 4.8,
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

function Brand() { return <Link className="brand" to="/"><span className="brand-mark"><CarFront size={20} strokeWidth={2.5} /></span><span>Motara<small>{uiText('BUY · RENT · SELL')}</small></span></Link>; }

function MarketplaceHeader({ lang, setLang, currency, setCurrency }: { lang: Lang; setLang: (v: Lang) => void; currency: Currency; setCurrency: (v: Currency) => void }) {
  const nav = [{ to: '/cars', key: 'cars' }, { to: '/buy-cars', key: 'buyCars' }, { to: '/offices', key: 'offices' }, { to: '/cities', key: 'cities' }, { to: '/offers', key: 'offers' }, { to: '/about', key: 'about' }];
  const [menuOpen, setMenuOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) { setSignedIn(false); return; }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session)); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  return <header className="topbar"><div className="topbar-inner"><Brand /><nav className={`nav-links ${menuOpen ? 'open' : ''}`}>{nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{tr(item.key, lang)}</NavLink>)}</nav><div className="top-actions"><button className="icon-button language-action" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} aria-label={lang === 'ar' ? 'تغيير اللغة' : 'Switch language'}><Globe2 size={15} /> {lang === 'en' ? 'EN' : 'عربي'} <ChevronDown size={13} /></button><label className="icon-button language-action" style={{ gap: 5 }} aria-label={lang === 'ar' ? 'العملة' : 'Currency'}><select value={currency} onChange={event => setCurrency(event.target.value as Currency)} style={{ border: 0, background: 'transparent', color: 'inherit', font: 'inherit', outline: 0, cursor: 'pointer' }}><option value="USD">{lang === 'ar' ? 'الدولار الأمريكي' : 'US Dollar (USD)'}</option><option value="SYP">{lang === 'ar' ? 'الليرة السورية' : 'Syrian Pound (SYP)'}</option></select><ChevronDown size={13} /></label>{signedIn ? <Link className="btn btn-sm" to="/account">{lang === 'ar' ? 'حسابي' : 'My account'}</Link> : <><Link className="quiet-button" to="/account">{tr('login', lang)}</Link><Link className="btn btn-sm" to="/account?mode=register">{tr('signup', lang)}</Link></>}<Link className="quiet-button" to="/sell-car">{lang === 'ar' ? 'اعرض سيارتك' : 'Sell your car'}</Link><Link className="quiet-button" to="/register-office">{lang === 'ar' ? 'سجّل مكتبك' : 'Register your office'}</Link><button className="icon-button mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-label={menuOpen ? (lang === 'ar' ? 'إغلاق القائمة' : 'Close menu') : (lang === 'ar' ? 'فتح القائمة' : 'Open menu')}><Menu size={19} /></button></div></div></header>;
}

function SiteFooter() { return <footer className="site-footer"><div className="footer-inner"><div><Brand /><p style={{ maxWidth: 230, marginTop: 15 }}>{uiText('One place to buy, rent, and sell cars. Explore trusted listings and rental partners across Syria.')}</p></div><div><h4>{uiText('Explore')}</h4><Link to="/cars">{uiText('Browse rental cars')}</Link><Link to="/buy-cars">{uiText('Cars for sale')}</Link><Link to="/sell-car">{uiText('Sell your car')}</Link><Link to="/offices">{uiText('Rental offices')}</Link><Link to="/cities">{uiText('Popular cities')}</Link><Link to="/offers">{uiText('Latest offers')}</Link></div><div><h4>{uiText('Motara')}</h4><Link to="/about">{uiText('About us')}</Link><Link to="/contact">{uiText('Contact')}</Link><Link to="/faq">{uiText('Help center')}</Link><Link to="/register-office">{uiText('Register your rental office')}</Link></div><div><h4>{uiText('Good to know')}</h4><Link to="/terms">{uiText('Terms & conditions')}</Link><Link to="/privacy">{uiText('Privacy policy')}</Link><Link to="/faq">{uiText('Frequently asked questions')}</Link><Link to="/admin/login">{uiText('Platform administration')}</Link><p>{uiText('English · العربية')}</p></div></div><div className="footer-bottom"><span>{uiText('© 2026 Motara Marketplace')}</span><span>{uiText('Made for the road ahead.')}</span></div></footer>; }

function VehicleArt({ vehicle, large = false }: { vehicle: Vehicle; large?: boolean }) {
  const tone = vehicle.category === 'Premium' ? 'dark' : vehicle.category === 'SUV' ? 'blue' : vehicle.category === 'Economy' ? 'gold' : '';
  return <div className={`vehicle-art ${tone}`} style={large ? { height: 390, backgroundColor: vehicle.color } : { backgroundColor: vehicle.color }}>{vehicle.imageUrl ? <img className="vehicle-photo" src={vehicle.imageUrl} alt={`${vehicle.year} ${vehicle.name}`} /> : <div className="car-shape"><span className="wheel left" /><span className="wheel right" /></div>}<span className="art-type">{vehicle.category}</span><span className="art-label">{vehicle.make}</span>{large && <span style={{ position: 'absolute', right: 18, bottom: 17, color: '#7b8780', fontSize: 11 }}>{vehicle.year} · {vehicle.model}</span>}</div>;
}

function VehicleCard({ vehicle, favorite, onFavorite, currency = 'USD' }: { vehicle: Vehicle; favorite: boolean; onFavorite: (id: string) => void; currency?: Currency }) {
  return <article className="vehicle-card"><div style={{ position: 'relative' }}><Link to={`/cars/${vehicle.id}`} aria-label={`View ${vehicle.name}`}><VehicleArt vehicle={vehicle} /></Link><button className={`heart ${favorite ? 'on' : ''}`} onClick={() => onFavorite(vehicle.id)} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /></button>{vehicle.popular && <span style={{ position: 'absolute', right: 14, bottom: 12, zIndex: 4, padding: '6px 8px', borderRadius: 7, background: '#ffffffdc', color: '#3b5546', fontSize: 9, fontWeight: 800 }}>{uiText('POPULAR')}</span>}</div><div className="vehicle-info"><div className="vehicle-title-line"><div><Link to={`/cars/${vehicle.id}`}><h3>{vehicle.name}</h3></Link><p>{formatNumber(vehicle.year)} · {vehicle.officeName ?? (isDemoMode ? getOffice(vehicle.officeId).name : 'Rental office')}</p></div><div className="rating"><Star size={12} /> {formatNumber(vehicle.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div></div><div className="vehicle-specs"><span><Users size={13} /> {formatNumber(vehicle.seats)} {uiText("seats")}</span><span><Zap size={13} /> {vehicle.transmission}</span><span><Fuel size={13} /> {vehicle.fuel}</span></div><div className="vehicle-bottom"><div className="price">{formatPrice(vehicle, currency)}<small> / {uiText('day')}</small></div><Link className="link-arrow" to={`/cars/${vehicle.id}`}>{uiText("View details")} <ArrowRight size={13} /></Link></div></div></article>;
}

function LocalizedDateInput({ value, onChange, lang, min, required = false, ariaLabel }: { value: string; onChange: (value: string) => void; lang: Lang; min?: string; required?: boolean; ariaLabel: string }) {
  const displayValue = (() => {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    const formatted = `${day}/${month}/${year}`;
    return lang === 'ar' ? formatted.replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]) : formatted;
  })();
  return <span className={`localized-date-input ${lang === 'ar' ? 'is-rtl' : 'is-ltr'}`}>
    <CalendarDays size={15} aria-hidden="true" />
    <span className="localized-date-value" aria-hidden="true">{displayValue || (lang === 'ar' ? 'اختر التاريخ' : 'Select date')}</span>
    <input type="date" value={value} min={min} required={required} aria-label={ariaLabel} onChange={event => onChange(event.target.value)} />
  </span>;
}

function SearchBar({ lang, navigate }: { lang: Lang; navigate: (to: string) => void }) {
  const [city, setCity] = useState(isDemoMode ? cities[0]?.name ?? '' : ''); const [cityOptions,setCityOptions]=useState<CityOption[]>(()=>isDemoMode?cities.map(item=>({name:item.name,name_ar:item.ar})):[]); const [start, setStart] = useState(todayPlus(2)); const [end, setEnd] = useState(todayPlus(5));
  useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('cities').select('name,name_ar').eq('is_active',true).order('name').limit(300).then(result=>{if(!alive)return;if(result.error)return;const options=(result.data??[]) as CityOption[];setCityOptions(options);setCity(current=>options.some(item=>item.name===current)?current:options[0]?.name??'');});return()=>{alive=false;};},[]);
  const submit = (event: FormEvent) => { event.preventDefault(); const params = new URLSearchParams({ city, start, end }); navigate(`/cars?${params.toString()}`); };
  return <form className="search-panel" onSubmit={submit}><div className="search-field"><label>{tr('pickup', lang)}</label><select value={city} onChange={e => setCity(e.target.value)} required disabled={!cityOptions.length}><option value="" disabled>{cityOptions.length?'Choose a city':'Loading cities…'}</option>{cityOptions.map(item=><option key={item.name} value={item.name}>{lang==='ar'?(item.name_ar||item.name):item.name}</option>)}</select></div><div className="search-field"><label>{tr('pickupDate', lang)}</label><LocalizedDateInput value={start} onChange={setStart} lang={lang} min={todayPlus(0)} required ariaLabel={tr('pickupDate', lang)} /></div><div className="search-field"><label>{tr('returnDate', lang)}</label><LocalizedDateInput value={end} onChange={setEnd} lang={lang} min={start} required ariaLabel={tr('returnDate', lang)} /></div><button className="btn" type="submit" disabled={!city}><Search size={15} /> {tr('search', lang)}</button></form>;
}

function Home({ lang, favorites, onFavorite, navigate, currency }: { lang: Lang; favorites: string[]; onFavorite: (id: string) => void; navigate: (to: string) => void; currency: Currency }) {
  const { fleet } = useFleet();
  return <><PublicAdCarousel /><section className="hero"><div className="hero-inner"><div className="hero-copy"><span className="eyebrow"><span className="dot" /> {uiText('THE ROAD IS YOURS')}</span><h1>{uiText("Find your drive.")}<br /><span>{uiText('Go your way.')}</span></h1><p>{uiText('Buy, rent, or sell with confidence. Discover cars for sale and trusted local rental offices in one place.')}</p><SearchBar lang={lang} navigate={navigate} /><div className="hero-foot"><span>{uiText('Browse cars for sale, compare rental prices, and connect with trusted local partners.')}</span><BadgeCheck size={15} color="#5d8a62" /></div></div><div className="hero-art"><div className="hero-car"><span className="wheel left" /><span className="wheel right" /></div></div></div></section><CmsHomeHighlights language={lang}/><main className="content"><div className="section-head"><div><span className="eyebrow">{uiText('A GOOD PLACE TO START')}</span><h2>{uiText('Cars for every kind of day')}</h2><p>{uiText('Handpicked rides from verified local partners.')}</p></div><Link to="/cars" className="link-arrow">{uiText("Explore all cars")} <ArrowRight size={14} /></Link></div><div className="car-grid">{fleet.slice(0, 6).map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} favorite={favorites.includes(vehicle.id)} onFavorite={onFavorite} currency={currency} />)}</div><div className="content" style={{ padding: '42px 0 24px' }}><div className="trust-band"><div className="trust-item"><span className="trust-icon"><ShieldCheck size={19} /></span><span><b>{uiText('Verified rental offices')}</b><small>{uiText('Local partners, checked by our team')}</small></span></div><div className="trust-item"><span className="trust-icon"><Wallet size={18} /></span><span><b>{uiText('Clear prices')}</b><small>{uiText('Know what you pay before you book')}</small></span></div><div className="trust-item"><span className="trust-icon"><LifeBuoy size={19} /></span><span><b>{uiText('Here when you need us')}</b><small>{uiText('Real help from real people')}</small></span></div></div></div><div className="section-head"><div><span className="eyebrow">{uiText('LOCAL KNOW-HOW')}</span><h2>{uiText('Good people, good cars')}</h2><p>{uiText('Independent rental offices that know their neighborhoods.')}</p></div><Link to="/offices" className="link-arrow">{uiText("Meet our offices")} <ArrowRight size={14} /></Link></div><PublicOfficeDirectory limit={3}/></main><SiteFooter /></>;
}

function OfficeCard({ office }: { office: (typeof offices)[number] }) { return <Link to={`/offices/${office.id}`} className="office-card"><span className="office-logo" style={{ background: office.accent }}>{office.initials}</span><span><h3>{office.name} {office.verified && <BadgeCheck size={14} style={{ verticalAlign: 'middle', color: '#4e8b61' }} />}</h3><p><MapPin size={11} style={{ verticalAlign: 'middle' }} /> {office.address}</p><span className="office-meta"><span className="rating"><Star size={11} /> {formatNumber(office.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span><span>{formatNumber(office.reviews)} {uiText("reviews")}</span><span>{formatNumber(office.fleet)} {uiText("cars")}</span></span></span></Link>; }

type PublicOfficeRow={id:string;slug:string;name:string;address:string;average_rating:number;review_count:number;cities:{name:string|null;name_ar?:string|null}|{name:string|null;name_ar?:string|null}[]|null;vehicles:Array<{id:string}>};
function LiveOfficeCard({office}:{office:PublicOfficeRow}){const cityRow=Array.isArray(office.cities)?office.cities[0]:office.cities;const city=currentLanguage()==='ar'?(cityRow?.name_ar||cityRow?.name):cityRow?.name;return <Link to={`/offices/${office.slug}`} className="office-card"><span className="office-logo" style={{background:'#dcebdc'}}><BadgeCheck size={18}/></span><span><h3>{office.name}</h3><p><MapPin size={11} style={{verticalAlign:'middle'}}/> {office.address}{city?`, ${city}`:''}</p><span className="office-meta"><span className="rating"><Star size={11}/> {formatNumber(Number(office.average_rating), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span><span>{formatNumber(office.review_count)} {uiText("reviews")}</span><span>{formatNumber(office.vehicles?.length??0)} {uiText("cars")}</span></span></span></Link>;}
function PublicOfficeDirectory({limit=500,columns}:{limit?:number;columns?:number}){const [rows,setRows]=useState<PublicOfficeRow[]>([]);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;void supabase.from('rental_offices').select('id,slug,name,address,average_rating,review_count,cities(name,name_ar),vehicles(id)').eq('status','approved').order('name').limit(limit).then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setRows((result.data??[]) as unknown as PublicOfficeRow[]);setLoading(false);});return()=>{alive=false;};},[limit]);return <>{loading&&<div className="empty-note">{uiText('Loading rental offices…')}</div>}{error&&<div className="empty-note" role="alert">{error}</div>}<div className="office-strip" style={columns?{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}:undefined}>{!supabase?offices.slice(0,limit).map(office=><OfficeCard key={office.id} office={office}/>):rows.map(office=><LiveOfficeCard key={office.id} office={office}/>)}</div>{supabase&&!loading&&!error&&!rows.length&&<div className="empty-note">{uiText('No verified rental offices are listed yet.')}</div>}</>;}
type PublicCityRow={id:string;slug:string;name:string;name_ar:string;governorate:string|null};
function PublicCityDirectory({language}:{language:Lang}){const [rows,setRows]=useState<PublicCityRow[]>([]);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;void supabase.from('cities').select('id,slug,name,name_ar,governorate').eq('is_active',true).order('name').limit(300).then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setRows((result.data??[]) as PublicCityRow[]);setLoading(false);});return()=>{alive=false;};},[]);const cityRows=supabase?rows:cities;return <>{loading&&<div className="empty-note">{uiText('Loading cities…')}</div>}{error&&<div className="empty-note" role="alert">{error}</div>}<div className="office-strip">{cityRows.map(city=><Link key={city.id} to={`/cars?city=${encodeURIComponent(city.name)}`} className="office-card"><span className="office-logo" style={{background:'#e4eee3'}}><MapPin size={18}/></span><span><h3>{language==='ar'&&'name_ar' in city?city.name_ar:city.name}</h3><p>{'governorate' in city ? uiText('Syrian governorate') : uiText(city.region)}</p><span className="office-meta">{uiText("Browse cars")} <ArrowRight size={12}/></span></span></Link>)}</div>{supabase&&!loading&&!error&&!rows.length&&<div className="empty-note">{uiText('No active cities are listed yet.')}</div>}</>;}
type PublicPromotion={id:string;title:string;description:string|null;starts_at:string;ends_at:string;rental_offices:{name:string;slug:string}|null};
function PublicOffers({lang}:{lang:Lang}){const [rows,setRows]=useState<PublicPromotion[]>([]);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;const now=new Date().toISOString();void supabase.from('promotions').select('id,title,description,starts_at,ends_at,rental_offices(name,slug)').eq('is_active',true).lte('starts_at',now).gt('ends_at',now).order('ends_at').limit(200).then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setRows((result.data??[]) as unknown as PublicPromotion[]);setLoading(false);});return()=>{alive=false;};},[]);if(!supabase)return <div className="empty-note">{uiText('Connect Supabase to see current rental office offers.')}</div>;return <><CmsHomeHighlights language={lang}/>{loading&&<div className="empty-note">{uiText('Loading current offers…')}</div>}{error&&<div className="empty-note" role="alert">{error}</div>}{!loading&&!error&&!rows.length&&<div className="empty-note">{uiText('There are no current offers right now.')}</div>}<div className="office-strip">{rows.map(row=><article className="office-card" key={row.id}><span><small>{row.rental_offices?.name??'Motara offer'} {uiText("· Ends")} {formatDate(row.ends_at, { dateStyle: 'medium' })}</small><h3>{row.title}</h3><p>{row.description??'Ask the rental office for details.'}</p>{row.rental_offices?.slug&&<Link className="link-arrow" to={`/offices/${row.rental_offices.slug}`}>{uiText("View office")} <ArrowRight size={13}/></Link>}</span></article>)}</div><Link className="btn" to="/cars">{uiText("Find a car")} <ArrowRight size={15}/></Link></>;}

function CarsPage({ favorites, onFavorite, currency }: { favorites: string[]; onFavorite: (id: string) => void; currency: Currency }) {
  const [params, setParams] = useSearchParams(); const { fleet, setFleet } = useFleet(); const [category, setCategory] = useState('Any type'); const [gearbox, setGearbox] = useState('Any'); const [maxPrice, setMaxPrice] = useState('200'); const [minSeats,setMinSeats]=useState(1);const [sortBy,setSortBy]=useState('recommended');const [cityOptions,setCityOptions]=useState<CityOption[]>(()=>isDemoMode?cities.map(city=>({name:city.name,name_ar:city.ar})):[]);const [categoryOptions,setCategoryOptions]=useState(()=>isDemoMode?['Economy','Comfort','SUV','Premium','Van']:[]); const city = params.get('city') ?? 'All cities';
  useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('cities').select('name,name_ar').eq('is_active',true).order('name').limit(300).then(result=>{if(!alive)return;if(!result.error)setCityOptions((result.data??[]) as CityOption[]);});return()=>{alive=false;};},[]);
  useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('vehicle_categories').select('name').order('sort_order').limit(100).then(result=>{if(!alive)return;if(!result.error)setCategoryOptions((result.data??[]).map(row=>row.name));});return()=>{alive=false;};},[]);
  useEffect(() => { if (!isBackendConfigured) return; const search = params.toString(); api<{ cars: RemoteCar[] }>(`/cars${search ? `?${search}` : ''}`).then(data => setFleet(data.cars.map(mapRemoteCar))).catch(() => {}); }, [params, setFleet]);
  const result = useMemo(() => {const filtered=fleet.filter(v => (city === 'All cities' || v.city === city) && (category === 'Any type' || v.category === category) && (gearbox === 'Any' || v.transmission === gearbox) && v.price <= Number(maxPrice) && v.seats>=minSeats);return filtered.sort((a,b)=>sortBy==='price'?a.price-b.price:sortBy==='rating'?b.rating-a.rating:((b.popular?1:0)-(a.popular?1:0))||a.price-b.price);}, [fleet, city, category, gearbox, maxPrice,minSeats,sortBy]);
  const clearFilters=()=>{setCategory('Any type');setGearbox('Any');setMaxPrice('200');setMinSeats(1);setSortBy('recommended');params.delete('city');setParams(params);};
  return <><div className="page-heading"><span className="eyebrow">{uiText('THE RIGHT CAR IS CLOSER THAN YOU THINK')}</span><h1>{uiText('Find your next drive')}</h1><p>{uiText('Compare trusted local cars and book in just a few easy steps.')}</p></div><div className="catalog-layout"><aside className="filter-panel"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3><SlidersHorizontal size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} /> {uiText('Filters')}</h3><button className="quiet-button" onClick={clearFilters}>{uiText('Reset')}</button></div><div className="filter-group"><label>{uiText('Pick-up city')}</label><select className="input" value={city} onChange={e => { if (e.target.value === 'All cities') params.delete('city'); else params.set('city', e.target.value); setParams(params); }}><option>{uiText('All cities')}</option>{cityOptions.map(item => <option key={item.name} value={item.name}>{currentLanguage()==='ar'?(item.name_ar||item.name):item.name}</option>)}</select></div><div className="filter-group"><label>{uiText('Vehicle category')}</label><select className="input" value={category} onChange={e => setCategory(e.target.value)}>{['Any type', ...categoryOptions].map(x => <option key={x}>{x}</option>)}</select></div><div className="filter-group"><label>{uiText("Price up to · $")}{maxPrice} {uiText("/ day")}</label><input type="range" min="25" max="200" step="5" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} /></div><div className="filter-group"><label>{uiText('Transmission')}</label><div className="checks">{['Any', 'Automatic', 'Manual'].map(x => <label key={x}><input type="radio" name="gearbox" checked={gearbox === x} onChange={() => setGearbox(x)} /> {x}</label>)}</div></div><div className="filter-group"><label>{uiText('Seats')}</label><div className="checks"><label><input type="checkbox" checked={minSeats===7} onChange={event=>setMinSeats(event.target.checked?7:1)} /> {uiText('7+ seats')}</label></div></div></aside><section><div className="catalog-toolbar"><span><strong>{formatNumber(result.length)} {uiText("cars")}</strong> {uiText("available")} {city !== 'All cities' && `in ${city}`}</span><select aria-label={uiText('Sort cars')} value={sortBy} onChange={event=>setSortBy(event.target.value)}><option value="recommended">{uiText('Recommended')}</option><option value="price">{uiText('Price: low to high')}</option><option value="rating">{uiText('Top rated')}</option></select></div>{result.length ? <div className="car-grid">{result.map(v => <VehicleCard key={v.id} vehicle={v} favorite={favorites.includes(v.id)} onFavorite={onFavorite} currency={currency} />)}</div> : <div className="empty-state"><CarFront size={28} /><h3>{uiText('No cars match these filters')}</h3><p>{uiText('Try another city or raise your daily price range.')}</p><button className="btn btn-sm" onClick={clearFilters}>{uiText('Clear filters')}</button></div>}</section></div><SiteFooter /></>;
}

function VehicleDetails({ favorites, onFavorite, onBook, notify, currency = 'USD', lang }: { favorites: string[]; onFavorite: (id: string) => void; onBook: (vehicle: Vehicle, fields: { start: string; end: string; name: string; delivery: boolean; insurance: boolean; extraDriver: boolean }) => void; notify: (s: string) => void; currency?: Currency; lang: Lang }) {
  const { vehicleId = '' } = useParams(); const { fleet, setFleet } = useFleet(); const [remoteLoading,setRemoteLoading]=useState(Boolean(supabase)); const [remoteError,setRemoteError]=useState('');
  const [start, setStart] = useState(todayPlus(2)); const [end, setEnd] = useState(todayPlus(5)); const [name, setName] = useState(''); const [delivery, setDelivery] = useState(false); const [insurance, setInsurance] = useState(false); const [extraDriver, setExtraDriver] = useState(false); const [tab, setTab] = useState('Overview');
  useEffect(()=>{if(!isBackendConfigured)return;let alive=true;setRemoteLoading(true);void api<{cars:RemoteCar[]}>('/cars').then(data=>{if(!alive)return;setFleet(data.cars.map(mapRemoteCar));setRemoteLoading(false);}).catch(error=>{if(!alive)return;setRemoteError(error instanceof Error?error.message:'Vehicle details could not be loaded.');setRemoteLoading(false);});return()=>{alive=false;};},[vehicleId,setFleet]);
  const vehicle = fleet.find(v => v.id === vehicleId) ?? (isDemoMode ? fleet[0] ?? seededVehicles[0] : null);
  if(!vehicle)return <><main className="content">{remoteLoading?<div className="empty-note">{uiText('Loading vehicle details…')}</div>:<div className="empty-note" role={remoteError?'alert':undefined}>{remoteError||'This vehicle is not available.'}</div>}</main><SiteFooter/></>;
  const office = getOffice(vehicle.officeId); const officeName=vehicle.officeName??(isDemoMode?office.name:'Rental office');
  const quote = calculateQuote(vehicle, { start, end, delivery, insurance, extraDriver });
  const submit = (e: FormEvent) => { e.preventDefault(); if (!name.trim()) { notify('Enter your full name to send a booking request.'); return; } onBook(vehicle, { start, end, name, delivery, insurance, extraDriver }); };
  return <><div className="page-heading" style={{ paddingBottom: 4 }}><Link to="/cars" className="link-arrow"><ArrowLeft size={13} /> {uiText('Back to cars')}</Link></div><div className="detail-layout"><section><div className="detail-hero"><VehicleArt vehicle={vehicle} large /></div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}><div><span className="eyebrow"><MapPin size={12} /> {vehicle.city}{uiText(", Syria")}</span><h1 style={{ font: '800 29px var(--display)', letterSpacing: '-1px', margin: '8px 0' }}>{vehicle.name} <span style={{ color: '#89958d', fontSize: 17 }}>{vehicle.year}</span></h1></div><button className={`icon-button ${favorites.includes(vehicle.id) ? 'active' : ''}`} onClick={() => onFavorite(vehicle.id)}><Heart size={17} fill={favorites.includes(vehicle.id) ? 'currentColor' : 'none'} /> {uiText('Save')}</button></div><div className="detail-tags"><span className="tag"><Users size={14} /> {vehicle.seats} {uiText("seats")}</span><span className="tag"><Zap size={14} /> {vehicle.transmission}</span><span className="tag"><Fuel size={14} /> {vehicle.fuel}</span><span className="tag"><Gauge size={14} /> {vehicle.mileage}</span></div><div className="tabs">{['Overview', 'Features', 'Rental terms', 'Reviews'].map(x => <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>{x}</button>)}</div><p style={{ color: '#6e7b73', fontSize: 12, lineHeight: 1.8 }}>{tab === 'Overview' ? `Enjoy a smooth, comfortable ride in this ${vehicle.year} ${vehicle.name}. Prepared and maintained by ${officeName}, with flexible pickup options in ${vehicle.city}.` : tab === 'Features' ? 'Air conditioning · Bluetooth · USB charging · Phone holder · Unlimited roadside assistance.' : tab === 'Rental terms' ? 'Valid driving license required. Minimum driver age 21. Security deposit is shown separately and is refundable after return inspection.' : `${vehicle.reviews} verified renter reviews · ${vehicle.rating} average rating. Reviews are collected after completed reservations.`}</p><div style={{ marginTop: 28 }}>{isBackendConfigured?<Link className="office-card" to={`/offices/${vehicle.officeId}`}><span className="office-logo" style={{background:"#dcebdc"}}><BadgeCheck size={18}/></span><span><h3>{officeName}</h3><p><MapPin size={11}/> {vehicle.city}</p></span></Link>:<OfficeCard office={office}/>}</div></section><aside className="detail-panel"><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#698171' }}><BadgeCheck size={15} color="#4b8b59" /> {uiText('Verified local rental office')}</div><h1>{vehicle.name}</h1><div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#79867e' }}><Star size={13} fill="#e3bc5d" color="#c3922b" /> {vehicle.rating} · {vehicle.reviews} {uiText("reviews ·")} {officeName}</div><div className="price">{formatPrice(vehicle, currency)}<small> / {uiText('day')}</small></div><form className="booking-form" onSubmit={submit}><label>{uiText("Pick-up date")}<LocalizedDateInput value={start} onChange={setStart} lang={lang} min={todayPlus(0)} required ariaLabel={tr('pickupDate', lang)} /></label><label>{uiText("Return date")}<LocalizedDateInput value={end} onChange={setEnd} lang={lang} min={start} required ariaLabel={tr('returnDate', lang)} /></label><label>{uiText("Your full name")}<input value={name} onChange={e => setName(e.target.value)} placeholder={uiText('As shown on your license')} required /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, margin: '3px 0' }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" checked={delivery} onChange={e => setDelivery(e.target.checked)} /> {uiText('Delivery +$18')}</label><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" checked={insurance} onChange={e => setInsurance(e.target.checked)} /> {uiText('Protection +$8/day')}</label><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" checked={extraDriver} onChange={e => setExtraDriver(e.target.checked)} /> {uiText('Extra driver')}</label></div><div style={{ borderTop: '1px solid #edf0ec', paddingTop: 8 }}><div className="quote-row"><span>{quote.days} {uiText("days ×")} {money(vehicle.price)}</span><span>{money(quote.rental)}</span></div>{quote.delivery > 0 && <div className="quote-row"><span>{uiText('Delivery')}</span><span>{money(quote.delivery)}</span></div>}{quote.insurance > 0 && <div className="quote-row"><span>{uiText('Protection')}</span><span>{money(quote.insurance)}</span></div>}{quote.extraDriver > 0 && <div className="quote-row"><span>{uiText('Extra driver')}</span><span>{money(quote.extraDriver)}</span></div>}<div className="quote-row"><span>{uiText('Service fee')}</span><span>{money(quote.serviceFee)}</span></div><div className="quote-row quote-total"><span>{uiText('Estimated total')}</span><span>{money(quote.total)}</span></div><div className="quote-row"><span>{uiText('Refundable deposit')}</span><span>{money(vehicle.deposit)}</span></div></div><button className="btn btn-block" type="submit">{uiText("Request to book")} <ArrowRight size={15} /></button><small style={{ textAlign: 'center', color: '#89958d', fontSize: 9 }}>{uiText('No charge now · Office confirms your request')}</small></form></aside></div><SiteFooter /></>;
}

function OfficesPage() { return <><div className="page-heading"><span className="eyebrow">{uiText('LOCAL PARTNERS')}</span><h1>{uiText('Rental offices you can trust')}</h1><p>{uiText('Independent teams across Syria, verified and ready to help.')}</p></div><main className="content"><PublicOfficeDirectory columns={2}/></main><SiteFooter /></>; }
function OfficeDetailsPage({ currency }: { currency: Currency }) { const { officeId = '' } = useParams(); const { fleet } = useFleet(); const [office,setOffice]=useState<PublicOfficeRow|null>(null);const [loading,setLoading]=useState(Boolean(supabase));const [error,setError]=useState('');useEffect(()=>{if(!supabase){setLoading(false);return;}let alive=true;void supabase.from('rental_offices').select('id,slug,name,address,average_rating,review_count,cities(name,name_ar),vehicles(id)').eq('slug',officeId).eq('status','approved').maybeSingle().then(result=>{if(!alive)return;if(result.error)setError(result.error.message);setOffice(result.data as unknown as PublicOfficeRow|null);setLoading(false);});return()=>{alive=false;};},[officeId]);const demoOffice=isDemoMode?offices.find(o=>o.id===officeId):undefined;const inventory=fleet.filter(vehicle=>vehicle.officeId===officeId);if(supabase&&(loading||error||!office))return <><main className="content">{loading?<div className="empty-note">{uiText('Loading office profile…')}</div>:error?<div className="empty-note" role="alert">{error}</div>:<div className="empty-note">{uiText('This rental office is not available.')}</div>}</main><SiteFooter/></>;const name=office?.name??demoOffice?.name??'Rental office';const address=office?.address??demoOffice?.address??'';const rating=office?Number(office.average_rating):demoOffice?.rating??0;const reviews=office?.review_count??demoOffice?.reviews??0;const fleetCount=office?.vehicles?.length??demoOffice?.fleet??inventory.length;return <><div className="page-heading"><Link to="/offices" className="link-arrow"><ArrowLeft size={13} /> {uiText('All rental offices')}</Link><h1 style={{ marginTop: 18 }}>{name}</h1><p><MapPin size={13} style={{ verticalAlign: 'middle' }} /> {address}</p></div><main className="content"><div className="trust-band"><div className="trust-item"><span className="trust-icon"><BadgeCheck size={18} /></span><span><b>{uiText('Verified by Motara')}</b><small>{uiText('Identity and rental documents checked')}</small></span></div><div className="trust-item"><span className="trust-icon"><Star size={18} /></span><span><b>{rating} {uiText("average rating")}</b><small>{uiText("From")} {reviews} {uiText("renter reviews")}</small></span></div><div className="trust-item"><span className="trust-icon"><CarFront size={18} /></span><span><b>{fleetCount} {uiText("vehicles")}</b><small>{uiText('Browse their available fleet')}</small></span></div></div><div className="section-head"><div><h2>{uiText("Cars from")} {name}</h2><p>{uiText('Choose a ride, request your dates, and let the office confirm.')}</p></div></div><div className="car-grid">{inventory.map(v => <VehicleCard key={v.id} vehicle={v} favorite={false} onFavorite={() => {}} currency={currency} />)}</div>{!inventory.length&&<div className="empty-note">{uiText('No vehicles are available from this office right now.')}</div>}</main><SiteFooter /></>; }

function ContentPage({ page, lang }: { page: string; lang: Lang }) {
  const pages: Record<string, [string, string]> = { cities: ['Explore Syria, one city at a time', 'Choose a city and find a local car for your next journey.'], offers: ['A little more road for less', 'Seasonal deals and first-booking savings from our local rental partners.'], about: ['A better way to get there', 'Motara connects people with trusted independent rental offices, so getting on the road feels easy and clear.'], contact: ['We are here to help', 'Talk to our team about a booking, an office partnership, or anything in between.'], faq: ['Frequently asked questions', 'Helpful answers for a smooth start to your journey.'], terms: ['Terms and conditions', 'Clear booking, payment, cancellation, and rental expectations.'], privacy: ['Privacy policy', 'How Motara handles account, booking, and support information.'] };
  const [title, desc] = pages[page] ?? pages.about;
  if (['about','contact','terms','privacy'].includes(page)) return <><main className="content"><CmsPublicPage slug={page} language={lang}/></main><SiteFooter/></>;
  return <><div className="page-heading"><span className="eyebrow">{uiText('MOTARA · DRIVE YOUR WAY')}</span><h1>{uiText(title)}</h1><p>{desc}</p></div><main className="content">{page === 'cities' ? <PublicCityDirectory language={lang}/> : page === 'offers' ? <PublicOffers lang={lang}/> : <CmsPublicFaqs language={lang}/>}</main><SiteFooter /></>;
}

const signSchema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().optional(), fullName: z.string().optional() });
type SignValues = z.infer<typeof signSchema>;
function AccountPage({ bookings, notify, favorites, onFavorite, onOfficeActivated, currency }: { bookings: Booking[]; notify: (s: string) => void; favorites: string[]; onFavorite: (id: string) => void; onOfficeActivated: (slug: string) => void; currency: Currency }) {
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
    <div className="page-heading"><span className="eyebrow">{uiText('YOUR MOTARA ACCOUNT')}</span><h1>{inviteToken||platformInviteToken?'Activate your staff invitation':'Welcome back'}</h1><p>{inviteToken||platformInviteToken?'Sign in or create an account with the invited email address to activate staff access.':'Manage your trips, profile, payments, and saved cars.'}</p></div>
    <main className="content" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, paddingTop: 20 }}>
      <aside className="filter-panel"><div className="avatar" style={{ width: 46, height: 46, marginBottom: 10 }}>{uiText('RH')}</div><h3 style={{ marginBottom: 4 }}>{uiText('Renter account')}</h3><p style={{ fontSize: 10, color: '#869189', marginTop: 0 }}>{sessionEmail || 'Sign in to your account'}</p>
        {sessionEmail && <button className="quiet-button" onClick={async () => { await supabase?.auth.signOut(); setSessionEmail(''); }}><LogOut size={13} /> {uiText('Sign out')}</button>}
        {[['bookings', 'My bookings'], ['profile', 'Profile'], ['favorites', 'Saved cars'], ['payments', 'Payments'], ['support', 'Support']].map(([id, labelText]) =>
          <button key={id} className={'side-link ' + (tab === id ? 'active' : '')} style={{ color: '#3d5044', background: tab === id ? '#edf2ec' : 'transparent', width: '100%', border: 0, textAlign: 'left' }} onClick={() => setTab(id as typeof tab)}>{labelText}</button>)}
      </aside>
      <section>
        {tab === 'bookings' && <><div className="panel-head"><div><h3>{uiText('Your bookings')}</h3><p>{uiText('Track requests, rental dates, and balances.')}</p></div><Link className="btn btn-sm" to="/cars">{uiText('Find a car')}</Link></div>
          <div className="panel-card table-wrap"><table className="data-table"><thead><tr><th>{uiText('Booking')}</th><th>{uiText('Car')}</th><th>{uiText('Dates')}</th><th>{uiText('Office')}</th><th>{uiText('Status')}</th><th>{uiText('Total')}</th><th>{uiText('Payments')}</th></tr></thead><tbody>
            {bookings.map(booking => <tr key={booking.id}><td><strong>{booking.number ?? booking.id}</strong></td><td>{fleet.find(vehicle => vehicle.id === booking.vehicleId)?.name ?? (isDemoMode ? getVehicle(booking.vehicleId).name : 'Vehicle details unavailable')}</td><td>{booking.start} – {booking.end}</td><td>{isDemoMode ? offices.find(office => office.id === booking.officeId)?.name ?? booking.officeId : booking.officeId}</td><td><span className={'status-pill ' + booking.status}>{booking.status}</span></td><td>{money(booking.total)}</td><td><button className="quiet-button" onClick={() => setTab('payments')}>{uiText('Payment details')}</button></td></tr>)}
          </tbody></table>{!bookings.length && <div className="empty-note">{uiText('No bookings yet. Your first trip is waiting.')}</div>}</div>
        </>}
        {tab === 'profile' && <div className="panel-card"><div className="panel-head"><div><h3>{uiText('Profile information')}</h3><p>{uiText('Keep your contact details up to date.')}</p></div></div><div className="form-grid"><div className="field"><label>{uiText('Full name')}</label><input value={profile.fullName} onChange={event => setProfile(current => ({ ...current, fullName: event.target.value }))} /></div><div className="field"><label>{uiText('Email address')}</label><input value={sessionEmail} readOnly /></div><div className="field"><label>{uiText('Phone')}</label><input value={profile.phone} onChange={event => setProfile(current => ({ ...current, phone: event.target.value }))} placeholder="+963 …" /></div><div className="field"><label>{uiText('Preferred language')}</label><select value={profile.language} onChange={event => setProfile(current => ({ ...current, language: event.target.value }))}><option value="en">{uiText('English')}</option><option value="ar">العربية</option></select></div><button className="btn btn-sm" onClick={() => void saveProfile()}>{uiText('Save changes')}</button></div></div>}
        {tab === 'favorites' && <div>{savedVehicles.length ? <div className="car-grid">{savedVehicles.map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} favorite onFavorite={onFavorite} currency={currency} />)}</div> : <div className="empty-state"><Heart size={26} /><h3>{uiText('Saved cars stay here')}</h3><p>{uiText('Tap the heart on any car to keep it close.')}</p><Link className="btn btn-sm" to="/cars">{uiText('Browse cars')}</Link></div>}</div>}
        {tab === 'payments' && <CustomerPaymentCenter bookings={bookings} sessionEmail={sessionEmail} notify={notify} />}
        {tab === 'support' && <SupportManagement mode="customer" bookings={bookings} notify={notify} />}
      </section>
    </main>
    {!sessionEmail && <section className="content" style={{ paddingTop: 8 }}><div className="panel-card" style={{ maxWidth: 480, margin: 'auto' }}><div className="panel-head"><div><h3>{mode === 'login' ? 'Sign in to Motara' : mode === 'register' ? 'Create your account' : 'Reset your password'}</h3><p>{uiText('Access your bookings and secure payment history.')}</p></div></div>
      <form className="booking-form" onSubmit={submit}>{mode === 'register' && <label>{uiText("Full name")}<input {...register('fullName')} placeholder={uiText('Your full name')} /></label>}
        <label>{uiText("Email")}<input {...register('email')} type="email" placeholder={uiText('you@example.com')} />{errors.email && <small style={{ color: '#bb544a' }}>{errors.email.message}</small>}</label>
        {mode !== 'forgot' && <label>{uiText("Password")}<input {...register('password')} type="password" placeholder={uiText('At least 8 characters')} />{errors.password && <small style={{ color: '#bb544a' }}>{errors.password.message}</small>}</label>}
        <button className="btn btn-block">{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button>
        <button type="button" className="quiet-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New to Motara? Create an account' : 'Already have an account? Sign in'}</button>
        {mode === 'login' && <button type="button" className="quiet-button" onClick={() => setMode('forgot')}>{uiText('Forgot password?')}</button>}
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
      // Supabase PostgrestError is a plain object in some client versions,
      // so `instanceof Error` can hide the real database/RLS failure.
      const detail = error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : error instanceof Error ? error.message : String(error ?? '');
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '') : '';
      const hint = error && typeof error === 'object' && 'hint' in error
        ? String((error as { hint?: unknown }).hint ?? '') : '';
      console.error('Motara office registration failed', { code, detail, hint, error });
      notify(detail ? `Office registration failed${code ? ` (${code})` : ''}: ${detail}${hint ? ` — ${hint}` : ''}` : 'Could not submit the office application. Check the browser console for details.');
    } finally { setLoading(false); }
  };
  return <><div className="page-heading"><span className="eyebrow">{uiText('PARTNER WITH MOTARA')}</span><h1>{uiText('Register your rental office')}</h1><p>{uiText('Create an office account to list your vehicles and manage bookings. Your application will be reviewed before the office appears publicly.')}</p></div><main className="content" style={{ paddingTop: 22, maxWidth: 760 }}><div className="panel-card"><div className="panel-head"><div><h3>{uiText('Office application')}</h3><p>{uiText('Enter your rental business details.')}</p></div></div>{!signedIn ? <div className="empty-state"><h3>{uiText('Sign in required')}</h3><p>{uiText('Create a Motara customer account or sign in first. You can then submit your office application.')}</p><Link className="btn" to="/account?mode=register">{uiText('Create account / Sign in')}</Link></div> : <form className="booking-form" onSubmit={submit}><div className="form-grid"><label>{uiText("Office name *")}<input required maxLength={120} value={form.name} onChange={event => update('name', event.target.value)} placeholder={uiText('e.g. Damascus Car Rental')} /></label><label>{uiText("City *")}<input required maxLength={100} value={form.city} onChange={event => update('city', event.target.value)} placeholder={uiText('e.g. Damascus')} /></label><label>{uiText("Business address *")}<input required maxLength={240} value={form.address} onChange={event => update('address', event.target.value)} placeholder={uiText('Street, district, city')} /></label><label>{uiText("Business phone")}<input maxLength={40} value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="+963..." /></label><label>{uiText("Business email")}<input type="email" maxLength={254} value={form.email} onChange={event => update('email', event.target.value)} placeholder={uiText('office@example.com')} /></label><label className="full">{uiText("Description")}<textarea rows={4} maxLength={1200} value={form.description} onChange={event => update('description', event.target.value)} placeholder={uiText('Tell customers about your rental office and services.')} /></label></div><p className="empty-note">{uiText('Your application will be marked Pending until a Motara administrator reviews it. You can access the office workspace after submitting.')}</p><button className="btn btn-block" disabled={loading}>{loading ? 'Submitting…' : 'Submit office registration'}</button></form>}</div></main><SiteFooter /></>;
}

function SiteLayout({ children, lang, setLang, currency, setCurrency }: { children: ReactNode; lang: Lang; setLang: (v: Lang) => void; currency: Currency; setCurrency: (v: Currency) => void }) { return <div className="app-shell"><MarketplaceHeader lang={lang} setLang={setLang} currency={currency} setCurrency={setCurrency} />{children}</div>; }

const officeNav: Array<[string, string, LucideIcon]> = [['overview', 'Overview', LayoutDashboard], ['fleet', 'Fleet management', CarFront], ['bookings', 'Bookings', CalendarDays], ['calendar', 'Rental calendar', CalendarDays], ['finance', 'Finance', Wallet], ['subscription', 'Subscription', CreditCard], ['customers', 'Customers', Users], ['staff', 'Office staff', Users], ['support', 'Support', LifeBuoy], ['reviews', 'Reviews', Star], ['promotions', 'Promotions', Zap], ['ads', 'Advertise on Motara', Megaphone], ['profile', 'Office profile', BadgeCheck], ['settings', 'Settings', Settings]];
const platformSectionPermissions: Record<string, string> = { ads: 'promotions.manage', overview: 'platform.read', offices: 'offices.manage', customers: 'customers.manage', subscriptions: 'subscriptions.manage', content: 'cms.manage', support: 'support.manage', staff: 'platform.manage', reviews: 'reviews.manage', promotions: 'promotions.manage', notifications: 'notifications.manage', sales: 'cars.manage', 'rental-listings': 'fleet.review', settings: 'settings.manage', finance: 'finance.read', calendar: 'platform.read', bookings: 'bookings.manage' };
const officeSectionPermissions: Record<string, string> = { ads: 'promotions.manage', fleet: 'fleet.manage', bookings: 'bookings.manage', calendar: 'bookings.manage', finance: 'finance.read', customers: 'customers.read', staff: 'staff.manage', support: 'support.manage', reviews: 'reviews.manage', promotions: 'promotions.manage', profile: 'office.manage', settings: 'office.manage' };
const adminNav: Array<[string, string, LucideIcon]> = [['overview', 'Overview', LayoutDashboard], ['offices', 'Rental offices', BadgeCheck], ['customers', 'Customers', Users], ['bookings', 'All bookings', CalendarDays], ['finance', 'Finance', Wallet], ['subscriptions', 'Subscriptions', CreditCard], ['content', 'Content manager', FileText], ['promotions', 'Promotions', Zap], ['ads', 'Advertisements', Megaphone], ['reviews', 'Review moderation', Star], ['support', 'Support & disputes', LifeBuoy], ['notifications', 'Notifications', Bell], ['sales', 'Car sale listings', CarFront], ['rental-listings', 'Rental listing approvals', CarFront], ['staff', 'Admin & security', ShieldCheck], ['settings', 'Platform settings', Settings]];

function Status({ status }: { status: string }) { return <span className={`status-pill ${status}`}>{uiText(status)}</span>; }
function DashboardStats({ rows }: { rows: Array<[string, string, string, string, LucideIcon]> }) { return <div className="stats-grid">{rows.map(([label, value, delta, direction, Icon]) => <div className="stat-card" key={label}><div className="stat-label">{uiText(label)}<Icon size={15} /></div><div className="stat-value">{uiText(value)}</div><div className={`stat-delta ${direction === 'down' ? 'down' : ''}`}>{direction === 'down' ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />} {uiText(delta === 'live Supabase records' ? delta : `${delta} vs last month`)}</div></div>)}</div>; }
function RevenueChart({ admin = false }: { admin?: boolean }) { return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthRevenue} margin={{ top: 15, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id={admin ? 'adminRevenue' : 'officeRevenue'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={admin ? '#65afc9' : '#83ad73'} stopOpacity={0.25} /><stop offset="95%" stopColor={admin ? '#65afc9' : '#83ad73'} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#edf0ec" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 9, fill: '#8b968f' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#8b968f' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10, borderRadius: 10, border: '1px solid #e4e9e2' }} formatter={(value: number) => [money(value), 'Revenue']} /><Area type="monotone" dataKey="revenue" stroke={admin ? '#3886a4' : '#5d9160'} strokeWidth={2.3} fill={`url(#${admin ? 'adminRevenue' : 'officeRevenue'})`} /></AreaChart></ResponsiveContainer></div>; }
function RecentActivity({ admin = false }: { admin?: boolean }) { const items = admin ? [['New office application', 'Nour Car Rentals · Damascus', '8 min'], ['Booking dispute opened', 'RN-2046 · payment question', '42 min'], ['Payout processed', 'Levant Mobility · $2,840', '2 hr'], ['Review reported', 'Cedar Drive Co. · 1 report', '3 hr']] : [['New booking request', 'Yazan Mahmoud · BMW 3 Series', '8 min'], ['Pickup completed', 'Lina Saleh · Toyota Corolla', '1 hr'], ['New 5-star review', '“Great service, easy pickup”', '3 hr'], ['Vehicle added', 'Hyundai Tucson · 2022', 'yesterday']]; return <div className="activity-list">{items.map(([title, subtitle, time], index) => <div className="activity-item" key={title}><span className="activity-icon">{index === 0 ? <CalendarDays size={14} /> : index === 1 ? <Check size={14} /> : index === 2 ? <Star size={14} /> : <Activity size={14} />}</span><span><b>{uiText(title)}</b><small>{subtitle}</small></span><span className="activity-time">{time}</span></div>)}</div>; }

function BookingTable({ bookings, onChange, admin = false }: { bookings: Booking[]; onChange: (id: string, status: BookingStatus, details?: BookingUpdateDetails) => void; admin?: boolean }) {
  const { fleet } = useFleet();
  const [filter, setFilter] = useState('All bookings'); const statuses = ['All bookings', 'pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected']; const filtered = filter === 'All bookings' ? bookings : bookings.filter(b => b.status === filter);
  const carName = (id: string) => fleet.find(v => v.id === id)?.name ?? (isDemoMode ? getVehicle(id).name : 'Vehicle details unavailable');
  return <div className="panel-card"><div className="panel-head"><div><h3>{uiText(admin ? 'Latest platform bookings' : 'Booking requests')}</h3><p>{uiText('Review and move each rental through its lifecycle.')}</p></div><div className="toolbar"><select className="input" value={filter} onChange={e => setFilter(e.target.value)}>{statuses.map(s => <option key={s}>{uiText(s)}</option>)}</select><button className="quiet-button" onClick={() => { const csv = ['booking,customer,vehicle,status,total', ...filtered.map(b => `${b.number ?? b.id},${b.customer},${carName(b.vehicleId)},${b.status},${b.total}`)].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'motara-bookings.csv'; a.click(); URL.revokeObjectURL(a.href); }}><Download size={13} /> {uiText('CSV')}</button></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>{uiText('Booking ID')}</th><th>{uiText('Customer')}</th><th>{uiText('Vehicle')}</th><th>{uiText('Rental dates')}</th>{admin && <th>{uiText('Office')}</th>}<th>{uiText('Status')}</th><th>{uiText('Total')}</th><th>{uiText('Action')}</th></tr></thead><tbody>{filtered.map(b => <tr key={b.id}><td><strong>{b.number ?? b.id}</strong></td><td>{b.customer}</td><td>{carName(b.vehicleId)}</td><td>{b.start} – {b.end}</td>{admin && <td>{isDemoMode ? offices.find(o => o.id === b.officeId)?.name ?? b.officeId : b.officeId}</td>}<td><Status status={b.status} /></td><td><strong>{money(b.total)}</strong></td><td><BookingOperations booking={b} onChange={(status, details) => onChange(b.id, status, details)} /></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-note">{uiText('No bookings in this status.')}</div>}</div></div>;
}

function PortalDashboard({ admin, bookings, officeId }: { admin: boolean; bookings: Booking[]; officeId: string }) {
  if (isBackendConfigured) {
    const visibleBookings = admin ? bookings : bookings.filter(booking => booking.officeId === officeId);
    const liveStats: Array<[string, string, string, string, LucideIcon]> = [
      ['Bookings in view', String(visibleBookings.length), 'live Supabase records', 'up', CalendarDays],
      ['Pending requests', String(visibleBookings.filter(booking => booking.status === 'pending').length), 'awaiting a decision', 'up', Clock3],
      ['Active rentals', String(visibleBookings.filter(booking => booking.status === 'active').length), 'currently checked out', 'up', CarFront],
    ];
    return <><DashboardStats rows={liveStats} /><div className="panel-card"><h3>{uiText(admin ? 'Live platform activity' : 'Live office activity')}</h3><p style={{ color: '#758178', fontSize: 12 }}>{uiText("Booking totals reflect the records available to your account. Open")} <Link to={admin ? '/admin/finance' : '/office/finance'}>{uiText('Finance')}</Link> {uiText("for payment records and reports, or")} <Link to={admin ? '/admin/support' : '/office/support'}>{uiText('Support')}</Link> {uiText('for current tickets and disputes.')}</p></div></>;
  }
  const stats: Array<[string, string, string, string, LucideIcon]> = admin ? [['Total customers', '2,480', '+12.8%', 'up', Users], ['Rental offices', '68', '+8.4%', 'up', BadgeCheck], ['Total bookings', '1,924', '+18.2%', 'up', CalendarDays], ['Platform revenue', '$18,420', '+14.1%', 'up', Wallet]] : [['Total revenue', '$6,240', '+12.4%', 'up', Wallet], ['Total bookings', '79', '+18.2%', 'up', CalendarDays], ['Pending requests', String(bookings.filter(b => b.status === 'pending').length + 4), '+2 new', 'up', Clock3], ['Available vehicles', '18', '92% fleet active', 'up', CarFront]];
  return <><DashboardStats rows={stats} /><div className="dash-grid"><section className="panel-card"><div className="panel-head"><div><h3>{uiText(admin ? 'Platform revenue' : 'Revenue overview')}</h3><p>{uiText('Revenue performance over the last 6 months')}</p></div><select className="input"><option>{uiText('Last 6 months')}</option><option>{uiText('This year')}</option></select></div><RevenueChart admin={admin} /></section><section className="panel-card"><div className="panel-head"><div><h3>{uiText(admin ? 'Platform activity' : 'Recent activity')}</h3><p>{uiText('What’s happening across your workspace')}</p></div><MoreHorizontal size={16} color="#849087" /></div><RecentActivity admin={admin} /></section></div><div style={{ marginTop: 15 }}><BookingTable bookings={bookings.slice(0, 5)} onChange={() => {}} admin={admin} /></div></>;
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
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><button className="btn btn-light btn-sm" onClick={() => setPanel(panel ? '' : 'history')}>{uiText('History')}</button>{next && <button className="btn btn-sm" onClick={() => { setMileage(''); setPhotos([]); setDamage(''); setNotes(''); setPanel(next[1]); }}>{next[0]}</button>}{booking.status === 'pending' && <button className="quiet-button" onClick={() => onChange('rejected')}>{uiText('Reject')}</button>}{panel && <div className="modal-backdrop" onClick={() => setPanel('')}><div className="modal" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2>{panel === 'history' ? 'Booking history' : steps.find(step => step[1] === panel)?.[0]}</h2><p>{booking.number ?? booking.id} · {booking.customer}</p></div><button className="modal-close" onClick={() => setPanel('')}><X size={15} /></button></div>{panel === 'history' ? <div className="activity-list">{historyLoading ? <div className="empty-note">{uiText('Loading recorded activity…')}</div> : history.length ? history.map((item, index) => <div className="activity-item" key={item.created_at + index}><span className="activity-icon"><Activity size={14} /></span><span><b>{item.old_status ? item.old_status + ' → ' + item.new_status : 'Request ' + item.new_status}</b><small>{item.note ?? 'Booking status recorded'}</small></span><span className="activity-time">{formatDateTime(item.created_at)}</span></div>) : <div className="empty-note">{uiText("Current status:")} {booking.status}{uiText(". Status changes appear here after the database records them.")}</div>}</div> : <><p style={{ fontSize: 12, color: '#718078' }}>{steps.find(step => step[1] === panel)?.[2]}</p>{(panel === 'active' || panel === 'completed') && <div className="form-grid"><div className="field"><label>{uiText('Odometer (km)')}</label><input type="number" min="0" value={mileage} onChange={event => setMileage(event.target.value)} placeholder={uiText('e.g. 42,180')} required /></div><div className="field"><label>{uiText('Fuel level')}</label><select value={fuel} onChange={event => setFuel(event.target.value)}><option>{uiText('Full')}</option><option>{uiText('Three-quarters')}</option><option>{uiText('Half')}</option><option>{uiText('Quarter')}</option><option>{uiText('Empty')}</option></select></div>{panel === 'completed' && <><div className="field"><label>{uiText('Late minutes')}</label><input type="number" min="0" value={lateMinutes} onChange={event => setLateMinutes(event.target.value)} /></div><div className="field"><label>{uiText('Damage / additional charge notes')}</label><input value={damage} onChange={event => setDamage(event.target.value)} placeholder={uiText('Describe damage or additional charge')} /></div></>}<div className="field full"><label>{uiText('Inspection notes')}</label><textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder={uiText('Condition, handover notes, or other details')} /></div><div className="field full"><label>{uiText('Inspection photos')}</label><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setPhotos(Array.from(event.target.files ?? []))} /><small>{uiText('JPEG, PNG, or WebP · up to 12 MB each.')}</small></div></div>}<button className="btn btn-block" style={{ marginTop: 17 }} onClick={submit}>{panel === 'active' ? 'Confirm pickup' : panel === 'completed' ? 'Complete return' : panel === 'confirmed' ? 'Approve booking' : 'Save update'}</button></>}</div></div>}</div>;
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
  if (section === 'ads') return <AdsManagement admin={admin} officeId={officeId} notify={notify} />;
  if (admin && section === 'sales') return <SalesMarketplace mode="admin" notify={notify} />;
  if (admin && section === 'rental-listings') return <RentalListingModeration notify={notify} />;
  if (section === 'notifications') return <NotificationsManagement notify={notify} />;
  if (section === 'settings' && admin) return <PlatformSettingsManagement notify={notify} />;
  if (section === 'settings' || section === 'profile') return <OfficeProfileManagement officeId={officeId} notify={notify} />;
  const title = (admin ? adminNav : officeNav).find(x => x[0] === section)?.[1] ?? 'Workspace section';
  return <div className="panel-card"><h3>{uiText(title)}</h3><div className="empty-note">{uiText('This section is not available. Choose a module from the navigation.')}</div></div>;
}


function PortalLanguageToggle() {
  const language = currentLanguage();
  const next = language === 'en' ? 'ar' : 'en';
  return <button type="button" className="icon-button language-action" onClick={() => { localStorage.setItem('motara.language', JSON.stringify(next)); document.documentElement.lang = next; document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr'; window.location.reload(); }} aria-label={uiText('Switch language')} title={uiText('Switch language')}>{language === 'en' ? 'EN · العربية' : 'العربية · EN'}</button>;
}

function PortalLoginPage({ admin, notify, onOfficeActivated }: { admin: boolean; notify: (message: string) => void; onOfficeActivated: (slug: string) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!admin || !supabase) return;
    // Opening the admin login page always presents the credential form; it never silently reuses a prior session.
    void supabase.auth.signOut();
  }, [admin]);
  const destination = admin ? '/admin/overview' : '/office/overview';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setError(uiText('Secure sign-in is unavailable until the platform connection is configured.'));
      return;
    }
    setLoading(true);
    setError('');
    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !signedIn.user) {
      setLoading(false);
      setError(uiText('Invalid email or password. Please check your details and try again.'));
      return;
    }
    if (admin) {
      const { data: roles, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', signedIn.user.id).is('scope_office_id', null);
      const roleNames = roleError ? [] : (roles ?? []).map(row => String(row.role));
      const isSuperAdmin = roleNames.includes('super_admin');
      const isAdminStaff = roleNames.includes('admin_staff');
      if (!isSuperAdmin && !isAdminStaff) {
        setLoading(false);
        setError(uiText('This account does not have platform administrator access. Use the rental office portal or customer account instead.'));
        return;
      }
      let permissionIds: string[] = [];
      if (!isSuperAdmin) {
        const permissionResult = await supabase.from('role_permissions').select('permission_id').eq('role', 'admin_staff');
        permissionIds = permissionResult.error ? [] : (permissionResult.data ?? []).map(row => row.permission_id);
      }
      const adminDestination = resolvePlatformLanding(
        roleNames,
        permissionIds,
        adminNav.map(([id]) => ({ id, permission: platformSectionPermissions[id] })),
      );
      if (!adminDestination) {
        setLoading(false);
        setError(uiText('Your platform staff account has no access to the administration dashboard. Contact the Super Admin.'));
        return;
      }
      setLoading(false);
      notify(uiText('Signed in. Opening your portal…'));
      navigate(adminDestination, { replace: true });
      return;
    } else {
      const { data: offices, error: officeError } = await supabase.rpc('list_my_offices');
      const firstOffice = !officeError && Array.isArray(offices) ? offices[0] as OfficeWorkspace | undefined : undefined;
      if (!firstOffice) {
        setLoading(false);
        setError(uiText('This account is not linked to an active rental office.'));
        return;
      }
      onOfficeActivated(firstOffice.slug);
    }
    setLoading(false);
    notify(uiText('Signed in. Opening your portal…'));
    navigate(destination, { replace: true });
  };
  return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><Brand /><div className="top-actions"><PortalLanguageToggle /></div></div></header><div className="page-heading"><span className="eyebrow">{uiText(admin ? 'MOTARA ADMINISTRATION' : 'RENTAL OFFICE WORKSPACE')}</span><h1>{uiText(admin ? 'Admin sign in' : 'Office sign in')}</h1><p>{uiText(admin ? 'Sign in with your authorized Motara administrator account to open the administration portal.' : 'Sign in with an active member account for your rental office.')}</p></div><main className="content" style={{ maxWidth: 520, paddingTop: 18 }}><section className="panel-card"><form className="booking-form" onSubmit={submit}><label>{uiText('Email address')}<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@example.com" /></label><label>{uiText('Password')}<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="empty-note" style={{ color: '#b5473c' }}>{error}</p>}<button className="btn btn-block" disabled={loading}>{loading ? uiText('Signing in…') : uiText('Sign in')}</button><Link className="quiet-button" to="/">{uiText('Back to marketplace')}</Link></form></section></main><SiteFooter /></div>;
}

function PortalShell({ admin, bookings, officeId, onChange, notify }: { admin: boolean; bookings: Booking[]; officeId: string; onChange: (id: string, status: BookingStatus, details?: BookingUpdateDetails) => void; notify: (s: string) => void }) {
  const location = useLocation(); const navigate = useNavigate(); const section = location.pathname.split('/')[2] || 'overview'; const [mobileOpen, setMobileOpen] = useState(false); const [visibleNavIds, setVisibleNavIds] = useState<string[]>(() => admin ? adminNav.map(([id]) => id) : officeNav.map(([id]) => id)); const nav = admin ? adminNav.filter(([id]) => visibleNavIds.includes(id)) : officeNav; const base = admin ? '/admin' : '/office'; const title = nav.find(x => x[0] === section)?.[1] ?? 'Overview';
  const [workspaceName,setWorkspaceName]=useState(admin?'Motara':'Workspace');const [roleName,setRoleName]=useState(admin?'Platform staff':'Office member');const [profileName,setProfileName]=useState('');
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>(() => isBackendConfigured ? 'loading' : 'denied');
  useEffect(() => {
    if (!supabase) { setAccess('denied'); return; }
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
        const roleNames = roles.error ? [] : (roles.data ?? []).map(row => String(row.role));
        const isSuperAdmin = roleNames.includes('super_admin');
        const isAdminStaff = roleNames.includes('admin_staff');
        if (active) { setWorkspaceName('Motara'); setRoleName(isSuperAdmin ? 'Super Admin' : isAdminStaff ? 'Admin Staff' : ''); }
        if (isSuperAdmin) {
          allowed = true;
          if (active) setVisibleNavIds(adminNav.map(([id]) => id));
        } else if (isAdminStaff) {
          const permissions = await client.from('role_permissions').select('permission_id').eq('role', 'admin_staff');
          const permissionIds = permissions.error ? [] : (permissions.data ?? []).map(row => row.permission_id);
          const allowedIds = adminNav.filter(([id]) => hasPlatformSectionAccess(roleNames, permissionIds, platformSectionPermissions[id])).map(([id]) => id);
          if (active) setVisibleNavIds(allowedIds);
          allowed = allowedIds.includes(section);
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
  if (access !== 'allowed') return <div className="app-shell"><div className="page-heading"><span className="eyebrow">{uiText(admin ? 'ADMINISTRATION' : 'OFFICE WORKSPACE')}</span><h1>{uiText(access === 'loading' ? 'Checking access…' : 'Access required')}</h1><p>{uiText(access === 'loading' ? 'Verifying your account permissions.' : admin ? 'Sign in with an authorized platform admin account.' : 'Sign in with an active member account for this rental office.')}</p><Link to={admin ? '/admin/login' : '/office/login'} className="btn btn-sm">{uiText('Sign in')}</Link> <Link to="/" className="quiet-button">{uiText('Back to marketplace')}</Link></div></div>;
  const initials=(profileName||workspaceName).trim().split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'R';
  const exportReport=()=>{const rows=admin?bookings:bookings.filter(booking=>booking.officeId===officeId);if(!rows.length){notify(uiText('There are no bookings to export.'));return;}const encode=(value:string|number)=>{const safe=String(value).replace(/^[=+\-@]/,'\'$&');return `"${safe.replaceAll('"','""')}"`;};const csv=[['Booking','Customer','Status','Pick-up','Return','Total'],...rows.map(booking=>[booking.number??booking.id,booking.customer,booking.status,booking.start,booking.end,booking.total])].map(row=>row.map(value=>encode(value)).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`motara-bookings-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);notify(uiText('Booking report downloaded.'));};
  return <div className="dashboard-shell"><div className={`mobile-side-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} /><aside className={`side-nav ${admin ? 'admin' : ''} ${mobileOpen ? 'open' : ''}`}><div className="side-brand"><Brand /></div><div className="workspace-label">{uiText(admin ? 'Platform control' : 'Workspace')}<div style={{ float: 'right', color: '#c8f169' }}>●</div></div>{nav.map(([id, label, Icon]) => <NavLink key={id} to={`${base}/${id}`} onClick={() => setMobileOpen(false)} className={({ isActive }) => `side-link ${isActive || (id === 'overview' && section === '') ? 'active' : ''}`}><Icon size={15} />{uiText(label)}{id === 'bookings' && bookings.filter(b => b.status === 'pending').length > 0 && <span style={{ marginLeft: 'auto', background: '#c8f169', color: '#1d382f', padding: '2px 6px', borderRadius: 8, fontSize: 8 }}>{bookings.filter(b => b.status === 'pending').length}</span>}</NavLink>)}<div className="side-nav-bottom"><Link className="side-link" to="/"><ArrowLeft size={15} /> {uiText('Back to marketplace')}</Link><div className="side-user"><span className="avatar" style={{ background: '#d2ebcb' }}>{initials}</span><span style={{ fontSize: 11, fontWeight: 700 }}>{profileName || workspaceName}<small>{uiText(roleName)}</small></span><MoreHorizontal size={17} style={{ marginLeft: 'auto' }} /></div></div></aside><section className="dashboard-main"><header className="dash-topbar"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={18} /></button><span className="crumb">{uiText(admin ? 'Admin panel' : 'Office portal')} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} /> <b>{uiText(title)}</b></span></div><div className="dash-actions"><PortalLanguageToggle /><button type="button" className="quiet-button" onClick={async () => { await supabase?.auth.signOut(); navigate(admin ? '/admin/login' : '/office/login', { replace: true }); }}><LogOut size={13} /> {uiText('Sign out')}</button><span className="avatar">{initials}</span></div></header><main className="dash-body"><div className="dash-title"><div><h1>{uiText(section === 'overview' ? (admin ? 'Platform overview' : 'Welcome') : title)}{!admin && section === 'overview' && profileName ? `, ${profileName}` : ''}</h1><p>{uiText(section === 'overview' ? (admin ? 'Here’s what’s happening across Motara today.' : 'Here’s the latest from your rental office.') : 'Manage this section and keep your operation moving.')}</p></div>{section === 'overview' && <button className="btn btn-sm btn-light" onClick={exportReport}><Download size={13} /> {uiText('Download report')}</button>}</div><DataTablePage key={`${admin}-${section}`} section={section} admin={admin} bookings={bookings} officeId={officeId} onChange={onChange} notify={notify} /></main></section></div>;
}

export default function App() {
  const navigate = useNavigate(); const [lang, setLang] = useState<Lang>(() => persist<Lang>('motara.language', 'en')); const [currency, setCurrency] = useState<Currency>(() => persist<Currency>('motara.currency', 'USD'));
  // Persist and update the document synchronously BEFORE React rerenders.
  // uiText() reads the active language during render, so useEffect alone is too late.
  const changeLanguage = (next: Lang) => {
    localStorage.setItem('motara.language', JSON.stringify(next));
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    setLang(next);
  };
  const [favorites, setFavorites] = useState<string[]>(() => isDemoMode ? persist('motara.favorites', ['car-3']) : []);
  const [fleet, setFleet] = useState<Vehicle[]>(() => isDemoMode ? persist('motara.fleet.demo', seededVehicles) : []);
  const fleetContext = useMemo(() => ({ fleet, setFleet }), [fleet]);
  const [officeId, setOfficeId] = useState<string>(() => isDemoMode ? persist('motara.officeId', 'levant-mobility') : '');
  const [bookings, setBookings] = useState<Booking[]>(() => isDemoMode ? persist('motara.bookings.demo', initialBookings) : []);
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
  useEffect(() => { localStorage.setItem('motara.language', JSON.stringify(lang)); document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  useEffect(() => { localStorage.setItem('motara.currency', JSON.stringify(currency)); }, [currency]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('motara.fleet.demo', JSON.stringify(fleet)); }, [fleet]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('motara.favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('motara.bookings.demo', JSON.stringify(bookings)); }, [bookings]);
  useEffect(() => { if (isDemoMode) localStorage.setItem('motara.officeId', JSON.stringify(officeId)); }, [officeId]);
  const toggleFavorite = async (id: string) => {
    const removing = favorites.includes(id);
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { notify(uiText('Sign in to save cars to your account.')); navigate('/account'); return; }
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
  if (!supabase && import.meta.env.PROD) return <main className="app-shell"><section className="page-heading"><span className="eyebrow">{uiText('MOTARA SETUP')}</span><h1>{uiText('Connect your Supabase project')}</h1><p>{uiText('This production build needs its Supabase URL and public anon key before it can display marketplace inventory or open customer, office, and admin workspaces.')}</p><p>{uiText("Set")} <code>{uiText('VITE_SUPABASE_URL')}</code>, <code>{uiText('VITE_SUPABASE_ANON_KEY')}</code>{uiText(', and the Worker API URL in the production build environment, then rebuild.')}</p></section></main>;
  return <FleetContext.Provider value={fleetContext}><Routes><Route path="/" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><Home lang={lang} favorites={favorites} onFavorite={toggleFavorite} navigate={navigate} currency={currency} /></SiteLayout>} /><Route path="/cars" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><CarsPage favorites={favorites} onFavorite={toggleFavorite} currency={currency} /></SiteLayout>} /><Route path="/buy-cars" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><SalesMarketplace /></SiteLayout>} /><Route path="/sell-car" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><SalesMarketplace mode="submit" notify={notify}/></SiteLayout>} /><Route path="/cars/:vehicleId" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><VehicleDetails favorites={favorites} onFavorite={toggleFavorite} onBook={createBooking} notify={notify} currency={currency} lang={lang} /></SiteLayout>} /><Route path="/offices" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><OfficesPage /></SiteLayout>} /><Route path="/offices/:officeId" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><OfficeDetailsPage currency={currency} /></SiteLayout>} /><Route path="/register-office" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><RegisterOfficePage notify={notify} onOfficeActivated={setOfficeId} /></SiteLayout>} /><Route path="/account/*" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><AccountPage bookings={bookings} notify={notify} favorites={favorites} onFavorite={toggleFavorite} onOfficeActivated={setOfficeId} currency={currency} /></SiteLayout>} />{['cities', 'offers', 'about', 'contact', 'faq', 'terms', 'privacy'].map(page => <Route key={page} path={`/${page}`} element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><ContentPage page={page} lang={lang} /></SiteLayout>} />)}<Route path="/office/login" element={<PortalLoginPage admin={false} notify={notify} onOfficeActivated={setOfficeId} />} /><Route path="/admin/login" element={<PortalLoginPage admin notify={notify} onOfficeActivated={setOfficeId} />} /><Route path="/office" element={<Navigate to="/office/overview" replace />} /><Route path="/office/*" element={<PortalShell admin={false} bookings={bookings} officeId={officeId} onChange={updateBooking} notify={notify} />} /><Route path="/admin" element={<Navigate to="/admin/login" replace />} /><Route path="/admin/*" element={<PortalShell admin bookings={bookings} officeId={officeId} onChange={updateBooking} notify={notify} />} /><Route path="*" element={<SiteLayout lang={lang} setLang={changeLanguage} currency={currency} setCurrency={setCurrency}><ContentPage page="about" lang={lang} /></SiteLayout>} /></Routes><Notice />{(pathname.startsWith('/office') || pathname.startsWith('/admin')) && isDemoMode && <div style={{ position: 'fixed', bottom: 10, left: 255, zIndex: 25, fontSize: 8, background: '#e8f0e7', color: '#53705b', padding: '5px 8px', borderRadius: 7 }}>{pathname.startsWith('/admin') ? 'DEMO ADMIN · sample records' : 'DEMO OFFICE · local session'}</div>}</FleetContext.Provider>;
}
