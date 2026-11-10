import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import './server-workspace.css';

const DEV_USER = '11111111-1111-4111-8111-111111111111';
const USER_STORAGE = 'yorvi-local-test-user';
type Placement = { communityId: string; status: string };
type MyListing = { id: string; title: string; description: string; price_kopecks: string|number; status: string; city: string; category: string; placements: Placement[] };
type Community = { id:string; name:string; city?:string };
type QueueItem = { placement_id:string; listing_id:string; title:string; description:string; price_kopecks:string|number; city:string };
type Draft = { title:string; description:string; price:string; city:string; category:string };
const startDraft: Draft = {title:'',description:'',price:'',city:'Воронеж',category:'electronics'};
const rub = (kopecks:string|number) => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(Number(kopecks)/100);
const statusText:Record<string,string> = {draft:'Черновик',active:'Опубликовано',reserved:'Резерв',sold:'Продано',archived:'Архив',approved:'Одобрено',pending:'На проверке',rejected:'Отклонено',removed:'Снято'};

function errorText(e:unknown) { return e instanceof Error ? e.message : 'Неизвестная ошибка'; }
function uuidOrEmpty(s:string):boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s); }

async function api<T>(path:string, user:string, init:RequestInit = {}):Promise<T>{
 const response=await fetch(path,{
   ...init,
   headers:{
     Accept:'application/json',
     ...(init.body?{'Content-Type':'application/json'}:{}),
     ...(import.meta.env.DEV?{'x-demo-user-id':user}:{}),
     ...init.headers,
   },
 });
 const payload:unknown=await response.json().catch(()=>null);
 if(!response.ok) {
   const message = typeof payload==='object'&&payload&&'error' in payload ? String(payload.error) : response.statusText;
   if(response.status===401)throw new Error('401 · Доступ запрещён. Включите локальный ALLOW_DEMO_AUTH=true; для production нужна авторизация MAX.');
   if(response.status===403)throw new Error('403 · У пользователя нет прав на это действие.');
   throw new Error(`${response.status} · ${message}`);
 }
 return payload as T;
}
export default function ServerWorkspace() {
 const [user,setUser]=useState(()=>{try{return localStorage.getItem(USER_STORAGE)||DEV_USER;}catch{return DEV_USER;}});
 const [communities,setCommunities]=useState<Community[]>([]);
 const [mine,setMine]=useState<MyListing[]>([]);
 const [queue,setQueue]=useState<QueueItem[]>([]);
 const [selectedCircle,setSelectedCircle]=useState('');
 const [chosenCircles,setChosenCircles]=useState<string[]>([]);
 const [draft,setDraft]=useState<Draft>(startDraft);
 const [editId,setEditId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [alert,setAlert]=useState<{kind:'error'|'success'|'info';text:string}|null>(null);
 const [tab,setTab]=useState<'listings'|'moderation'>('listings');
 const notify=(kind:'error'|'success'|'info',text:string)=>setAlert({kind,text});
 const fetchData=useCallback(async()=>{
  setLoading(true);
  try{
   // Even when write auth is unavailable, public community lookup still works.
   const cs=await api<{items:Community[]}>('/api/communities',user);
   const available=cs.items||[];
   setCommunities(available);
   setSelectedCircle(previous=>available.some(c=>c.id===previous)?previous:available[0]?.id||'');
   setChosenCircles(previous=>previous.length?previous.filter(id=>available.some(c=>c.id===id)):available.length?[available[0].id]:[]);
   const own=await api<{items:MyListing[]}>('/api/me/listings',user);
   setMine(own.items||[]);
   notify('info', 'Данные получены из PostgreSQL через Fastify.');
  }catch(error){notify('error',errorText(error));setMine([]);}
  finally{setLoading(false);}
 },[user]);
 useEffect(()=>{void fetchData();},[fetchData]);
 const fetchQueue=useCallback(async()=>{
   if(!selectedCircle)return;
   try{const data=await api<{items:QueueItem[]}>(`/api/moderation/queue?communityId=${encodeURIComponent(selectedCircle)}`,user);setQueue(data.items||[]);}
   catch(error){setQueue([]);notify('error',errorText(error));}
 },[selectedCircle,user]);
 useEffect(()=>{if(tab==='moderation')void fetchQueue();},[tab,fetchQueue]);
 async function action(work:()=>Promise<void>,success:string){
  setBusy(true);
  try {await work();notify('success',success);await fetchData();if(tab==='moderation')await fetchQueue();}
  catch(error){notify('error',errorText(error));}
  finally{setBusy(false);}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();
  const price=Number(draft.price);
  if(!draft.title.trim()||!draft.description.trim()||!Number.isFinite(price)||price<0){notify('error','Укажите название, описание и корректную цену.');return;}
  if(!editId&&!chosenCircles.length){notify('error','Выберите хотя бы один круг.');return;}
  await action(async()=>{
    const values={title:draft.title.trim(),description:draft.description.trim(),priceKopecks:Math.round(price*100)};
    if(editId){
      await api(`/api/listings/${editId}`,user,{method:'PATCH',body:JSON.stringify(values)});
    }else{
      const listing=await api<{id:string}>('/api/listings',user,{method:'POST',body:JSON.stringify({
        ...values,city:draft.city,category:draft.category,requestKey:crypto.randomUUID(),
      })});
      await api(`/api/listings/${listing.id}/submit`,user,{method:'POST',body:JSON.stringify({communityIds:chosenCircles})});
    }
    setDraft(startDraft);setEditId(null);
  },editId?'Изменения сохранены. Публикация отправлена на повторную проверку.':'Объявление создано и отправлено модераторам.');
 }
 function edit(l:MyListing){
  if(l.status!=='draft'&&l.status!=='active')return;
  setEditId(l.id);setDraft({title:l.title,description:l.description,price:String(Number(l.price_kopecks)/100),city:l.city,category:l.category});
  window.scrollTo({top:0,behavior:'smooth'});
 }
 function toggleCircle(id:string){setChosenCircles(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
 async function submit(l:MyListing){
  if(!chosenCircles.length){notify('error','Сначала выберите круги.');return;}
  await action(async()=>{await api(`/api/listings/${l.id}/submit`,user,{method:'POST',body:JSON.stringify({communityIds:chosenCircles})});},'Запрос на размещение отправлен.');
 }
 async function sold(l:MyListing){
  if(!window.confirm('Отметить «Продано» во всех кругах?'))return;
  await action(async()=>{await api(`/api/listings/${l.id}/sold`,user,{method:'POST'});},'Товар продан. Он скрыт из публичных витрин.');
 }
 async function moderate(item:QueueItem,decision:'approved'|'rejected'){
  await action(async()=>{await api(`/api/placements/${item.placement_id}/moderate`,user,{method:'POST',body:JSON.stringify({decision})});},decision==='approved'?'Объявление одобрено':'Объявление отклонено');
 }
 const field=(key:keyof Draft,value:string)=>setDraft(prev=>({...prev,[key]:value}));
 return <section className="server-workspace">
  <div className="sw-heading">
   <div><span className="sw-kicker">YORVI 2.0 · БАЗА ДАННЫХ</span><h1>Серверная мастерская<span>.</span></h1>
     <p>Реальный PostgreSQL через Fastify — без подмены данных из localStorage.</p></div>
   <button className="sw-btn sw-secondary" type="button" disabled={busy||loading} onClick={()=>void fetchData()}>↻ Обновить</button>
  </div>
  <div className="sw-warning"><b>Только локальная разработка.</b> Настоящая авторизация MAX пока не подключена. В production этот раздел скрыт, а серверные операции записи заблокированы.</div>
  <div className="sw-user">
   <label htmlFor="sw-user">UUID тестового пользователя</label>
   <input id="sw-user" value={user} onChange={e=>setUser(e.target.value)} spellCheck={false} aria-invalid={!uuidOrEmpty(user)}/>
   <button className="sw-btn sw-secondary" type="button" disabled={!uuidOrEmpty(user)||busy} onClick={()=>{try{localStorage.setItem(USER_STORAGE,user);}catch{}void fetchData();}}>Применить</button>
  </div>
  {alert&&<div role="status" className={'sw-alert sw-'+alert.kind}>{alert.text}</div>}
  <nav className="sw-tabs" aria-label="Раздел серверной мастерской">
   <button className={tab==='listings'?'active':''} onClick={()=>setTab('listings')}>Мои объявления ({mine.length})</button>
   <button className={tab==='moderation'?'active':''} onClick={()=>setTab('moderation')}>Модерация кругов</button>
  </nav>
  {tab==='listings'?<>
   <form className="sw-panel" onSubmit={e=>void save(e)}>
    <div className="sw-panel-head"><h2>{editId?'Изменить объявление':'Разместить объявление'}</h2><span>Данные сохраняются в PostgreSQL</span></div>
    <div className="sw-fields">
     <label>Название товара<input required minLength={3} maxLength={120} value={draft.title} onChange={e=>field('title',e.target.value)} placeholder="Например, ноутбук ThinkPad"/></label>
     <label>Цена, ₽<input required type="number" min={0} step=".01" value={draft.price} onChange={e=>field('price',e.target.value)}/></label>
     <label>Город<input required disabled={!!editId} value={draft.city} onChange={e=>field('city',e.target.value)}/></label>
     <label>Категория<select disabled={!!editId} value={draft.category} onChange={e=>field('category',e.target.value)}><option value="electronics">Электроника</option><option value="gaming">Игры</option><option value="fashion">Одежда</option><option value="home">Для дома</option><option value="transport">Транспорт</option><option value="hobby">Хобби</option><option value="auto">Авто</option></select></label>
     <label className="sw-wide">Описание<textarea required maxLength={5000} rows={3} value={draft.description} onChange={e=>field('description',e.target.value)}/></label>
    </div>
    {!editId&&<fieldset className="sw-circles"><legend>Разместить в кругах</legend>{communities.map(c=><label key={c.id}><input type="checkbox" checked={chosenCircles.includes(c.id)} onChange={()=>toggleCircle(c.id)}/><span>{c.name}</span><small>{c.city}</small></label>)}{!communities.length&&<p>Нет доступных кругов — запустите PostgreSQL и загрузите тестовые данные.</p>}</fieldset>}
    <div className="sw-actions"><button className="sw-btn sw-primary" disabled={busy||loading||!uuidOrEmpty(user)} type="submit">{busy?'Сохраняем…':editId?'Сохранить и проверить заново':'Создать и отправить'}</button>{editId&&<button className="sw-btn sw-secondary" type="button" onClick={()=>{setEditId(null);setDraft(startDraft);}}>Отмена</button>}</div>
   </form>
   <div className="sw-panel">
    <div className="sw-panel-head"><h2>Мои объявления</h2><span>{loading?'Обновление…':mine.length+' записей'}</span></div>
    {mine.length?<div className="sw-list">{mine.map(l=><article className="sw-listing" key={l.id}>
      <div className="sw-item-top"><div><h3>{l.title}</h3><p>{l.city} · {rub(l.price_kopecks)}</p></div><span className={'sw-status '+l.status}>{statusText[l.status]||l.status}</span></div>
      <div className="sw-placement">{(l.placements||[]).map(p=><span key={p.communityId}>{communities.find(c=>c.id===p.communityId)?.name||'Круг'} · {statusText[p.status]||p.status}</span>)}</div>
      <div className="sw-actions">
       {(l.status==='draft'||l.status==='active')&&<button className="sw-btn sw-secondary" disabled={busy} onClick={()=>edit(l)}>Редактировать</button>}
       {(l.status==='draft'||l.status==='active')&&<button className="sw-btn sw-secondary" disabled={busy} onClick={()=>void submit(l)}>Отправить в круги</button>}
       {l.status==='active'&&<button className="sw-btn sw-secondary" disabled={busy} onClick={()=>void sold(l)}>Продано</button>}
      </div>
     </article>)}</div>:<div className="sw-empty">В базе нет ваших объявлений. Создайте первое через форму выше.</div>}
   </div>
  </>:<div className="sw-panel">
   <div className="sw-panel-head"><h2>Очередь модерации</h2><button className="sw-btn sw-secondary" type="button" onClick={()=>void fetchQueue()} disabled={busy}>↻ Проверить очередь</button></div>
   <label className="sw-select-label">Сообщество<select value={selectedCircle} onChange={e=>setSelectedCircle(e.target.value)}>{communities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   {queue.length?<div className="sw-list">{queue.map(item=><article className="sw-listing" key={item.placement_id}>
      <div className="sw-item-top"><div><h3>{item.title}</h3><p>{rub(item.price_kopecks)} · {item.city}</p></div><span className="sw-status pending">На проверке</span></div>
      <p>{item.description}</p>
      <div className="sw-actions"><button className="sw-btn sw-primary" disabled={busy} onClick={()=>void moderate(item,'approved')}>✓ Одобрить</button><button className="sw-btn sw-danger" disabled={busy} onClick={()=>void moderate(item,'rejected')}>Отклонить</button></div>
     </article>)}</div>:<div className="sw-empty">Очередь пуста или недоступна для выбранного пользователя.</div>}
  </div>}
 </section>;

}
