import {useState} from 'react';
type Props={image:File|null;onApply:(title:string,category:string)=>void};
export default function PhotoRecognition({image,onApply}:Props){
 const [busy,setBusy]=useState(false);const [title,setTitle]=useState('');const [status,setStatus]=useState('');
 async function search(){if(!image)return;setBusy(true);setStatus('Яндекс ищет похожие товары…');setTitle('');try{
  const bitmap=await createImageBitmap(image);let data='';try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',0.65).split(',')[1];}finally{bitmap.close();}
  const response=await fetch('/api/ai/recognize-product',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:data,mimeType:'image/jpeg'})});
  const result=await response.json() as {title?:string;error?:string};if(!response.ok)throw new Error(result.error||'Ошибка поиска');
  if(result.title){setTitle(result.title);setStatus('Найден похожий товар. Проверьте название.');}else setStatus('Совпадений не найдено.');
 }catch(e){setStatus(e instanceof Error?e.message:'Ошибка поиска');}finally{setBusy(false);}}
 return <div className="photo-recognition"><button type="button" className="btn btn-secondary" disabled={!image||busy} onClick={()=>void search()}>{busy?'Ищем…':'Найти товар по фото через Яндекс'}</button>{status&&<small role="status">{status}</small>}{title&&<div><strong>{title}</strong><button type="button" className="btn btn-secondary" onClick={()=>onApply(title,'')}>Использовать название</button></div>}</div>;
}
