import {useCallback,useEffect,useRef,useState} from 'react';
import './conversations.css';
type Thread={id:string;title:string;partner_name:string;last_message?:string;listing_status:string};
type Message={id:string;text:string;mine:boolean;created_at:string};
async function request<T>(path:string,body?:unknown):Promise<T>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('/api'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось загрузить сообщения.');return data;
 }finally{clearTimeout(timer);}
}
export default function Conversations(){
 const [open,setOpen]=useState(false);const [threads,setThreads]=useState<Thread[]>([]);const [selected,setSelected]=useState('');
 const [messages,setMessages]=useState<Message[]>([]);const [text,setText]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);
 const epoch=useRef(0);const messageEpoch=useRef(0);const retry=useRef<{text:string;key:string;id:string}|null>(null);const draft=useRef('');const panel=useRef<HTMLElement>(null);const bottom=useRef<HTMLDivElement>(null);
 const refreshThreads=useCallback(async()=>{const version=epoch.current;const data=await request<{items:Thread[]}>('/conversations');if(version===epoch.current)setThreads(data.items);},[]);
 useEffect(()=>{
  const launch=async(event:Event)=>{
   const version=++epoch.current;setOpen(true);setError('');setLoading(true);setSelected('');setMessages([]);setText('');retry.current=null;
   const listingId=(event as CustomEvent<{listingId?:string}>).detail?.listingId;
   try{
    const conversation=listingId?await request<{id:string}>('/conversations',{listingId}):null;
    if(version!==epoch.current)return;
    await refreshThreads();if(version!==epoch.current)return;if(conversation)setSelected(conversation.id);
   }catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Не удалось открыть сообщения.');}
   finally{if(version===epoch.current)setLoading(false);}
  };
  const handler=(e:Event)=>{void launch(e);};
  window.addEventListener('lavose:messages',handler);
  let initial=new URLSearchParams(window.location.search).get('conversation');
  const onAuth=()=>{epoch.current++;setOpen(false);setMessages([]);setThreads([]);setSelected('');
   const bridge=(window as Window & {WebApp?:{initData?:string}}).WebApp;
   const start=new URLSearchParams(bridge?.initData||'').get('start_param');
   const target=initial||(start?.startsWith('conversation_')?start.slice(13):null);
   initial=null;
   if(target&&/^[0-9a-f-]{36}$/i.test(target))void launch(new Event('launch')).then(()=>{setSelected(target);});
  };
  window.addEventListener('yorvi:auth-change',onAuth);
  return ()=>{epoch.current++;window.removeEventListener('lavose:messages',handler);window.removeEventListener('yorvi:auth-change',onAuth);};
 },[refreshThreads]);
 useEffect(()=>{
  if(!open)return;let active=true;
  const tick=()=>{request<{items:Thread[]}>('/conversations').then(data=>{if(active)setThreads(data.items);}).catch(()=>{});};
  const timer=setInterval(tick,5000);return ()=>{active=false;clearInterval(timer);};
 },[open]);
 useEffect(()=>{
  setMessages([]);setText('');draft.current='';retry.current=null;if(!open||!selected)return;
  let active=true;const version=++messageEpoch.current;setLoading(true);
  const tick=async()=>{try{const data=await request<{items:Message[]}>('/conversations/'+selected+'/messages');if(active&&version===messageEpoch.current)setMessages(data.items);}catch(e){if(active)setError(e instanceof Error?e.message:'Ошибка загрузки.');}finally{if(active)setLoading(false);}};
  void tick();const timer=setInterval(()=>void tick(),5000);return ()=>{active=false;messageEpoch.current++;clearInterval(timer);};
 },[open,selected]);
 const close=()=>{epoch.current++;setOpen(false);setSelected('');};
 useEffect(()=>{if(!open)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close();if(e.key==='Tab'){const elements=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)');if(elements?.length){const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}};const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLElement>('button')?.focus();window.addEventListener('keydown',onKey);const old=document.body.style.overflow;document.body.style.overflow='hidden';return ()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=old;previous?.focus();};},[open]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'end'});},[messages[messages.length-1]?.id]);
 const thread=threads.find(t=>t.id===selected);
 if(!open)return null;
 return <div className="chat-backdrop"><section ref={panel} className="lavose-chat" role="dialog" aria-modal="true" aria-label="Сообщения Лавось">
  <header>{selected?<button type="button" onClick={()=>{epoch.current++;setSelected('');setError('');}}>← Диалоги</button>:<strong>Сообщения</strong>}<button type="button" onClick={close} aria-label="Закрыть сообщения">✕</button></header>
  {error?<p role="alert" className="chat-error">{error}</p>:null}
  {selected?<><div className="chat-heading"><strong>{thread?.title||'Объявление'}</strong><span>{thread?.partner_name||'Собеседник'}</span></div>
   <div className="chat-history" aria-label="История сообщений">{loading&&!messages.length?<p>Загрузка…</p>:messages.length?messages.map(m=><article key={m.id} className={'chat-bubble '+(m.mine?'mine':'')}><p>{m.text}</p><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></article>):<p>Начните разговор об объявлении.</p>}<div ref={bottom}/></div>
   <form className="chat-compose" onSubmit={async e=>{
    e.preventDefault();const content=text.trim();if(!content||busy)return;
    const id=selected;const version=epoch.current;setBusy(true);setError('');
    const pending=retry.current?.text===content&&retry.current.id===id?retry.current:{text:content,id,key:crypto.randomUUID()};retry.current=pending;
    try{const item=await request<Message>('/conversations/'+id+'/messages',{text:content,requestKey:pending.key});if(version!==epoch.current)return;
     setMessages(previous=>previous.some(m=>m.id===item.id)?previous:[...previous,item]);if(draft.current===text){setText('');draft.current='';}retry.current=null;void refreshThreads().catch(()=>{});
    }catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Сообщение не отправлено. Попробуйте снова.');}finally{setBusy(false);}
   }}><label className="chat-sr" htmlFor="chat-text">Сообщение продавцу или покупателю</label><textarea autoFocus id="chat-text" rows={2} maxLength={2000} placeholder="Напишите сообщение…" value={text} onChange={e=>{setText(e.target.value);draft.current=e.target.value;}} disabled={busy}/><button type="submit" disabled={busy||!text.trim()}>{busy?'Отправка…':'Отправить'}</button></form>
  </>:<div className="chat-threads">{loading?<p>Загрузка…</p>:threads.length?threads.map(t=><button type="button" key={t.id} onClick={()=>{epoch.current++;setSelected(t.id);setError('');}}><strong>{t.title}</strong><span>{t.partner_name}</span><small>{t.last_message||'Нет сообщений'}</small></button>):<p>Пока нет диалогов. Откройте объявление и нажмите «Написать продавцу».</p>}</div>}
 </section></div>;
}
