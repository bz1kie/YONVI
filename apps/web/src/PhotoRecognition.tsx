import React, {useState} from 'react';

type Props={image?:string; onApply:(data:{title?:string;description?:string})=>void};
type Result={barcode?:string;text:string;title?:string};
const clean=(s:string)=>s.replace(/[^\p{L}\p{N} ._+\/-]/gu,' ').replace(/\s+/g,' ').trim();
function validGTIN(s:string){if(!/^(\d{8}|\d{12,14})$/.test(s))return false;let sum=0;for(let i=s.length-2,k=0;i>=0;i--,k++)sum+=Number(s[i])*(k%2===0?3:1);return (10-sum%10)%10===Number(s[s.length-1]);}
function suggest(text:string,barcode?:string):Result{
 const lines=text.split(/\r?\n/).map(clean).filter(x=>x.length>=3&&x.length<=90);
 const likely=lines.find(x=>/[\p{L}]/u.test(x)&&/\d/.test(x)&&!/^(EAN|GTIN|SKU|ART|АРТ|СЕРИЙНЫЙ)/i.test(x))||lines.find(x=>/[\p{L}]/u.test(x)&&x.length>5);
 return {barcode,text,title:likely?.slice(0,90)};
}
export default function PhotoRecognition({image,onApply}:Props){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[result,setResult]=useState<Result|null>(null);
 async function recognize(){
  if(!image||busy)return;setBusy(true);setResult(null);setStatus('Считываем штрихкод…');
  try{
   const blob=await (await fetch(image)).blob();const bmp=await createImageBitmap(blob);let barcode='';
   try{
    const Detector=(window as any).BarcodeDetector;
    if(Detector){const detector=new Detector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','itf']});const codes=await detector.detect(bmp);barcode=codes.find((x:any)=>validGTIN(x.rawValue))?.rawValue||codes[0]?.rawValue||'';}
    if(!barcode){const {BrowserMultiFormatReader}=await import('@zxing/browser');const canvas=document.createElement('canvas');canvas.width=bmp.width;canvas.height=bmp.height;canvas.getContext('2d')?.drawImage(bmp,0,0);try{barcode=(await new BrowserMultiFormatReader().decodeFromCanvas(canvas)).getText();}catch{/* no barcode */}}
   }catch{/* continue to OCR */}
   finally{bmp.close();}
   setStatus('Распознаём надписи на фотографии…');
   const Tesseract=await import('tesseract.js');
   const ocr=await Tesseract.recognize(blob,'rus+eng',{logger:()=>{}});
   const next=suggest(ocr.data.text,barcode||undefined);setResult(next);
   setStatus(barcode||next.title?'Проверьте найденные данные перед заполнением.':'Не удалось определить название. Попробуйте фото этикетки при хорошем освещении.');
  }catch(e){setStatus('Распознавание не удалось. Проверьте соединение при первой загрузке языковых данных и попробуйте ещё раз.');}
  finally{setBusy(false);}
 }
 return <div className="photo-recognition">
  <button type="button" className="btn btn-secondary" disabled={!image||busy} onClick={recognize}>{busy?'Распознаём…':'Считать штрихкод и текст с фото'}</button>
  <small>Бесплатно, без платных API. Обработка в браузере; при первом запуске загружаются библиотеки и языковые данные.</small>
  {status&&<p role="status">{status}</p>}
  {result&&<div className="photo-recognition-result">
   {result.barcode&&<p><b>Штрихкод:</b> {result.barcode} {validGTIN(result.barcode)?'✓ контрольная цифра верна':'(не подтверждён)'}</p>}
   {result.title&&<p><b>Предполагаемое название:</b> {result.title}</p>}
   {result.text&&<details><summary>Распознанный текст</summary><pre>{result.text.slice(0,1800)}</pre></details>}
   {result.title&&<button type="button" className="btn btn-primary" onClick={()=>onApply({title:result.title,description:result.barcode?'Штрихкод: '+result.barcode:undefined})}>Подставить название</button>}
  </div>}
 </div>;
}
