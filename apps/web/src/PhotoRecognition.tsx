import React, {useState} from 'react';

type Props={image?:string;onApply:(data:{title?:string;description?:string})=>void};
type Result={title:string;category:string};
export default function PhotoRecognition({image,onApply}:Props){
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [result,setResult]=useState<Result|null>(null);
 async function recognize(){
  if(!image||busy)return;
  setBusy(true);setResult(null);setStatus('GLM Vision анализирует фотографию…');
  try{
   const blob=await (await fetch(image)).blob();
   const bitmap=await createImageBitmap(blob);
   let base64='';
   try{
    const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);
    base64=canvas.toDataURL('image/jpeg',0.8).split(',')[1];
   }finally{bitmap.close();}
   const response=await fetch('/api/ai/recognize-product',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:base64,mimeType:'image/jpeg'})});
   const data=await response.json().catch(()=>({})) as {title?:string;category?:string;error?:string};
   if(!response.ok)throw new Error(response.status+' · '+(data.error||'Ошибка API'));
   if(!data.title){setStatus('GLM Vision не смог определить предмет. Попробуйте другое фото.');return;}
   setResult({title:data.title,category:data.category||''});
   setStatus('GLM Vision определил название. Проверьте его перед публикацией.');
  }catch(e){setStatus('Ошибка GLM Vision: '+(e instanceof Error?e.message:'Неизвестная ошибка'));}
  finally{setBusy(false);}
 }
 return <div className="photo-recognition">
  <button type="button" className="btn btn-secondary" disabled={!image||busy} onClick={recognize}>{busy?'Распознаём…':'Определить товар через GLM Vision'}</button>
  <small>Визуальное распознавание через GLM Vision API. Требуется авторизация.</small>
  {status&&<p role="status">{status}</p>}
  {result&&<div className="photo-recognition-result">
   <p><b>Название:</b> {result.title}</p>
   <button type="button" className="btn btn-primary" onClick={()=>onApply({title:result.title})}>Подставить название</button>
  </div>}
 </div>;
}
