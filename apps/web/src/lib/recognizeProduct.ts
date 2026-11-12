export type PhotoGuess={title:string;category:string;barcode:string;text:string};
const patterns:[string,RegExp][]=[
 ['transport',/автомобил|мотоцикл|велосипед|самокат|шина|диск колёс|car|bike/i],
 ['auto',/автозапчаст|датчик|форсунк|турбин|аккумулятор автомобиль|стартер|генератор авто|маслян|тормозн/i],
 ['gaming',/playstation|xbox|nintendo|игровая приставка|геймпад|джойстик/i],
 ['fashion',/куртка|платье|кроссовк|рубашка|брюки|одежда|shoes|jacket/i],
 ['home',/диван|стол|стул|холодильник|микроволнов|пылесос|чайник|мебель/i],
 ['electronics',/18650|21700|литий|li.?ion|battery|аккумулятор|батаре|телефон|смартфон|iphone|samsung|ноутбук|laptop|планшет|зарядн|наушник|ssd|ram|электрон|powerbank/i],
 ['hobby',/книга|удочка|рыбалк|коллекц|модель сборн|игрушка|гитара/i],
];
const clean=(s:string)=>s.replace(/[^\p{L}\p{N} ._+\/-]/gu,' ').replace(/\s+/g,' ').trim();
function gtin(s:string){if(!/^(\d{8}|\d{12,14})$/.test(s))return false;let sum=0;for(let i=s.length-2,k=0;i>=0;i--,k++)sum+=Number(s[i])*(k%2===0?3:1);return (10-sum%10)%10===Number(s.at(-1));}
export async function recognizeProduct(file:File):Promise<PhotoGuess>{
 const bmp=await createImageBitmap(file);let barcode='';
 try{
  const detector=(window as any).BarcodeDetector;
  if(detector){try{const codes=await new detector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','itf']}).detect(bmp);barcode=codes.find((c:any)=>gtin(c.rawValue))?.rawValue||codes[0]?.rawValue||'';}catch{}}
  if(!barcode){try{const {BrowserMultiFormatReader}=await import('@zxing/browser');const canvas=document.createElement('canvas');canvas.width=bmp.width;canvas.height=bmp.height;canvas.getContext('2d')?.drawImage(bmp,0,0);barcode=(await new BrowserMultiFormatReader().decodeFromCanvas(canvas)).getText();}catch{}}
 }finally{bmp.close();}
 const Tesseract=await import('tesseract.js');
 const output=await Tesseract.recognize(file,'rus+eng');
 const text=output.data.text;
 const lines=text.split(/\r?\n/).map(clean).filter(x=>x.length>2&&x.length<100);
 const full=lines.join(' ');
 const category=patterns.find(([,re])=>re.test(full))?.[0]||'';
 const cell=full.match(/\b(?:INR|ICR|IMR|NCR)?\s*(?:18650|21700|26650|14500)\b/i);
 let title='';
 if(cell)title='Аккумулятор Li-ion '+cell[0].replace(/\s/g,'').toUpperCase();
 else{
  const useful=lines.filter(x=>{
   if(!/[\p{L}]/u.test(x)||/^\s*(?:made in|warning|caution|серийный|штрихкод|barcode|ean|gtin)/i.test(x))return false;
   if(/\b\d+(?:[.,]\d+)?\s*(?:v|в|volt|вольт|mah|мач|ah|а·ч|wh|w|ватт)\b/i.test(x))return false;
   if(!/[\p{L}]{3,}/u.test(x))return false;
   if(/^\d+[\s.,/-]*[a-z]{1,4}$/i.test(x))return false;
   return true;
  });
  title=(useful.find(x=>/[\p{L}]/u.test(x)&&/\d/.test(x))||useful.find(x=>x.length>=5)||'').slice(0,120);
 }

 return {title,category,barcode,text};
}
