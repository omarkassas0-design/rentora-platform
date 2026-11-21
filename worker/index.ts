export interface Env { SUPABASE_URL:string; SUPABASE_ANON_KEY:string; ALLOWED_ORIGIN?:string; ASSETS:{fetch(request:Request):Promise<Response>} }
const json=(data:unknown,status=200,origin='*')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','vary':'Origin','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
function getOrigin(request:Request,env:Env){const requestOrigin=request.headers.get('Origin')||'';const allowed=(env.ALLOWED_ORIGIN||'*').split(',').map(x=>x.trim()).filter(Boolean);if(allowed.includes('*'))return '*';if(!requestOrigin)return allowed[0]||'';return allowed.includes(requestOrigin)?requestOrigin:'';}
export default { async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 // Serve the Vite app and static assets directly. API routes are handled below.
 if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
 const origin=getOrigin(request,env);if(!origin)return json({error:'ORIGIN_NOT_ALLOWED'},403,'null');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'86400','vary':'Origin'}});
 if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,service:'rentora-api',timestamp:new Date().toISOString()},200,origin);
 if(url.pathname==='/api/bookings'&&request.method==='POST'){
  const auth=request.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json({error:'AUTH_REQUIRED'},401,origin);
  let body:any;try{body=await request.json();}catch{return json({error:'INVALID_JSON'},400,origin);}
  if(typeof body.carId!=='string'||body.carId.length>80||typeof body.startAt!=='string'||typeof body.endAt!=='string')return json({error:'INVALID_INPUT'},400,origin);
  const start=new Date(body.startAt),end=new Date(body.endAt);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return json({error:'INVALID_DATES'},400,origin);
  const token=auth.slice(7);const base=env.SUPABASE_URL.replace(/\/$/,'');
  const verify=await fetch(`${base}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,authorization:`Bearer ${token}`}});if(!verify.ok)return json({error:'INVALID_SESSION'},401,origin);
  const rpc=await fetch(`${base}/rest/v1/rpc/create_booking`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({p_car_id:body.carId,p_start_at:start.toISOString(),p_end_at:end.toISOString(),p_customer_note:typeof body.note==='string'?body.note.slice(0,1000):null})});
  const result=await rpc.json().catch(()=>({}));if(!rpc.ok){const raw=JSON.stringify(result);const error=raw.includes('CAR_ALREADY_BOOKED')?'هذه السيارة محجوزة في الفترة المحددة.':raw.includes('CAR_NOT_AVAILABLE')?'السيارة غير متاحة حالياً.':raw.includes('START_DATE_IN_PAST')?'لا يمكن اختيار موعد في الماضي.':'تعذر إنشاء الحجز. تحقق من البيانات وحاول مجدداً.';return json({error},rpc.status===409?409:400,origin);}
  return json({ok:true,booking:result},201,origin);
 }
 return json({error:'NOT_FOUND'},404,origin);
}}
