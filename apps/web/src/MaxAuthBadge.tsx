import React from 'react';
import { useCallback, useEffect, useState } from 'react';

type SessionUser = {id:string; nickname:string};
type WindowWithMax = Window & { WebApp?: { initData?:string; ready?:()=>void; expand?:()=>void } };
async function json<T>(response:Response):Promise<T>{
 const body:unknown=await response.json().catch(()=>null);
 if(!response.ok){
  const error=body&&typeof body==='object'&&'error' in body?String(body.error):String(response.status);
  throw new Error(error);
 }
 return body as T;
}
/**
 * MAX Bridge's initDataUnsafe is display-only and MUST NOT be trusted.
 * The backend performs HMAC verification with MAX_BOT_TOKEN.
 */
export default function MaxAuthBadge({onLogin}:{onLogin?:()=>void}){
 const [user,setUser]=useState<SessionUser|null>(null);
 const [status,setStatus]=useState<'loading'|'signed-in'|'outside-max'|'error'>('loading');
 const [error,setError]=useState('');
 const launch=useCallback(async()=>{
  try{
   const who=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
   if(who.ok){
    const data=await json<{user:SessionUser}>(who);setUser(data.user);setStatus('signed-in');window.dispatchEvent(new Event('yorvi:auth-change'));return;
   }
   const bridge=(window as WindowWithMax).WebApp;
   const initData=bridge?.initData;
   if(!initData){setStatus('outside-max');return;}
   await json<{user:SessionUser}>(await fetch('/api/auth/max',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData}),
   }));
   // A successful signature check does not prove the browser retained its cookie.
   const confirmed=await json<{user:SessionUser}>(await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}));
   setUser(confirmed.user);setStatus('signed-in');window.dispatchEvent(new Event('yorvi:auth-change'));bridge?.ready?.();
  }catch(e){
   setStatus('error');setError(e instanceof Error?e.message:'Не удалось войти');
  }
 },[]);
 useEffect(()=>{void launch();const refresh=()=>{void fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(r.ok){const data=await r.json();setUser(data.user);setStatus('signed-in');}else{setUser(null);setStatus('outside-max');}}).catch(()=>{});};window.addEventListener('yorvi:auth-change',refresh);return()=>window.removeEventListener('yorvi:auth-change',refresh);},[launch]);
 const logout=async()=>{
  try{
   await json(await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}));
   setUser(null);setStatus('outside-max');window.dispatchEvent(new Event('yorvi:auth-change'));
  }catch(e){setError(e instanceof Error?e.message:'Ошибка выхода');setStatus('error');}
 };
 if(status==='loading')return <span className="max-auth-badge" aria-label="Проверка входа MAX">MAX · проверяем вход</span>;
 if(status==='signed-in'&&user)return <div className="max-auth-badge max-auth-active" title="Учётная запись MAX подтверждена сервером">
  <span>✓ MAX · {user.nickname}</span>
  <button type="button" aria-label="Выйти из LAVOSE" onClick={()=>void logout()}>Выйти</button>
 </div>;
 if(status==='error')return <button type="button" className="max-auth-badge" title={error} onClick={()=>void launch()}>MAX · ошибка входа ↻</button>;
 return <button type="button" className="max-auth-badge login-trigger" onClick={onLogin}>Вход через MAX</button>;
}
