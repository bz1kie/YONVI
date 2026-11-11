import React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import './server-workspace.css';

const DEV_USER = '11111111-1111-4111-8111-111111111111';
const USER_STORAGE = 'yorvi-local-test-user';
type Placement = { communityId: string; status: string; channelStatus?:string; channelError?:string };
type MyListing = { id: string; title: string; description: string; price_kopecks: string|number; status: string; city: string; category: string; photo_url?: string|null; placements: Placement[] };
type Community = { id:string; name:string; city?:string; max_channel_url?:string; max_channel_title?:string };
type QueueItem = { placement_id:string; listing_id:string; title:string; description:string; price_kopecks:string|number; city:string };
type Draft = { title:string; description:string; price:string; city:string; category:string };
const startDraft: Draft = {title:'',description:'',price:'',city:'Воронеж',category:'electronics'};
const rub = (kopecks:string|number) => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(Number(kopecks)/100);
const statusText:Record<string,string> = {draft:'Черновик',active:'Опубликовано',reserved:'Резерв',sold:'Продано',archived:'Архив',approved:'Одобрено',pending:'На проверке',rejected:'Отклонено',removed:'Снято'};

function errorText(e:unknown) { return e instanceof Error ? e.message : 'Неизвестная ошибка'; }
function PhotoPreviews({files}:{files:File[]}){
 const [urls,setUrls]=useState<string[]>([]);
 useEffect(()=>{
   const previews=files.map(f=>URL.createObjectURL(f));
   setUrls(previews);
   return ()=>previews.forEach(url=>URL.revokeObjectURL(url));
 },[files]);
 return files.length?<div className="sw-photo-previews">
   {urls.map((url,i)=><div key={url} className="sw-photo-preview">
     <img src={url} alt={'Предпросмотр '+(i+1)} loading="lazy"/>
     <small>{i+1} / {files.length}</small>
   </div>)}
 </div>:null;
}
function uuidOrEmpty(s:string):boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s); }

