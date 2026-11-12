/** Local zero-shot image recognition; model downloads on first use, no paid API. */
export type VisualGuess={title:string;category:string;score:number};
const labels:{title:string;category:string;en:string}[]=[
 {title:'Цилиндрический аккумулятор',category:'electronics',en:'a cylindrical rechargeable lithium ion battery cell'},
 {title:'Батарейка',category:'electronics',en:'a disposable household battery'},
 {title:'Смартфон',category:'electronics',en:'a smartphone mobile phone'},
 {title:'Ноутбук',category:'electronics',en:'a laptop computer'},
 {title:'Наушники',category:'electronics',en:'headphones or wireless earbuds'},
 {title:'Планшет',category:'electronics',en:'a tablet computer'},
 {title:'Зарядное устройство',category:'electronics',en:'an electronic battery charger'},
 {title:'Плата электроники',category:'electronics',en:'an electronic circuit board'},
 {title:'Шуруповёрт',category:'home',en:'a cordless power drill screwdriver'},
 {title:'Пылесос',category:'home',en:'a vacuum cleaner'},
 {title:'Стул',category:'home',en:'a chair'},
 {title:'Диван',category:'home',en:'a sofa couch'},
 {title:'Настольная лампа',category:'home',en:'a desk lamp'},
 {title:'Кроссовки',category:'fashion',en:'a pair of sneakers shoes'},
 {title:'Куртка',category:'fashion',en:'a jacket clothing'},
 {title:'Сумка',category:'fashion',en:'a handbag'},
 {title:'Велосипед',category:'transport',en:'a bicycle'},
 {title:'Самокат',category:'transport',en:'a kick scooter'},
 {title:'Автомобильная фара',category:'auto',en:'a car headlight'},
 {title:'Автомобильное колесо',category:'auto',en:'a car wheel tire'},
 {title:'Игровая приставка',category:'gaming',en:'a video game console'},
 {title:'Геймпад',category:'gaming',en:'a video game controller'},
 {title:'Книга',category:'hobby',en:'a book'},
 {title:'Гитара',category:'hobby',en:'an acoustic guitar'},
 {title:'Игрушка',category:'hobby',en:'a toy'},
];
let classifierPromise:Promise<any>|null=null;
export async function recognizeVisual(file:File):Promise<VisualGuess|null>{
 const {pipeline,RawImage}=await import('@huggingface/transformers');
 classifierPromise??=pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{device:'wasm',dtype:'q8'}).catch((e:unknown)=>{classifierPromise=null;throw e;});
 const classifier=await classifierPromise;
 const url=URL.createObjectURL(file);
 try{
  const img=await RawImage.fromURL(url);
  const predictions=await classifier(img,labels.map(x=>x.en),{hypothesis_template:'This is a photo of {}.'}) as Array<{label:string;score:number}>;
  const best=predictions[0];const item=labels.find(x=>x.en===best?.label);
  if(!item||best.score<0.19)return null;
  return {title:item.title,category:item.category,score:best.score};
 }finally{URL.revokeObjectURL(url);}
}
