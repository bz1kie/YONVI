import {useEffect,useRef,useState} from 'react';
import './listing-details.css';
type Card={id:string;title:string;price_kopecks:string|number;city:string;category:string;photo_url?:string|null};
type Item=Card&{description:string;created_at:string;seller_name:string;item_condition?:string|null;attributes?:Record<string,string>;images?:{id:string;url:string}[]};
type Recommendations={sellerItems:Card[];similarItems:Card[]};
const rub=(v:string|number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(Number(v)/100);
const conditions:Record<string,string>={new:'Новое',excellent:'Отличное',good:'Хорошее',used:'Б/у',repair:'Требует ремонта'};
const labels:Record<string,string>={manufacturer:'Производитель',model:'Модель',memory:'Память / комплектация',color:'Цвет',part_number:'Артикул',compatibility:'Совместимость'};
export default function ListingDetails({id,liked,onClose,onFavorite,onOpen}:{id:string;liked:boolean;onClose:()=>void;onFavorite:()=>void;onOpen:(id:string)=>void}){
 const [item,setItem]=useState<Item|null>(null),[recommendations,setRecommendations]=useState<Recommendations>({sellerItems:[],similarItems:[]});
 const [error,setError]=useState(''),[index,setIndex]=useState(0),[full,setFull]=useState(false),[expanded,setExpanded]=useState(false),[shareMessage,setShareMessage]=useState('');
 const touch=useRef<number|null>(null),panel=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null);
 const images=item?.images?.filter(photo=>photo.url.startsWith('/api/media/')).map(photo=>photo.url)||[];
 const attributes=Object.entries(item?.attributes||{}).filter(([key,value])=>Object.hasOwn(labels,key)&&value.trim());
 useEffect(()=>{const controller=new AbortController();let active=true;setItem(null);setError('');setIndex(0);setExpanded(false);setFull(false);setRecommendations({sellerItems:[],similarItems:[]});setShareMessage('');
  fetch('/api/listings/'+encodeURIComponent(id),{signal:controller.signal,headers:{Accept:'application/json'}}).then(async response=>{if(!response.ok)throw Error('Объявление недоступно: возможно, оно снято с публикации.');return response.json();}).then(data=>{if(active){setItem(data);scroller.current?.scrollTo({top:0});}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить объявление.');});
  fetch('/api/listings/'+encodeURIComponent(id)+'/recommendations',{signal:controller.signal,headers:{Accept:'application/json'}}).then(async response=>response.ok?response.json():null).then(data=>{if(active&&data)setRecommendations(data);}).catch(()=>{});
  return ()=>{active=false;controller.abort();};
 },[id]);
 useEffect(()=>{const old=document.body.style.overflow,previous=document.activeElement as HTMLElement|null;document.body.style.overflow='hidden';panel.current?.querySelector<HTMLElement>('button')?.focus();return ()=>{document.body.style.overflow=old;previous?.focus();};},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();if(full)setFull(false);else onClose();}if(e.key==='ArrowLeft')setIndex(i=>Math.max(0,i-1));if(e.key==='ArrowRight')setIndex(i=>Math.max(0,Math.min(images.length-1,i+1)));if(e.key==='Tab'){const elements=Array.from((full?panel.current?.querySelector('.pd-lightbox'):panel.current)?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary')||[]).filter(el=>el.getClientRects().length>0);const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key,true);return ()=>document.removeEventListener('keydown',key,true);},[full,images.length,onClose]);
 useEffect(()=>{if(full)panel.current?.querySelector<HTMLElement>('.pd-lightbox-close')?.focus();},[full]);
 const move=(step:number)=>setIndex(i=>Math.max(0,Math.min(images.length-1,i+step)));
 const share=async()=>{try{const url=location.origin+'/?listing='+encodeURIComponent(id);if(navigator.share)await navigator.share({title:item?.title,url});else{await navigator.clipboard.writeText(url);setShareMessage('Ссылка скопирована');}}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setShareMessage('Не удалось поделиться ссылкой');}};
 const cards=(items:Card[],heading:string)=>items.length?<section className="pd-section"><h2>{heading}</h2><div className="pd-recommendations">{items.map(card=><button type="button" key={card.id} onClick={()=>onOpen(card.id)}>{card.photo_url?<img src={card.photo_url} alt="" loading="lazy"/>:<div className="pd-related-placeholder">Без фото</div>}<strong>{rub(card.price_kopecks)}</strong><span>{card.title}</span><small>{card.city}</small></button>)}</div></section>:null;
 return <div className="pd-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={panel} className="pd-modal" role="dialog" aria-modal="true" aria-label={item?.title||'Объявление'}>
  <header className="pd-toolbar" inert={full}><button type="button" onClick={onClose} aria-label="Назад к каталогу">←</button><span>Объявление</span><button type="button" onClick={()=>void share()} aria-label="Поделиться объявлением">↗</button><button type="button" aria-label={liked?'Убрать из избранного':'В избранное'} aria-pressed={liked} onClick={onFavorite}>{liked?'♥':'♡'}</button></header>
  <div className="pd-scroll" ref={scroller} inert={full}>
   {error?<p role="alert" className="pd-error">{error}</p>:!item?<p className="pd-loading">Загружаем объявление…</p>:<>
    <div className="pd-main"><div className="pd-gallery" onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{if(touch.current!==null){const difference=touch.current-e.changedTouches[0].clientX;if(Math.abs(difference)>40)move(difference>0?1:-1);touch.current=null;}}}>
     {images.length?<button type="button" className="pd-photo" onClick={()=>setFull(true)} aria-label="Открыть фотографию на весь экран"><img src={images[index]||images[0]} alt={item.title+' — фото '+(index+1)}/></button>:<div className="pd-no-photo"><span aria-hidden="true">▧</span><p>Продавец пока не добавил фотографии</p></div>}
     {images.length>1?<><button className="pd-prev" type="button" aria-label="Предыдущее фото" disabled={index===0} onClick={()=>move(-1)}>‹</button><button className="pd-next" type="button" aria-label="Следующее фото" disabled={index===images.length-1} onClick={()=>move(1)}>›</button></>:null}
     {images.length?<span className="pd-counter">{index+1} / {images.length}</span>:null}
     {images.length>1?<div className="pd-thumbs">{images.map((url,i)=><button type="button" key={url} aria-label={'Показать фото '+(i+1)} aria-pressed={index===i} onClick={()=>setIndex(i)}><img src={url} alt="" loading="lazy"/></button>)}</div>:null}
    </div>
    <div className="pd-summary"><strong className="pd-price">{rub(item.price_kopecks)}</strong><h1>{item.title}</h1><div className="pd-meta"><span>{item.city}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</time></div>
     {item.item_condition?<span className={'pd-condition '+(item.item_condition==='repair'?'needs-repair':'')}>{conditions[item.item_condition]||item.item_condition}</span>:null}
     {item.attributes?.defects?<div className="pd-defects"><strong>Особенности и дефекты</strong><p>{item.attributes.defects}</p></div>:null}
     <section className="pd-seller"><div className="pd-avatar" aria-hidden="true">{item.seller_name?.slice(0,1)||'П'}</div><div><h2>{item.seller_name||'Продавец'}</h2><p>Продавец Лавось</p></div>{recommendations.sellerItems.length?<a href="#pd-seller-listings" onClick={e=>{e.preventDefault();panel.current?.querySelector('#pd-seller-listings')?.scrollIntoView({behavior:'smooth'});}}>Другие объявления ↓</a>:null}</section>
     <div className="pd-contact"><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('lavose:messages',{detail:{listingId:id}}))}>Написать продавцу</button><small>Переписка внутри Лавось</small></div>
    </div></div>
    <div className="pd-body"><section className="pd-section"><h2>Описание</h2><p className="pd-description">{expanded?item.description:item.description.slice(0,420)}{!expanded&&item.description.length>420?'…':''}</p>{item.description.length>420?<button className="pd-text-button" type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть':'Читать полностью'}</button>:null}</section>
     {attributes.length?<section className="pd-section"><h2>Характеристики</h2><dl className="pd-specs">{attributes.map(([key,value])=><div key={key}><dt>{labels[key]}</dt><dd>{value}</dd></div>)}</dl></section>:null}
     <section className="pd-section"><h2>Местоположение</h2><p>{item.city}</p><small>Место встречи уточните у продавца в переписке.</small></section>
     {recommendations.sellerItems.length?<div id="pd-seller-listings">{cards(recommendations.sellerItems,'Ещё у продавца')}</div>:null}
     {cards(recommendations.similarItems,'Похожие объявления')}
    </div>
   </>}
  </div>
  {shareMessage?<p className="pd-share-status" role="status">{shareMessage}</p>:null}
  {full&&images.length?<div className="pd-lightbox" role="dialog" aria-label="Просмотр фотографий"><button type="button" className="pd-lightbox-close" onClick={()=>setFull(false)} aria-label="Закрыть фотографию">✕</button><button type="button" aria-label="Предыдущее фото" disabled={index===0} onClick={()=>move(-1)}>‹</button><img src={images[index]} alt={item?.title||'Фото товара'}/><button type="button" aria-label="Следующее фото" disabled={index===images.length-1} onClick={()=>move(1)}>›</button><span>{index+1} / {images.length}</span></div>:null}
 </div></div>;
}
