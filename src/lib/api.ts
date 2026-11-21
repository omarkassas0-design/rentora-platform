import { supabase } from './supabase';
export async function apiHealth(){ const base=import.meta.env.VITE_API_BASE_URL||''; const r=await fetch(`${base}/api/health`); if(!r.ok) throw new Error('API health check failed'); return r.json(); }
export async function createBooking(input:{carId:string;startAt:string;endAt:string}){
 const {data:{session}}=await supabase.auth.getSession(); if(!session) throw new Error('يرجى تسجيل الدخول أولاً');
 const base=import.meta.env.VITE_API_BASE_URL||'';
 const response=await fetch(`${base}/api/bookings`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${session.access_token}`},body:JSON.stringify(input)});
 const result=await response.json(); if(!response.ok) throw new Error(result.error||'تعذر إنشاء الحجز'); return result;
}