async function api<T>(path:string, user:string, init:RequestInit = {}, authenticated=false):Promise<T>{
 const response=await fetch(path,{
   ...init,
   credentials:'same-origin',
   headers:{
     Accept:'application/json',
     ...(init.body?{'Content-Type':'application/json'}:{}),
     ...(import.meta.env.DEV&&!authenticated?{'x-demo-user-id':user}:{}),
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
export default function ServerWorkspace({createRequest=0}:{createRequest?:number}) {
 const [channelMessage,setChannelMessage]=useState('');
 const [channelBusy,setChannelBusy]=useState(false);
 const [formOpen,setFormOpen]=useState(createRequest>0);
 useEffect(()=>{if(createRequest>0)setFormOpen(true);},[createRequest]);
 const [user,setUser]=useState(()=>{try{return localStorage.getItem(USER_STORAGE)||DEV_USER;}catch{return DEV_USER;}});
 const [sessionUser,setSessionUser]=useState<{id:string;nickname:string}|null>(null);
 const [authChecked,setAuthChecked]=useState(false);
 const refreshAuth=useCallback(async()=>{
   try {
     const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
     if(!response.ok){setSessionUser(null);return;}
     const info=await response.json() as {user:{id:string;nickname:string}};
     setSessionUser(info.user);
   }catch{setSessionUser(null);}
   finally{setAuthChecked(true);}
 },[]);
 useEffect(()=>{
   void refreshAuth();
   const onAuth=()=>{void refreshAuth();};
   window.addEventListener('yorvi:auth-change',onAuth);
   return ()=>window.removeEventListener('yorvi:auth-change',onAuth);
 },[refreshAuth]);
 const [newCircleName,setNewCircleName]=useState('Общий каталог LAVOSE');
 const [communities,setCommunities]=useState<Community[]>([]);
 const [mine,setMine]=useState<MyListing[]>([]);
 const [queue,setQueue]=useState<QueueItem[]>([]);
 const [selectedCircle,setSelectedCircle]=useState('');
 const [chosenCircles,setChosenCircles]=useState<string[]>([]);
 const [draft,setDraft]=useState<Draft>(startDraft);
 const [photoFiles,setPhotoFiles]=useState<File[]>([]);
 const completedPhotos=useRef(0);
 const [uploadProgress,setUploadProgress]=useState('');
 const [pendingDraftId,setPendingDraftId]=useState<string|null>(null);
 const [photoListing,setPhotoListing]=useState<string>('');
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
   const cs=await api<{items:Community[]}>('/api/communities',user,{},Boolean(sessionUser));
   const available=cs.items||[];
   setCommunities(available);
   setSelectedCircle(previous=>available.some(c=>c.id===previous)?previous:available[0]?.id||'');
   setChosenCircles(previous=>previous.length?previous.filter(id=>available.some(c=>c.id===id)):available.length?[available[0].id]:[]);
   const own=await api<{items:MyListing[]}>('/api/me/listings',user,{},Boolean(sessionUser));
   setMine(own.items||[]);
   setAlert(null);
  }catch(error){notify('error',errorText(error));setMine([]);}
  finally{setLoading(false);}
 },[user,sessionUser]);
 useEffect(()=>{if(authChecked && (sessionUser||import.meta.env.DEV))void fetchData();},[fetchData,authChecked,sessionUser]);
 const fetchQueue=useCallback(async()=>{
   if(!selectedCircle)return;
   try{const data=await api<{items:QueueItem[]}>(`/api/moderation/queue?communityId=${encodeURIComponent(selectedCircle)}`,user,{},Boolean(sessionUser));setQueue(data.items||[]);}
   catch(error){setQueue([]);notify('error',errorText(error));}
 },[selectedCircle,user,sessionUser]);
 useEffect(()=>{if(tab==='moderation')void fetchQueue();},[tab,fetchQueue]);
 async function action(work:()=>Promise<void>,success:string){
  setBusy(true);
  try {await work();await fetchData();if(tab==='moderation')await fetchQueue();notify('success',success);window.dispatchEvent(new Event('yorvi:catalog-change'));}
  catch(error){notify('error',errorText(error));}
  finally{setBusy(false);}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();
  const price=Number(draft.price);
  if(!draft.title.trim()||!draft.description.trim()||!Number.isFinite(price)||price<0){notify('error','Укажите название, описание и корректную цену.');return;}
  if(!editId&&!chosenCircles.length){notify('error','Выберите хотя бы один круг.');return;}
  if(photoFiles.length>10){notify('error','Максимум 10 фотографий');return;}
  await action(async()=>{
    const values={title:draft.title.trim(),description:draft.description.trim(),priceKopecks:Math.round(price*100)};
    let listingId=editId||pendingDraftId;
    if(editId){
      await api(`/api/listings/${editId}`,user,{method:'PATCH',body:JSON.stringify(values)},Boolean(sessionUser));
    }else if(pendingDraftId){
      await api(`/api/listings/${pendingDraftId}`,user,{method:'PATCH',body:JSON.stringify(values)},Boolean(sessionUser));
    }else{
      const listing=await api<{id:string}>('/api/listings',user,{method:'POST',body:JSON.stringify({
        ...values,city:draft.city,category:draft.category,requestKey:crypto.randomUUID(),
      })},Boolean(sessionUser));
      listingId=listing.id;
      setPendingDraftId(listing.id);
    }
    if(!listingId)throw new Error('Объявление не найдено');
    for(let i=completedPhotos.current;i<photoFiles.length;i++){
      setUploadProgress(`Фото ${i+1} из ${photoFiles.length}`);
      await uploadPhoto(listingId,photoFiles[i]);
      completedPhotos.current=i+1;
    }
    setUploadProgress('');
    if(!editId){
      await api(`/api/listings/${listingId}/submit`,user,{method:'POST',body:JSON.stringify({communityIds:chosenCircles})},Boolean(sessionUser));
    }
    setDraft(startDraft);setEditId(null);setPhotoFiles([]);completedPhotos.current=0;setPendingDraftId(null);setFormOpen(false);
  },editId?'Изменения сохранены. Публикация отправлена на повторную проверку.':'Объявление создано и отправлено модераторам.');
 }
 async function uploadPhoto(listingId:string, file:File){
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<64||file.size>5*1024*1024)
      throw new Error('Фото: JPEG, PNG или WebP до 5 МБ.');
   const signed=await api<{uploadUrl:string;mediaId:string;headers:Record<string,string>}>(
      '/api/media/uploads',user,
      {method:'POST',body:JSON.stringify({listingId,contentType:file.type,size:file.size})},
      Boolean(sessionUser)
   );
   const result=await fetch(signed.uploadUrl,{method:'PUT',headers:signed.headers,body:file});
   if(!result.ok)throw new Error('Не удалось передать изображение в хранилище: '+result.status);
   await api('/api/media/'+signed.mediaId+'/confirm',user,{method:'POST'},Boolean(sessionUser));
 }
 async function uploadExisting(){
  if(!photoFiles.length||!photoListing){notify('error','Выберите товар и фотографии');return;}
  await action(async()=>{
    for(let i=completedPhotos.current;i<photoFiles.length;i++){
      setUploadProgress(`Фото ${i+1} из ${photoFiles.length}`);
      await uploadPhoto(photoListing,photoFiles[i]);
      completedPhotos.current=i+1;
    }
    setUploadProgress('');setPhotoFiles([]);completedPhotos.current=0;
  },'Фотографии загружены и отправлены на повторную модерацию.');
 }
 function edit(l:MyListing){
  if(l.status!=='draft'&&l.status!=='active')return;
  setFormOpen(true);setEditId(l.id);setPhotoFiles([]);completedPhotos.current=0;setPendingDraftId(null);setDraft({title:l.title,description:l.description,price:String(Number(l.price_kopecks)/100),city:l.city,category:l.category});
  window.scrollTo({top:0,behavior:'smooth'});
 }
 function toggleCircle(id:string){setChosenCircles(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
 async function submit(l:MyListing){
  if(!chosenCircles.length){notify('error','Сначала выберите круги.');return;}
  await action(async()=>{await api(`/api/listings/${l.id}/submit`,user,{method:'POST',body:JSON.stringify({communityIds:chosenCircles})},Boolean(sessionUser));},'Запрос на размещение отправлен.');
 }
 async function sold(l:MyListing){
  if(!window.confirm('Отметить «Продано» во всех кругах?'))return;
  await action(async()=>{await api(`/api/listings/${l.id}/sold`,user,{method:'POST'},Boolean(sessionUser));},'Товар продан. Он скрыт из публичных витрин.');
 }
 async function moderate(item:QueueItem,decision:'approved'|'rejected'){
  await action(async()=>{await api(`/api/placements/${item.placement_id}/moderate`,user,{method:'POST',body:JSON.stringify({decision})},Boolean(sessionUser));},decision==='approved'?'Объявление одобрено':'Объявление отклонено');
 }
 const field=(key:keyof Draft,value:string)=>setDraft(prev=>({...prev,[key]:value}));
 return <section className="server-workspace">
  <div className="sw-heading">
   <div><h1>{sessionUser?.nickname||'Профиль'}</h1></div>
   <button className="sw-btn sw-secondary" type="button" disabled={busy||loading} onClick={()=>void fetchData()}>↻ Обновить</button>
  </div>
  {sessionUser?
    null:
    import.meta.env.DEV?<div className="sw-warning"><b>Локальная разработка.</b> Для тестирования используйте тестовую БД и ALLOW_DEMO_AUTH=true. Это не реальный вход MAX.</div>:
    <div className="sw-warning"><b>Нужен вход через MAX.</b> Откройте Лавось из мини-приложения MAX. Без подтверждённой сессии действия с объявлениями недоступны.</div>}
  {!sessionUser&&!import.meta.env.DEV?<div className="sw-panel"><h2>Войдите через MAX</h2><p>Личный кабинет станет доступен после подтверждения учётной записи.</p><button className="sw-btn sw-secondary" onClick={()=>void refreshAuth()}>Проверить вход</button></div>:<>
  {!sessionUser&&import.meta.env.DEV?<div className="sw-user">
   <label htmlFor="sw-user">UUID тестового пользователя</label>
   <input id="sw-user" value={user} onChange={e=>setUser(e.target.value)} spellCheck={false} aria-invalid={!uuidOrEmpty(user)}/>
   <button className="sw-btn sw-secondary" type="button" disabled={!uuidOrEmpty(user)||busy} onClick={()=>{try{localStorage.setItem(USER_STORAGE,user);}catch{}void fetchData();}}>Применить</button>
  </div>:null}
  {alert&&<div role="status" className={'sw-alert sw-'+alert.kind}>{alert.text}</div>}
  <details className="sw-panel" open={!communities.some(c=>c.max_channel_url)}><summary>Канал MAX {communities.some(c=>c.max_channel_url)?'· подключён':''}</summary>
   {communities.filter(c=>c.max_channel_url).map(c=><p key={c.id}><a href={c.max_channel_url} target="_blank" rel="noreferrer">{c.max_channel_title||c.name} ↗</a></p>)}
   <p>Лаврик должен быть администратором канала. Подключение доступно владельцу канала.</p>
   <button type="button" className="sw-btn sw-secondary" disabled={channelBusy} onClick={async()=>{
    setChannelBusy(true);setChannelMessage('Проверяем доступ Лаврика…');
    try{
     const result=await api<{title:string}>('/api/me/channel/connect',user,{method:'POST'},Boolean(sessionUser));
     setChannelMessage('Подключён: '+result.title);await fetchData();
    }catch(error){setChannelMessage(errorText(error));}
    finally{setChannelBusy(false);}
   }}>{channelBusy?'Подключаем…':'Проверить и подключить'}</button>
   {channelMessage?<p role="status" className="sw-channel-result">{channelMessage}</p>:null}
  </details>
  <nav className="sw-tabs" aria-label="Раздел серверной мастерской">
   <button className={tab==='listings'?'active':''} onClick={()=>setTab('listings')}>Мои объявления ({mine.length})</button>
   <button className={tab==='moderation'?'active':''} onClick={()=>setTab('moderation')}>Проверка</button>
  </nav>
  {tab==='listings'?<>
   <button type="button" className="sw-btn sw-primary" onClick={()=>setFormOpen(v=>!v)}>{formOpen?'Закрыть форму':'+ Разместить объявление'}</button>
   {formOpen&&<form className="sw-panel" onSubmit={e=>void save(e)}>
    <div className="sw-panel-head"><h2>{editId?'Изменить объявление':'Разместить объявление'}</h2></div>
    <div className="sw-fields">
     <label>Название товара<input required minLength={3} maxLength={120} value={draft.title} onChange={e=>field('title',e.target.value)} placeholder="Например, ноутбук ThinkPad"/></label>
     <label>Цена, ₽<input required type="number" min={0} step=".01" value={draft.price} onChange={e=>field('price',e.target.value)}/></label>
     <label>Город<input required disabled={!!editId} value={draft.city} onChange={e=>field('city',e.target.value)}/></label>
     <label>Категория<select disabled={!!editId} value={draft.category} onChange={e=>field('category',e.target.value)}><option value="electronics">Электроника</option><option value="gaming">Игры</option><option value="fashion">Одежда</option><option value="home">Для дома</option><option value="transport">Транспорт</option><option value="hobby">Хобби</option><option value="auto">Авто</option></select></label>
     <label className="sw-wide">Описание<textarea required maxLength={5000} rows={3} value={draft.description} onChange={e=>field('description',e.target.value)}/></label>
    </div>
    <div className="sw-photo-picker">
      <label htmlFor="sw-create-photos">Фотографии · до 10 шт.</label>
      <input id="sw-create-photos" type="file" multiple accept="image/jpeg,image/png,image/webp"
        onChange={e=>{
          const files=Array.from(e.target.files||[]);
          if(files.length>10||files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size<64||f.size>5*1024*1024)){
            notify('error','Выберите до 10 JPEG, PNG или WebP (до 5 МБ каждый).');e.target.value='';return;
          }
          completedPhotos.current=0;setPhotoFiles(files);
        }}/>
      <PhotoPreviews files={photoFiles}/>
      {photoFiles.length?<div className="sw-photo-chips">{photoFiles.map((file,i)=><span key={file.name+'-'+i}>{i+1}. {file.name}</span>)}</div>:null}
      <small>Файлы отправляются до публикации. При ошибке черновик останется в базе.</small>
    </div>
    {!editId&&<fieldset className="sw-circles"><legend>Разместить в кругах</legend>{communities.map(c=><label key={c.id}><input type="checkbox" checked={chosenCircles.includes(c.id)} onChange={()=>toggleCircle(c.id)}/><span>{c.name}</span><small>{c.city}</small></label>)}{!communities.length&&<div><p>Создайте первый круг. Вы станете его владельцем и сможете одобрять объявления во вкладке «Модерация кругов».</p><label>Название круга<input value={newCircleName} minLength={3} maxLength={80} onChange={e=>setNewCircleName(e.target.value)}/></label><button type="button" className="sw-btn sw-secondary" disabled={busy||newCircleName.trim().length<3} onClick={()=>void action(async()=>{
      const circle=await api<{id:string}>('/api/communities',user,{method:'POST',body:JSON.stringify({name:newCircleName.trim()})},Boolean(sessionUser));
      setChosenCircles([circle.id]);setSelectedCircle(circle.id);
    },'Круг создан. Теперь можно отправить объявление на проверку.')}>Создать круг</button></div>}</fieldset>}
    {uploadProgress?<p role="status" className="sw-upload-progress">Загружаем {uploadProgress}</p>:null}
    {pendingDraftId&&!editId?<p className="sw-upload-progress">Черновик сохранён. Повторная отправка не создаст дубликат.</p>:null}
    <div className="sw-actions"><button className="sw-btn sw-primary" disabled={busy||loading||(!sessionUser&&!uuidOrEmpty(user))} type="submit">{busy?'Сохраняем…':editId?'Сохранить и проверить заново':'Создать и отправить'}</button>{editId&&<button className="sw-btn sw-secondary" type="button" onClick={()=>{setEditId(null);setPendingDraftId(null);setPhotoFiles([]);completedPhotos.current=0;setDraft(startDraft);}}>Отмена</button>}</div>
   </form>}
   <div className="sw-panel">
    <div className="sw-panel-head"><h2>Мои объявления</h2><span>{loading?'Обновление…':mine.length+' записей'}</span></div>
    {mine.length?<div className="sw-list">{mine.map(l=><article className="sw-listing" key={l.id}>
      <div className="sw-item-top">{l.photo_url?<img src={l.photo_url} alt={"Фотография "+l.title} className="sw-cover" loading="lazy"/>:null}<div><h3>{l.title}</h3><p>{l.city} · {rub(l.price_kopecks)}</p></div><span className={'sw-status '+l.status}>{l.status==='active'&&!l.placements.some(p=>p.status==='approved')?'На проверке':statusText[l.status]||l.status}</span></div>
      {l.placements.some(p=>p.status==='pending')?<p>Ожидает одобрения владельцем круга. После проверки появится в каталоге.</p>:null}
      {l.placements.map(p=>p.channelStatus?<p key={'max-'+p.communityId} role="status">{p.channelStatus==='sent'?'✓ Опубликовано в канале MAX':p.channelStatus==='pending'?'Ожидает отправки в MAX':p.channelStatus==='sending'||p.channelStatus==='unknown'?'Проверьте канал: результат отправки уточняется':p.channelStatus==='failed'?'Не отправлено в MAX: '+p.channelError:'Публикация отменена'}</p>:null)}
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
  </>}
 </section>;

}
