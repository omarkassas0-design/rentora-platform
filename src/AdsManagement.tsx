import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Megaphone, RefreshCw, Trash2, MessageCircle } from 'lucide-react';
import { supabase } from './lib/supabase';
import { uiText, currentLanguage } from './lib/locale';

type AdRow = { id:string; office_id:string; headline:string; headline_en?:string|null; headline_ar?:string|null; image_path:string; target_url:string|null; status:'pending'|'approved'|'rejected'|'paused'; starts_at:string|null; ends_at:string|null; created_at:string; rejection_note:string|null; rental_offices?:{name:string}|null };
const bucket='advertisement-images';
const OWNER_WHATSAPP='963930478389';
function whatsappUrl(message:string){return `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(message)}`;}
function publicImage(path:string){return supabase?.storage.from(bucket).getPublicUrl(path).data.publicUrl??'';}

export function PublicAdCarousel(){
 const [ads,setAds]=useState<AdRow[]>([]); const [index,setIndex]=useState(0);
 useEffect(()=>{if(!supabase)return;let alive=true;void supabase.from('advertisement_campaigns').select('id,office_id,headline,headline_en,headline_ar,image_path,target_url,status,starts_at,ends_at,created_at,rejection_note').eq('status','approved').lte('starts_at',new Date().toISOString()).gt('ends_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(12).then(({data})=>{if(alive)setAds((data??[]) as AdRow[])});return()=>{alive=false};},[]);
 useEffect(()=>{if(ads.length<2)return;const timer=window.setInterval(()=>setIndex(v=>(v+1)%ads.length),5000);return()=>window.clearInterval(timer)},[ads.length]);
 if(!ads.length)return <section className="motara-ad-wrap" aria-label={uiText('Sponsored advertisements')}><div className="motara-ad-empty"><div className="motara-ad-empty-copy"><span className="motara-ad-kicker">{uiText('ADVERTISE ON MOTARA')}</span><h2>{uiText('Put your cars in the spotlight')}</h2><p>{uiText('Reach people looking to buy or rent their next car.')}</p><a className="motara-ad-cta" href={whatsappUrl('Hello Motara, I would like to advertise my office on the platform.')} target="_blank" rel="noreferrer">{uiText('Contact us on WhatsApp')} <MessageCircle size={16}/></a></div><div className="motara-ad-empty-art"><span className="ad-orbit ad-orbit-one"/><span className="ad-orbit ad-orbit-two"/><Megaphone size={72}/></div><span className="motara-ad-empty-note">{uiText('Sponsored space')}</span></div></section>;const ad=ads[index];const adHeadline=currentLanguage()==='ar'?(ad.headline_ar||ad.headline):(ad.headline_en||ad.headline);const move=(n:number)=>setIndex(v=>(v+n+ads.length)%ads.length);
 const content=<><img src={publicImage(ad.image_path)} alt={adHeadline} /><div className="motara-ad-shade"><span>{uiText('Sponsored')}</span><strong>{adHeadline}</strong><small>{uiText('Featured Motara partner')}</small></div><div className="motara-ad-controls"><button type="button" aria-label={uiText('Previous advertisement')} onClick={e=>{e.preventDefault();e.stopPropagation();move(-1)}}><ChevronLeft/></button><div>{ads.map((item,i)=><button type="button" aria-label={`Show advertisement ${i+1}`} className={i===index?'active':''} key={item.id} onClick={e=>{e.preventDefault();e.stopPropagation();setIndex(i)}}/>)}</div><button type="button" aria-label={uiText('Next advertisement')} onClick={e=>{e.preventDefault();e.stopPropagation();move(1)}}><ChevronRight/></button></div></>;
 return <section className="motara-ad-wrap" aria-label="Sponsored rental offices">{ad.target_url?<a className="motara-ad-slide" href={ad.target_url} target="_blank" rel="noreferrer">{content}</a>:<div className="motara-ad-slide">{content}</div>}</section>;
}

export default function AdsManagement({admin,notify}:{admin:boolean;officeId:string;notify:(message:string)=>void}){
 const [rows,setRows]=useState<AdRow[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [notes,setNotes]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{if(!supabase||!admin)return;setLoading(true);setError('');const q=supabase.from('advertisement_campaigns').select('id,office_id,headline,headline_en,headline_ar,image_path,target_url,status,starts_at,ends_at,created_at,rejection_note,rental_offices(name)').order('created_at',{ascending:false}).limit(200);const result=await q;if(result.error)setError(result.error.message);setRows((result.data??[]) as unknown as AdRow[]);setLoading(false);},[admin]);
 useEffect(()=>{if(admin)void load()},[load,admin]);
 if(!admin){const message=currentLanguage()==='ar'?'مرحباً، أرغب بالاستفسار عن الإعلان على منصة Motara.':'Hello, I would like to enquire about advertising on Motara.';return <div className="ads-management"><section className="panel-card"><div className="panel-head"><div><h3><Megaphone size={17}/> {uiText('Advertise your office on Motara')}</h3><p>{uiText('Advertising is managed directly by the Motara platform team. Offices cannot publish or upload advertisements themselves.')}</p></div></div><div className="panel-card" style={{marginTop:16,padding:20}}><h3>{uiText('Contact the platform owner')}</h3><p>{uiText('Contact us on WhatsApp to discuss available advertising spaces, pricing, campaign duration, and image requirements.')}</p><a className="btn" href={whatsappUrl(message)} target="_blank" rel="noreferrer"><MessageCircle size={16}/> {uiText('Contact us on WhatsApp')}</a><p style={{marginTop:12,fontSize:12,color:'#748078'}}>+963 930 478 389</p></div></section></div>;}
 if(!supabase)return <div className="panel-card"><h3>{uiText('Advertisement campaigns')}</h3><p>{uiText('Connect Supabase to submit and manage image advertisements.')}</p></div>;
 const moderate=async(row:AdRow,status:AdRow['status'])=>{const result=await supabase.from('advertisement_campaigns').update({status,rejection_note:status==='rejected'?(notes[row.id]?.trim()||null):null,approved_by:status==='approved'?(await supabase.auth.getUser()).data.user?.id:null,approved_at:status==='approved'?new Date().toISOString():null}).eq('id',row.id);if(result.error)setError(result.error.message);else{notify(uiText('Advertisement status updated.'));await load();}};
 const remove=async(row:AdRow)=>{if(!window.confirm(uiText('Delete this advertisement request?')))return;const result=await supabase.from('advertisement_campaigns').delete().eq('id',row.id);if(result.error)setError(result.error.message);else{await supabase.storage.from(bucket).remove([row.image_path]);notify(uiText('Advertisement deleted.'));await load();}};
 return <div className="ads-management"><section className="panel-card"><div className="panel-head"><div><h3><Megaphone size={17}/> {admin?uiText('Advertisement requests'):uiText('Advertise your office on Motara')}</h3><p>{uiText('Manage bilingual image advertisements, campaign dates, and which promotions appear on the marketplace homepage. Only platform administrators can publish advertisements.')}</p></div><button className="quiet-button" onClick={()=>void load()}><RefreshCw size={13}/> {uiText('Refresh')}</button></div>
 {error&&<div className="empty-note" role="alert">{error}</div>}{loading&&<div className="empty-note">{uiText('Loading advertisements…')}</div>}
 <div className="ads-request-list">
   {rows.map((row) => {
     const officeName = row.rental_offices && row.rental_offices.name ? row.rental_offices.name : 'Rental office';
     const createdDate = new Date(row.created_at).toLocaleDateString();
     const rejectionText = notes[row.id] !== undefined ? notes[row.id] : (row.rejection_note || '');
     return (
       <article className="ads-request" key={row.id}>
         <img src={publicImage(row.image_path)} alt={row.headline} />
         <div className="ads-request-info">
           <strong>{row.headline_en || row.headline}</strong>
           <strong dir="rtl">{row.headline_ar || row.headline}</strong>
           <small>{admin ? officeName : createdDate}</small>
           <span className={`status-pill ${row.status}`}>{uiText(row.status)}</span>
           {row.rejection_note ? <small>{row.rejection_note}</small> : null}
         </div>
         {admin ? (
           <div className="ads-actions">
             <textarea aria-label="Rejection note" placeholder={uiText('Rejection note (optional)')} value={rejectionText} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} />
             <button className="btn btn-sm" onClick={() => void moderate(row, 'approved')}>{uiText('Approve')}</button>
             <button className="quiet-button" onClick={() => void moderate(row, 'rejected')}>{uiText('Reject')}</button>
             {row.status === 'approved' ? <button className="quiet-button" onClick={() => void moderate(row, 'paused')}>{uiText('Pause')}</button> : null}
             <button className="quiet-button" onClick={() => void remove(row)} aria-label="Delete"><Trash2 size={14} /></button>
           </div>
         ) : null}
       </article>
     );
   })}
   {!loading && rows.length === 0 ? <div className="empty-note">{uiText('No advertisement requests yet.')}</div> : null}
 </div>
 </section>
 </div>;
}
