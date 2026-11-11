import ListingDetails from './ListingDetails';
import Conversations from './Conversations';
import React from 'react';
import { fetchPublicListings, fetchPublicCircles, fetchMyFavorites, setFavorite, type ServerListing, type ServerCircle } from './lib/api';
import ServerWorkspace from './ServerWorkspace';
import MaxAuthBadge from './MaxAuthBadge';
/* LAVOSE Marketplace Prototype 1.4. React + TypeScript, self-contained offline demonstration. */

type Page = 'home' | 'catalog' | 'circles' | 'favorites' | 'my' | 'moderation' | 'kit' | 'server' | 'account' | 'messages' | 'cart';
type Condition = 'new' | 'excellent' | 'good' | 'used';
type Status = 'active' | 'reserved' | 'sold' | 'archived';
type ModerationStatus = 'approved' | 'pending' | 'rejected';
type DealType = 'sell' | 'swap' | 'free';
interface Listing {
  id: string; title: string; price: number; category: string; city: string;
  condition: Condition; status: Status; deal: DealType; description: string;
  emoji: string; art: string; seller: string; mine: boolean; createdAt: number;
  sellerContact?:string; remote?:boolean; views: number; placements: {[key:string]: ModerationStatus}; image?: string;
}
interface Circle { id: string; name: string; summary: string; emoji: string; members: string; gradient: string; isJoined: boolean; }
interface Draft { title: string; price: string; category: string; city: string; condition: Condition; deal: DealType; description: string; emoji: string; art: string; image?: string; circles: string[]; }
interface Filters {category: string; city: string; minPrice: string; maxPrice: string; condition: string; deal: string; sort: string; circle: string;}
interface State {
  catalogTab: 'all'|'nearby'|'circles'|'subscriptions';
  loginOpen:boolean; locating:boolean; cart:string[]; createRequest: number; theme: 'light' | 'dark'; page: Page; listings: Listing[]; circles: Circle[]; favorites: string[];
  query: string; filters: Filters; filterOpen: boolean; selectedListing: string | null;
  activeCircle: string | null; createOpen: boolean; editId: string | null;
  step: number; draft: Draft; modCircle: string; modTab: 'pending' | 'approved' | 'all';
  toast: string; helpOpen: boolean; copiedLink: boolean; apiStatus: 'checking' | 'live' | 'demo' | 'error'; serverCount: number; gallery: string[]; galleryIndex: number; serverCircles: ServerCircle[]; selectedCommunityId: string | null; favoriteListings: Listing[]; favoritesAuthenticated: boolean;
}
const CAT = [
  {id:'all',name:'Все категории',emoji:'▦',bg:'violet'},
  {id:'electronics',name:'Электроника',emoji:'🎧',bg:'blue'},
  {id:'gaming',name:'Игры',emoji:'🎮',bg:'lavender'},
  {id:'fashion',name:'Одежда',emoji:'👟',bg:'pink'},
  {id:'home',name:'Для дома',emoji:'🛋️',bg:'peach'},
  {id:'transport',name:'Транспорт',emoji:'🚲',bg:'mint'},
  {id:'hobby',name:'Хобби',emoji:'🎸',bg:'amber'},
  {id:'auto',name:'Авто',emoji:'🚘',bg:'sky'},
];
const CIRCLES_BASE: Circle[] = [
 {id:'city',name:'Воронеж рядом',summary:'Городские находки и обмен',emoji:'📍',members:'12,4 тыс.',gradient:'city',isJoined:true},
 {id:'tech',name:'Техно-круг',summary:'Гаджеты, комплектующие, ПК',emoji:'💻',members:'8,2 тыс.',gradient:'tech',isJoined:true},
 {id:'gaming',name:'Игровой круг',summary:'Приставки, игры и периферия',emoji:'🎮',members:'4,8 тыс.',gradient:'gaming',isJoined:true},
 {id:'style',name:'Стиль и винтаж',summary:'Кроссовки, одежда и находки',emoji:'👟',members:'3,1 тыс.',gradient:'style',isJoined:false},
 {id:'campus',name:'Студенческий круг',summary:'Обмен вещами и всё для учёбы',emoji:'🎓',members:'2,9 тыс.',gradient:'campus',isJoined:false}
];
const now = Date.now();
const SEED: Listing[] = [
 {id:'l1',title:'iPhone 13 · 128 ГБ',price:18900,category:'electronics',city:'Воронеж',condition:'excellent',status:'active',deal:'sell',description:'Полностью исправен, аккумулятор 87%, Face ID работает. В комплекте коробка и кабель. Можно проверить при встрече.',emoji:'📱',art:'art-blue',seller:'Илья М.',mine:false,views:284,createdAt:now-3600000,placements:{global:'approved',city:'approved',tech:'approved'}},
 {id:'l2',title:'PlayStation 5 Slim',price:32900,category:'gaming',city:'Воронеж',condition:'excellent',status:'active',deal:'sell',description:'Приставка в отличном состоянии, не вскрывалась. Два геймпада, коробка. Возможна проверка.',emoji:'🎮',art:'art-lavender',seller:'Артём С.',mine:false,views:412,createdAt:now-7800000,placements:{global:'approved',city:'approved',gaming:'approved'}},
 {id:'l3',title:'Nike Dunk Low, 42',price:4900,category:'fashion',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'Носил аккуратно, чистые, оригинальная коробка есть. Размер EU 42.',emoji:'👟',art:'art-pink',seller:'Аня К.',mine:false,views:151,createdAt:now-8500000,placements:{global:'approved',city:'approved',style:'approved'}},
 {id:'l4',title:'RTX 3060 Ti · 8 ГБ',price:19900,category:'electronics',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'Не после майнинга. Работает тихо, температуры в норме. Покажу тест в FurMark.',emoji:'🖥️',art:'art-purple',seller:'Дмитрий П.',mine:false,views:380,createdAt:now-14500000,placements:{global:'approved',tech:'approved',city:'approved'}},
 {id:'l5',title:'Sony WH-1000XM4',price:9900,category:'electronics',city:'Москва',condition:'excellent',status:'active',deal:'sell',description:'Наушники, полный комплект, новый чехол. Аккумулятор держит хорошо.',emoji:'🎧',art:'art-mint',seller:'Лиза В.',mine:false,views:197,createdAt:now-19900000,placements:{global:'approved',tech:'approved'}},
 {id:'l6',title:'Nintendo Switch OLED',price:15900,category:'gaming',city:'Воронеж',condition:'excellent',status:'active',deal:'sell',description:'Консоль как новая, плёнка на экране, чехол и карта памяти 128 ГБ.',emoji:'🕹️',art:'art-rose',seller:'Макс Н.',mine:false,views:236,createdAt:now-28000000,placements:{global:'approved',city:'approved',gaming:'approved'}},
 {id:'l7',title:'Кресло для комнаты',price:3500,category:'home',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'Удобное мягкое кресло. Самовывоз, помогу вынести.',emoji:'🪑',art:'art-peach',seller:'Полина Б.',mine:false,views:96,createdAt:now-32000000,placements:{global:'approved',city:'approved'}},
 {id:'l8',title:'Велосипед BMX',price:11900,category:'transport',city:'Липецк',condition:'good',status:'active',deal:'swap',description:'Хорошее состояние, новые покрышки. Интересен обмен на игровой монитор.',emoji:'🚲',art:'art-teal',seller:'Егор А.',mine:false,views:173,createdAt:now-34000000,placements:{global:'approved'}},
 {id:'l9',title:'MacBook Air M1 · 8/256',price:42900,category:'electronics',city:'Воронеж',condition:'excellent',status:'active',deal:'sell',description:'Идеальный для учёбы и работы, циклов батареи 172, полный комплект.',emoji:'💻',art:'art-gray',seller:'Вы',mine:true,views:311,createdAt:now-43500000,placements:{global:'approved',city:'approved',tech:'approved'}},
 {id:'l10',title:'Плёночный фотоаппарат',price:6200,category:'hobby',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'Рабочая плёночная камера с чехлом, объектив чистый.',emoji:'📷',art:'art-sand',seller:'Соня Р.',mine:false,views:82,createdAt:now-45500000,placements:{global:'approved',city:'approved'}},
 {id:'l11',title:'Гитара Yamaha F310',price:6500,category:'hobby',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'Струны новые, комплект с чехлом и медиаторами.',emoji:'🎸',art:'art-amber',seller:'Игорь Д.',mine:false,views:142,createdAt:now-54500000,placements:{global:'approved',city:'approved'}},
 {id:'l12',title:'Рюкзак The North Face',price:2800,category:'fashion',city:'Москва',condition:'excellent',status:'active',deal:'sell',description:'Вместительный городской рюкзак, без дефектов.',emoji:'🎒',art:'art-ice',seller:'Даша К.',mine:false,views:217,createdAt:now-57500000,placements:{global:'approved',style:'approved'}},
 {id:'l13',title:'Колонки Edifier R1280',price:6900,category:'electronics',city:'Воронеж',condition:'excellent',status:'active',deal:'sell',description:'Отличный звук, пульт, кабели в комплекте.',emoji:'🔊',art:'art-violet',seller:'Вы',mine:true,views:72,createdAt:now-61500000,placements:{global:'approved',city:'approved',tech:'pending'}},
 {id:'l14',title:'Игровой монитор 144 Гц',price:11500,category:'electronics',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'IPS 24 дюйма. Без битых пикселей, есть HDMI и DisplayPort.',emoji:'🖥️',art:'art-sky',seller:'Кирилл Т.',mine:false,views:38,createdAt:now-65500000,placements:{global:'approved',tech:'pending'}},
 {id:'l15',title:'Винтажная куртка',price:3900,category:'fashion',city:'Воронеж',condition:'excellent',status:'active',deal:'sell',description:'Винтажная куртка оверсайз, очень приятный материал.',emoji:'🧥',art:'art-rose',seller:'Юля О.',mine:false,views:28,createdAt:now-66500000,placements:{global:'approved',style:'pending'}},
 {id:'l16',title:'Геймпад Xbox Series',price:3500,category:'gaming',city:'Воронеж',condition:'good',status:'active',deal:'sell',description:'Стики без дрифта, кнопки исправны, чистый.',emoji:'🎮',art:'art-lime',seller:'Олег Е.',mine:false,views:44,createdAt:now-70500000,placements:{global:'approved',gaming:'pending'}}
];
// Local photographic demo assets cropped from the approved LAVOSE visual reference.
// These are conceptual illustrations, NOT actual photographs submitted by sellers.
const PHOTO_ASSETS: {[id:string]:string} = {
 'l1':'assets/products/phone.webp',
 'l4':'assets/products/gpu.webp',
 'l5':'assets/products/headphones.webp',
 'l8':'assets/products/bicycle.webp',
 'l14':'assets/products/gpu.webp',
};
const demoPhoto=(l:Listing):string|undefined => l.image || PHOTO_ASSETS[l.id];
const DEFAULT_FILTERS: Filters = {category:'all',city:'all',minPrice:'',maxPrice:'',condition:'all',deal:'all',sort:'new',circle:'global'};
const EMPTY_DRAFT = (): Draft => ({title:'',price:'',category:'electronics',city:'Воронеж',condition:'good',deal:'sell',description:'',emoji:'📦',art:'art-lime',circles:['global','city']});
const fmt = (n:number) => new Intl.NumberFormat('ru-RU').format(n);
const money = (n:number) => fmt(n)+' ₽';
const categoryName = (id:string) => (CAT.find(c=>c.id===id)||CAT[0]).name;
const conditionName = (id:Condition) => ({new:'Новое',excellent:'Отличное',good:'Хорошее',used:'Есть следы использования'}[id]);
const dealName = (id:DealType) => ({sell:'Продажа',swap:'Обмен',free:'Отдам'}[id]);
const relativeDate = (ms:number) => {const h=Math.floor((Date.now()-ms)/3600000); return h<1?'Только что':h<24?`${h} ч. назад`:`${Math.floor(h/24)} дн. назад`;};
const safeGet = (key:string):any => {try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const STORE_KEY = 'yorvi_prototype_1_4';
const icons: {[key:string]: string} = {
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 cart:'<path d="M2 3h3l3 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.9-7.6 1-1a5.5 5.5 0 0 0-.1-7.8z"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.5a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
 bag:'<path d="M4 8h16l-1 13H5L4 8zM9 9V6a3 3 0 0 1 6 0v3"/>',
 map:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
 filter:'<path d="M4 7h16M7 12h10M10 17h4"/><circle cx="8" cy="7" r="2" fill="currentColor"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M20 16.8A9 9 0 0 1 7.2 4 9 9 0 1 0 20 16.8z"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 left:'<path d="M19 12H5m6-6-6 6 6 6"/>',
 close:'<path d="M5 5 19 19M19 5 5 19"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 sort:'<path d="M5 4v16m-3-3 3 3 3-3M19 20V4m-3 3 3-3 3 3"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M5 16v5h14v-5"/>',
 photo:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
 external:'<path d="M13 4h7v7m0-7-9 9"/><path d="M20 14v6H4V4h6"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
 refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M5.4 9a7 7 0 0 1 12-2L20 11M4 13l2.6 4A7 7 0 0 0 19 15"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
 edit:'<path d="M12 20h9M16 4l4 4-12 12H4v-4z"/>',
 eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
 trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
 star:'<path d="m12 2 3.1 6.3 7 .9-5.1 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5.1-5 7-.9z"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-2-2-3-3 1a7 7 0 0 0-2-.9L13 3h-3l-.9 3a7 7 0 0 0-2 .9l-3-1-2 3 2 2A7 7 0 0 0 4 12a7 7 0 0 0 .1 1l-2 2 2 3 3-1a7 7 0 0 0 2 .9L10 21h3l.9-3a7 7 0 0 0 2-.9l3 1 2-3-2-2A7 7 0 0 0 19 12z"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 sparkle:'<path d="m12 2 2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
 reset:'<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7"/>',
 message:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a8.5 8.5 0 1 1 16.1-4z"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
const Icon = ({name,size=20,filled=false}: {name:string,size?:number,filled?:boolean}) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:icons[name]||icons.info}}/>;
const Brand = ({compact=false}:{compact?:boolean}) => <span className={'brand'+(compact?' brand-small':'')}><span className="brand-mark">L</span><span className="brand-word">lavose<span>.</span></span></span>;
const navigation:{id:Page,name:string,icon:string}[] = [
 {id:'home',name:'Главная',icon:'home'},{id:'catalog',name:'Каталог',icon:'search'},
 {id:'circles',name:'Мои круги',icon:'users'},{id:'favorites',name:'Избранное',icon:'heart'},
 {id:'my',name:'Мои объявления',icon:'bag'},{id:'moderation',name:'Модерация',icon:'shield'},
 {id:'kit',name:'UI Kit',icon:'sparkle'},{id:'server',name:'Личный кабинет',icon:'user'}
];
const initState = ():State => {
 const saved=safeGet(STORE_KEY);
 return {
  catalogTab:'all',createRequest:0,theme: saved&&saved.theme==='dark'?'dark':'light',page:'catalog',
  listings: import.meta.env.DEV?(saved&&Array.isArray(saved.listings)?saved.listings:SEED):[],
  circles:saved&&Array.isArray(saved.circles)?saved.circles:CIRCLES_BASE,
  favorites:import.meta.env.DEV&&saved&&Array.isArray(saved.favorites)?saved.favorites:[],
  query:'',filters:{...DEFAULT_FILTERS},filterOpen:false,selectedListing:null,activeCircle:null,
  createOpen:false,editId:null,step:1,draft:EMPTY_DRAFT(),modCircle:'tech',modTab:'pending',
  loginOpen:false,locating:false,cart:(()=>{const v=safeGet('lavose-cart-v1');return Array.isArray(v)?v.filter((id:unknown)=>typeof id==='string').slice(0,100):[];})(),toast:'',helpOpen:false,copiedLink:false,apiStatus:'checking',serverCount:0,gallery:[],galleryIndex:0,serverCircles:[],selectedCommunityId:null,favoriteListings:[],favoritesAuthenticated:false
 };
};
class App extends React.Component<{},State> {
 constructor(props:{}){super(props);this.state=initState();}
 componentDidUpdate(_prevProps:{},prev:State){
  if(prev.cart!==this.state.cart){try{localStorage.setItem('lavose-cart-v1',JSON.stringify(this.state.cart));}catch{}}
  if(prev.theme!==this.state.theme||prev.listings!==this.state.listings||prev.favorites!==this.state.favorites||prev.circles!==this.state.circles){
   try{localStorage.setItem(STORE_KEY,JSON.stringify({theme:this.state.theme,listings:import.meta.env.DEV?this.state.listings:[],favorites:import.meta.env.DEV?this.state.favorites:[],circles:import.meta.env.DEV?this.state.circles:[]}));}catch(e){console.warn('Не удалось сохранить изменения в браузере',e);}
  }
  document.documentElement.setAttribute('data-theme',this.state.theme);
 }
 toListing=(l:ServerListing):Listing=>({
  id:l.id,title:l.title,description:l.description||'',price:Number(l.price_kopecks)/100,
  category:l.category,city:l.city,condition:'good',status:'active',deal:'sell',emoji:'📦',art:'art-blue',
  seller:l.seller_name||'Продавец',sellerContact:l.seller_contact_url||undefined,remote:true,mine:false,views:0,
  createdAt:new Date(l.created_at).getTime()||Date.now(),placements:{global:'approved'},image:l.photo_url||undefined
 });
 initialLinkOpened=false;
 refreshCatalog=()=>{
  const circle=this.state.selectedCommunityId||undefined;
  fetchPublicListings({communityId:circle}).then(({items})=>{
    const demo=import.meta.env.DEV&&!circle&&items.length===0;
    const remote=demo?this.state.listings:items.map(this.toListing);
    this.setState(state=>({
      listings:remote,apiStatus:demo?'demo':'live',serverCount:items.length,
      selectedListing:state.selectedListing&&remote.some(l=>l.id===state.selectedListing)?state.selectedListing:null
    }),()=>{
      if(!this.initialLinkOpened){
        this.initialLinkOpened=true;
        const id=new URLSearchParams(window.location.search).get('listing');
        if(id&&/^[0-9a-f-]{36}$/i.test(id)){this.setState({page:'catalog'});this.openListing(id);}
      }
    });
  }).catch(()=>this.setState({
    listings:import.meta.env.DEV?this.state.listings:[],apiStatus:import.meta.env.DEV?'demo':'error',serverCount:0
  }));
 };
 refreshFavorites=async()=>{
  try{
    const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){
      if(import.meta.env.DEV){this.setState({favoritesAuthenticated:false});}else{this.setState({favoritesAuthenticated:false,favorites:[],favoriteListings:[]});}
      return;
    }
    this.setState({favoritesAuthenticated:true});
    const {items}=await fetchMyFavorites().catch(()=>({items:[]}));
    this.setState({favoritesAuthenticated:true,favorites:items.map(x=>x.id),favoriteListings:items.map(this.toListing)});
  }catch{
    if(import.meta.env.DEV){this.setState({favoritesAuthenticated:false});}else{this.setState({favoritesAuthenticated:false,favorites:[],favoriteListings:[]});}
  }
 };
 loadCircles=()=>{
   fetchPublicCircles().then(result=>this.setState({serverCircles:result.items})).catch(()=>{});
 };
 selectServerCircle=(id:string|null)=>{
   this.setState({selectedCommunityId:id,page:'catalog',activeCircle:null},this.refreshCatalog);
 };
 componentDidMount(){
  document.addEventListener('keydown',this.onKeyDown);
  window.addEventListener('yorvi:catalog-change',this.refreshCatalog);
  window.addEventListener('yorvi:auth-change',this.refreshFavorites);
  document.documentElement.setAttribute('data-theme',this.state.theme);
  const id=new URLSearchParams(window.location.search).get('listing');
  if(id&&this.state.listings.some(l=>l.id===id))this.setState({selectedListing:id,page:'catalog'});
  this.refreshCatalog();this.refreshFavorites();this.loadCircles();
 }
 componentWillUnmount(){
  document.removeEventListener('keydown',this.onKeyDown);
  window.removeEventListener('yorvi:catalog-change',this.refreshCatalog);
  window.removeEventListener('yorvi:auth-change',this.refreshFavorites);
 }
 onKeyDown=(e:KeyboardEvent)=>{if(e.key==='Escape'&&(this.state.selectedListing||this.state.createOpen||this.state.helpOpen||this.state.loginOpen)){this.setState({selectedListing:null,createOpen:false,helpOpen:false,loginOpen:false});}};
 say(message:string){this.setState({toast:message});window.setTimeout(()=>{if(this.state.toast===message)this.setState({toast:''});},3200);}
 go(page:Page){if(['favorites','cart','account','server','my','moderation','messages'].includes(page)&&!this.state.favoritesAuthenticated){this.setState({loginOpen:true});return;}const target=!import.meta.env.DEV&&(page==='my'||page==='moderation')?'server':page;this.setState({page:target,selectedListing:null,activeCircle:null,createOpen:false,filterOpen:false});window.scrollTo(0,0);}
 closeDetails=()=>this.setState({selectedListing:null});
 openListing(id:string){this.setState({selectedListing:id,activeCircle:null,createOpen:false});}
 async favorite(id:string){
  if(import.meta.env.DEV && !this.state.favoritesAuthenticated && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)){
    this.setState(s=>({favorites:s.favorites.includes(id)?s.favorites.filter(x=>x!==id):[...s.favorites,id]}));
    return;
  }
  if(!this.state.favoritesAuthenticated){this.setState({loginOpen:true});return;}
  const desired=!this.state.favorites.includes(id);
  try{
    await setFavorite(id,desired);
    await this.refreshFavorites();
    this.say(desired?'Добавлено в избранное':'Удалено из избранного');
  }catch{this.say('Не удалось изменить избранное. Попробуйте снова.');}
}
 switchTheme(){this.setState(s=>({theme:s.theme==='light'?'dark':'light'}));}
 openCreate(editId:string|null=null){
  if(!this.state.favoritesAuthenticated&&!import.meta.env.DEV){this.setState({loginOpen:true});return;}
  if(!import.meta.env.DEV){this.setState(s=>({page:'server',createRequest:s.createRequest+1}));window.scrollTo({top:0});return;}
  const found=this.state.listings.find(x=>x.id===editId);
  const draft:Draft=found?{title:found.title,price:String(found.price),category:found.category,city:found.city,condition:found.condition,deal:found.deal,description:found.description,emoji:found.emoji,art:found.art,image:found.image,circles:Object.keys(found.placements)}:EMPTY_DRAFT();
  this.setState({createOpen:true,editId,step:1,draft,selectedListing:null,activeCircle:null});
 }
 updateDraft(patch:Partial<Draft>){this.setState(s=>({draft:{...s.draft,...patch}}));}
 validateStep(step:number):boolean{
  const d=this.state.draft;
  if(step===1&&d.title.trim().length<5){this.say('Напиши название от 5 символов');return false;}
  if(step===1&&d.deal==='sell'&&(!Number(d.price)||Number(d.price)<1)){this.say('Укажи цену товара');return false;}
  if(step===2&&!d.description.trim()){this.say('Добавь короткое описание');return false;}
  if(step===3&&d.circles.length===0){this.say('Выбери хотя бы одну витрину');return false;}
  return true;
 }
 nextStep(){if(!this.validateStep(this.state.step))return;this.setState(s=>({step:Math.min(3,s.step+1)}));}
 saveListing(){
  if(!this.validateStep(1)||!this.validateStep(2)||!this.validateStep(3))return;
  const {draft:d,editId}=this.state;
  const p=Math.max(0,Number(d.price)||0);
  if(!editId && this.state.listings.some(l=>l.mine&&l.status==='active'&&l.title.trim().toLowerCase()===d.title.trim().toLowerCase()&&l.price===(d.deal==='free'?0:p))){
   this.say('Такое объявление уже есть — отредактируй существующее вместо создания дубля');
   return;
  }
  if(editId){
   this.setState(s=>({listings:s.listings.map(l=>l.id!==editId?l:{...l,title:d.title.trim(),price:d.deal==='free'?0:p,category:d.category,city:d.city,description:d.description.trim(),condition:d.condition,deal:d.deal,emoji:d.emoji,art:d.art,image:d.image,placements:Object.fromEntries(d.circles.map(id=>[id,id==='global'?'approved':l.placements[id]||'pending'])) as {[key:string]:ModerationStatus}}),createOpen:false,page:'my'}));
   this.say('Объявление обновлено');
  } else {
   const newListing:Listing={id:'mine-'+Date.now().toString(36),title:d.title.trim(),price:d.deal==='free'?0:p,category:d.category,city:d.city,condition:d.condition,deal:d.deal,description:d.description.trim(),emoji:d.emoji,art:d.art,image:d.image,seller:'Вы',mine:true,views:0,createdAt:Date.now(),status:'active',placements:Object.fromEntries(d.circles.map(id=>[id,id==='global'?'approved':'pending'])) as {[key:string]:ModerationStatus}};
   this.setState(s=>({listings:[newListing,...s.listings],createOpen:false,page:'my'}));
   this.say('Объявление создано! В некоторых кругах оно ожидает модерации');
  }
 }
 markStatus(id:string,status:Status){this.setState(s=>({listings:s.listings.map(l=>l.id===id?{...l,status}:l)}));this.say(status==='sold'?'Отмечено проданным во всех кругах':status==='active'?'Объявление снова активно':'Статус обновлён');}
 moderate(id:string,circle:string,result:ModerationStatus){
  this.setState(s=>({listings:s.listings.map(l=>l.id===id?{...l,placements:{...l.placements,[circle]:result}}:l)}));
  this.say(result==='approved'?'Размещение одобрено':result==='rejected'?'Размещение отклонено':'Отправлено на повторную проверку');
 }
 resetDemo(){if(!import.meta.env.DEV)return;if(!window.confirm('Сбросить все изменения, объявления и избранное?'))return;localStorage.removeItem(STORE_KEY);this.setState(initState());this.say('Демонстрационные данные восстановлены');}
 filterItems(items:Listing[]){const {query,filters:f}=this.state;return items.filter(l=>{
  if(l.status!=='active')return false;
  if(f.circle!=='all'&&l.placements[f.circle]!=='approved')return false;
  if(f.category!=='all'&&l.category!==f.category)return false;
  if(f.city!=='all'&&l.city!==f.city)return false;
  if(f.condition!=='all'&&l.condition!==f.condition)return false;
  if(f.deal!=='all'&&l.deal!==f.deal)return false;
  if(f.minPrice&&l.price<Number(f.minPrice))return false;
  if(f.maxPrice&&l.price>Number(f.maxPrice))return false;
  if(query&&!(l.title+' '+l.description+' '+l.city).toLowerCase().includes(query.toLowerCase()))return false;
  return true;
 }).sort((a,b)=>f.sort==='cheap'?a.price-b.price:f.sort==='expensive'?b.price-a.price:f.sort==='popular'?b.views-a.views:b.createdAt-a.createdAt);}
 shareItem(id:string){const url=location.origin+location.pathname+'?listing='+encodeURIComponent(id);this.copy(url);}
 copy(value:string){if(navigator.clipboard&&location.protocol!=='file:'){navigator.clipboard.writeText(value).then(()=>this.say('Ссылка скопирована')).catch(()=>this.say('Не удалось скопировать ссылку'));}else this.say('Для копирования ссылки открой проект через localhost');}
 handleFile(e:any){const file=e.target&&e.target.files&&e.target.files[0];if(!file)return;
  if(!file.type.startsWith('image/')){this.say('Выбери изображение');return;}
  if(file.size>3*1024*1024){this.say('Файл слишком большой — максимум 3 МБ');return;}
  const reader=new FileReader();reader.onload=()=>this.updateDraft({image:String(reader.result)});reader.readAsDataURL(file);
 }
 setFilter(patch:Partial<Filters>){this.setState(s=>({filters:{...s.filters,...patch},page:s.page==='home'?'catalog':s.page}));}
 renderCard(l:Listing){const liked=this.state.favorites.includes(l.id);return <article key={l.id} className="product-card" onClick={()=>this.openListing(l.id)} tabIndex={0} role="button" onKeyDown={(e:any)=>{if(e.key==='Enter'&&e.target===e.currentTarget)this.openListing(l.id);}} aria-label={'Открыть '+l.title}>
   <div className={'product-art '+l.art}>{demoPhoto(l)?<img src={demoPhoto(l)} alt={'Иллюстрация: '+l.title} loading="lazy"/>:<span className="product-emoji" aria-hidden="true">{l.emoji}</span>}
    {l.deal==='swap'?<span className="art-label">Обмен</span>:l.deal==='free'?<span className="art-label">Бесплатно</span>:l.id==='l1'?<span className="art-label">Хит находок</span>:null}
    <button className={'heart-btn '+(liked?'liked':'')} onClick={(e:any)=>{e.stopPropagation();this.favorite(l.id);}} aria-label={liked?'Убрать из избранного':'В избранное'}><Icon name="heart" size={18} filled={liked}/></button>
   </div><div className="product-info"><button className="cart-toggle" aria-label={this.state.cart.includes(l.id)?'Убрать из корзины':'Добавить в корзину'} onClick={e=>{e.stopPropagation();if(!this.state.favoritesAuthenticated){this.setState({loginOpen:true});return;}this.setState(v=>({cart:v.cart.includes(l.id)?v.cart.filter(id=>id!==l.id):[...v.cart,l.id]}));}}><Icon name="cart" size={17}/>{this.state.cart.includes(l.id)?'В корзине':'В корзину'}</button><div className="product-price">{l.deal==='free'?'Бесплатно':money(l.price)}</div><h3>{l.title}</h3><div className="product-meta"><span><Icon name="map" size={13}/>{l.city}</span><span>{relativeDate(l.createdAt)}</span></div></div>
  </article>;
 }
 renderCards(items:Listing[],message='Ничего не нашлось'){return items.length?<div className={this.state.page==='favorites'?'product-grid favorites-list':'product-grid'}>{items.map(l=>this.renderCard(l))}</div>:<div className="empty-state"><img className="empty-yori" src="assets/yori-face.webp" alt="Лаврик ищет находки"/><h3>{message}</h3><p>Попробуй изменить фильтры или загляни в другие круги.</p><button className="btn btn-secondary" onClick={()=>{this.setState({filters:{...DEFAULT_FILTERS},query:''});}}>Сбросить фильтры</button></div>;}
 showMessages=()=>{if(!this.state.favoritesAuthenticated){this.setState({loginOpen:true,selectedListing:null});return;}this.setState({page:'messages',selectedListing:null});};
 closeMessages=()=>this.go('catalog');
 renderSidebar(){return <aside className="sidebar"><button className="brand-btn" onClick={()=>this.go('catalog')} aria-label="Лавось — главная"><span className="lavose-brand-mark">Л</span><span className="lavose-brand-type"><b>Лавось</b><small>L A V O S E</small></span></button><nav className="side-nav" aria-label="Разделы сайта"><button className="nav-item active" onClick={()=>{this.setState({page:'catalog',query:'',filters:{...DEFAULT_FILTERS}});window.scrollTo(0,0)}}><Icon name="home"/><span>Главная</span></button><button className="nav-item" onClick={()=>document.getElementById('lavose-categories')?.scrollIntoView({behavior:'smooth'})}><Icon name="grid"/><span>Категории</span></button><button className="nav-item" onClick={()=>this.go('circles')}><Icon name="users"/><span>Круги</span></button><button className="nav-item" onClick={()=>document.getElementById('lavose-about')?.scrollIntoView({behavior:'smooth'})}><Icon name="info"/><span>Как работает</span></button></nav><div className="sidebar-bottom"><div className="header-location"><Icon name="map" size={19}/><select aria-label="Город поиска" value={this.state.filters.city} onChange={e=>this.setFilter({city:e.target.value})}><option value="all">Все города</option>{Array.from(new Set(['Воронеж','Москва','Липецк','Санкт-Петербург','Краснодар',...this.state.listings.map(l=>l.city)])).map(c=><option key={c} value={c}>{c}</option>)}</select><button disabled={this.state.locating} onClick={()=>this.locate()} aria-label="Определить город"><Icon name="map" size={16}/></button></div><button className="lavose-signin" onClick={()=>this.state.favoritesAuthenticated?this.go('account'):this.setState({loginOpen:true})}><Icon name="user" size={19}/>{this.state.favoritesAuthenticated?'Профиль':'Войти'}</button><button className="desktop-post" onClick={()=>this.openCreate()}><Icon name="plus" size={20}/>Разместить объявление</button></div></aside>;}
 renderHeader(){return <header className="topbar"><button className="mobile-logo" onClick={()=>this.go('catalog')}><Brand compact/></button><div className="top-search"><Icon name="search" size={18}/><input aria-label="Поиск объявлений" placeholder="Найти в Лавось" value={this.state.query} onChange={e=>this.setState({query:e.target.value,page:'catalog'})}/><button className="search-filter-toggle" aria-label="Фильтры" onClick={()=>this.setState(v=>({filterOpen:!v.filterOpen}))}><Icon name="filter"/></button></div><button className="header-shortcut" onClick={()=>this.go('favorites')} aria-label="Избранное"><Icon name="heart" size={20}/></button><button className="header-shortcut" onClick={()=>this.go('cart')} aria-label="Корзина"><Icon name="cart" size={20}/></button><button className="mobile-login" onClick={()=>this.state.favoritesAuthenticated?this.go('account'):this.setState({loginOpen:true})}>Войти</button></header>;}
 locate(){if(!navigator.geolocation){this.say('Геолокация недоступна. Выберите город вручную.');return;}this.setState({locating:true});navigator.geolocation.getCurrentPosition(pos=>{const cities:[string,number,number][]=[['Воронеж',51.67,39.20],['Москва',55.75,37.62],['Липецк',52.61,39.60],['Санкт-Петербург',59.93,30.34],['Краснодар',45.04,38.98]];const rad=(x:number)=>x*Math.PI/180;const ranked=cities.map(([name,lat,lon])=>({name,km:6371*2*Math.asin(Math.sqrt(Math.sin(rad(lat-pos.coords.latitude)/2)**2+Math.cos(rad(lat))*Math.cos(rad(pos.coords.latitude))*Math.sin(rad(lon-pos.coords.longitude)/2)**2))})).sort((a,b)=>a.km-b.km);this.setState({locating:false});if(ranked[0].km>80){this.say('Рядом нет поддерживаемого города. Выберите город вручную.');return;}this.setFilter({city:ranked[0].name});this.say('Ближайший город: '+ranked[0].name);},()=>{this.setState({locating:false});this.say('Не удалось определить город. Выберите его вручную.');},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});}
 renderLogin(){return <div className="modal-layer login-layer" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)this.setState({loginOpen:false});}}><section role="dialog" aria-modal="true" aria-labelledby="login-title" className="login-panel"><button autoFocus className="icon-button login-close" aria-label="Закрыть вход" onClick={()=>this.setState({loginOpen:false})}><Icon name="close"/></button><h2 id="login-title">Войдите в Лавось</h2><p>Войдите через MAX, чтобы сохранять избранное, общаться с продавцами и управлять объявлениями.</p><a className="btn btn-primary" href="https://max.ru/se14029050_1_bot?startapp=login" target="_blank" rel="noopener noreferrer">Войти через MAX</a><p className="login-hint">Откроется мини-приложение Лавось в MAX. В нём вход подтверждается автоматически. Сессия этого браузера отдельно не переносится.</p><button className="btn btn-secondary" onClick={()=>this.setState({loginOpen:false})}>Продолжить просмотр без входа</button></section></div>;}
 renderCart(){const items=this.state.listings.filter(l=>this.state.cart.includes(l.id));return <section><h1>Корзина</h1><p>Список выбранных товаров. Покупку и передачу товара обсудите с продавцом.</p>{items.length?this.renderCards(items):<p>Корзина пока пуста. Добавьте товар из каталога.</p>}</section>;}
 renderHome(){const newest=this.filterItems(this.state.listings).slice(0,8);return <>
  <div className="eyebrow">МАРКЕТПЛЕЙС НАХОДОК И СООБЩЕСТВ</div><section className="hero"><div className="hero-content"><div className="hero-pill"><span className="pulse-dot"/> 🐾 По лапкам — и по рукам! 🤝</div><h1>Покупай. Продавай.<br/><span>Находи своё.</span></h1><p>Маркетплейс объявлений и сообществ внутри MAX. Вещи рядом, быстрые продажи и один каталог для твоих кругов.</p><div className="hero-buttons"><button className="btn btn-lime" onClick={()=>this.openCreate()}><Icon name="plus" size={18}/>Разместить вещь</button><button className="btn btn-ghost-light" onClick={()=>this.go('catalog')}>Смотреть каталог<Icon name="arrow" size={17}/></button></div><div className="hero-foot"><span>✦ Без комиссии</span><span>✦ Находки рядом</span><span>✦ Свои сообщества</span></div></div><img className="hero-yori" src="assets/yori-raccoon-large.webp" alt="Лаврик — фирменный енот LAVOSE"/><div className="hero-orbit"/></section>
  <div className="section-heading cat-heading"><div><span className="micro">ИССЛЕДУЙ</span><h2>Что ищем сегодня?</h2></div><button className="text-link" onClick={()=>this.go('catalog')}>Все категории <Icon name="arrow" size={16}/></button></div>
  <div className="category-strip">{CAT.slice(1).map(c=><button key={c.id} className={'category-tile category-'+c.bg} onClick={()=>{this.setState({page:'catalog',filters:{...DEFAULT_FILTERS,category:c.id}});}}><span>{c.emoji}</span><b>{c.name}</b><Icon name="arrow" size={15}/></button>)}</div>
  <div className="section-heading"><div><span className="micro">ВЫБРАНО ДЛЯ ТЕБЯ</span><h2>Свежие находки <span className="sparkle-text">✦</span></h2></div><button className="text-link" onClick={()=>this.go('catalog')}>Смотреть всё <Icon name="arrow" size={16}/></button></div>
  {this.renderCards(newest)}
  <div className="section-heading circles-heading"><div><span className="micro">ЛЮДИ РЯДОМ</span><h2>Круги по интересам</h2></div><button className="text-link" onClick={()=>this.go('circles')}>Все круги <Icon name="arrow" size={16}/></button></div>
  <div className="circle-grid-home">{this.state.circles.slice(0,3).map(c=>this.circleCard(c))}</div>
  <div className="bottom-promo"><div className="promo-icon"><Icon name="sparkle" size={26}/></div><div><b>Вторая жизнь вещей начинается здесь.</b><p>Размести объявление за пару минут. Лаврик подскажет, если потребуется помощь.</p></div><button className="btn btn-dark" onClick={()=>this.openCreate()}>Начать продавать <Icon name="arrow" size={17}/></button></div>
 </>;}
 renderFilterbar(){const f=this.state.filters;return this.state.filterOpen?<div className="advanced-filters" aria-label="Фильтры поиска"><div className="filter-field"><label htmlFor="price-min">Цена от, ₽</label><input id="price-min" type="number" min="0" placeholder="0" value={f.minPrice} onChange={e=>this.setFilter({minPrice:e.target.value})}/></div><div className="filter-field"><label htmlFor="price-max">Цена до, ₽</label><input id="price-max" type="number" min="0" placeholder="Любая" value={f.maxPrice} onChange={e=>this.setFilter({maxPrice:e.target.value})}/></div><button className="btn btn-soft" onClick={()=>{this.setState({filters:{...DEFAULT_FILTERS},query:''});this.selectServerCircle(null);}}>Сбросить</button><button className="btn btn-primary" onClick={()=>this.setState({filterOpen:false})}>Показать</button></div>:null;}
 renderCatalog(){const baseItems=this.filterItems(this.state.listings);const tab=this.state.catalogTab;const currentCity=this.state.filters.city;const subscribed=this.state.circles.filter(c=>c.isJoined).map(c=>c.id);const items=baseItems.filter(l=>tab==='all'||(tab==='nearby'?(currentCity!=='all'&&l.city===currentCity):tab==='circles'?Object.entries(l.placements||{}).some(([id,status])=>id!=='global'&&status==='approved'):Object.entries(l.placements||{}).some(([id,status])=>subscribed.includes(id)&&status==='approved')));return <div className="catalog-screen">
  {!this.state.query&&this.state.filters.category==='all'?<div className="lavose-feature-row"><section className="lavose-feature-main"><div className="lavose-feature-copy"><h1>Маркетплейс<br/>находок <em>рядом</em></h1><p>Покупай, продавай и находи<br/>интересные вещи в своём городе<br/>и своих кругах</p><button className="lavose-feature-cta" onClick={()=>this.openCreate()}><Icon name="plus" size={22}/>Разместить объявление</button></div><img className="lavose-feature-mascot" src="assets/yori-raccoon-large.webp" alt="Лаврик — енот Лавось"/><div className="lavose-feature-benefits"><div><Icon name="map" size={25}/><span><b>Рядом</b><small>Объявления из твоего города</small></span></div><div><Icon name="users" size={25}/><span><b>В кругах</b><small>Тематические сообщества</small></span></div><div><Icon name="bolt" size={25}/><span><b>Выгодно</b><small>Хорошие находки каждый день</small></span></div></div></section><aside className="lavose-max-promo"><h2>Открой Лавось<br/>в <em>MAX</em></h2><p>Быстро, удобно<br/>и всегда под рукой</p><div className="lavose-max-phone" aria-hidden="true"><div className="lavose-max-phone-camera"/><div className="lavose-max-phone-screen"><span className="lavose-max-phone-logo">Л</span><strong>Лавось</strong><small>Находки рядом</small></div></div><a href="https://max.ru/se14029050_1_bot" target="_blank" rel="noopener noreferrer" aria-label="Открыть Лавось в MAX"><span className="lavose-max-symbol">MAX</span><span>Открыть приложение ↗</span></a></aside></div>:null}
  <div className="catalog-location legacy-location"><Icon name="map" size={16}/><select aria-label="Город поиска" value={this.state.filters.city} onChange={e=>this.setFilter({city:e.target.value})}><option value="all">Все города</option>{Array.from(new Set(['Воронеж','Москва','Липецк',...this.state.listings.map(l=>l.city)])).map(city=><option key={city}>{city}</option>)}</select></div>
  <div id="lavose-categories" className="catalog-categories" aria-label="Категории">{CAT.map(c=><button type="button" key={c.id} aria-pressed={this.state.filters.category===c.id} className={this.state.filters.category===c.id?'selected':''} onClick={()=>this.setFilter({category:c.id})}><span className="lavose-category-emoji" aria-hidden="true">{c.emoji}</span><b>{c.name}</b></button>)}</div>
  <div className={'catalog-filters '+(this.state.filterOpen?'expanded':'')}>{this.renderFilterbar()}
   {this.state.filterOpen&&this.state.serverCircles.length?<div className="yorvi-server-circles"><label htmlFor="yorvi-server-circle">Сообщество</label><select id="yorvi-server-circle" value={this.state.selectedCommunityId||''} onChange={e=>this.selectServerCircle(e.target.value||null)}><option value="">Все сообщества</option>{this.state.serverCircles.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div>:null}
  </div>
  <div className="lavose-listing-toolbar"><div className="results-header"><h1>{this.state.query?'Результаты поиска':'Новые объявления'} <small>{items.length}</small></h1><select aria-label="Порядок объявлений" value={this.state.filters.sort} onChange={e=>this.setFilter({sort:e.target.value})}><option value="new">Сначала новые</option><option value="cheap">Дешевле</option><option value="expensive">Дороже</option></select></div><div className="lavose-catalog-tabs" role="group" aria-label="Подборка объявлений">{([{id:'all',label:'Все'},{id:'nearby',label:'Рядом'},{id:'circles',label:'В кругах'},{id:'subscriptions',label:'Подписки'}] as const).map(t=><button type="button" key={t.id} className={tab===t.id?'active':''} aria-pressed={tab===t.id} onClick={()=>this.setState({catalogTab:t.id})}>{t.label}</button>)}</div></div>
  {tab==='nearby'&&currentCity==='all'?<div className="lavose-location-prompt"><Icon name="map" size={20}/><span>Выбери город в верхнем меню, чтобы увидеть объявления рядом.</span></div>:this.renderCards(items,'Пока ничего не нашлось')}
 </div>;}
 circleCard(c:Circle){const count=this.state.listings.filter(l=>l.placements[c.id]==='approved'&&l.status==='active').length;return <div className={'circle-card '+c.gradient} key={c.id}><div className="circle-emoji">{c.emoji}</div><div className="circle-body"><h3>{c.name}</h3><p>{c.summary}</p><div className="circle-bottom"><span><Icon name="users" size={14}/>{c.members}</span><button onClick={()=>{this.setState({activeCircle:c.id,page:'circles'});}} title="Открыть круг"><Icon name="arrow" size={19}/></button></div></div><span className="circle-decor">{count} лотов</span></div>;}
 renderCircles(){if(!import.meta.env.DEV){
   return <><div className="page-intro"><div><span className="micro">КРУГИ LAVOSE</span><h1>Круги сообществ<span className="dot-lime">.</span></h1><p>Одно объявление может находиться в разных кругах с отдельной модерацией.</p></div></div>
    <div className="yorvi-server-circle-grid">{this.state.serverCircles.map(c=><button key={c.id} className="yorvi-server-circle-card" onClick={()=>this.selectServerCircle(c.id)}>
      <span className="yorvi-server-circle-icon">◎</span><b>{c.name}</b><small>{c.city||'Сообщество LAVOSE'}</small><span>Смотреть объявления →</span>
    </button>)}</div>
    {!this.state.serverCircles.length?<p>Пока нет доступных кругов. Проверьте подключение к API.</p>:null}
   </>;
  }if(this.state.activeCircle){const c=this.state.circles.find(x=>x.id===this.state.activeCircle);if(!c)return null;const items=this.state.listings.filter(l=>l.status==='active'&&l.placements[c.id]==='approved');return <><button className="back-link" onClick={()=>this.setState({activeCircle:null})}><Icon name="left" size={16}/>Все круги</button><div className={'circle-detail-cover '+c.gradient}><div className="circle-detail-emoji">{c.emoji}</div><div><span className="micro">СООБЩЕСТВО LAVOSE</span><h1>{c.name}</h1><p>{c.summary} · {c.members} участников</p></div><button className="btn btn-dark" onClick={()=>this.toggleCircle(c.id)}>{c.isJoined?'В круге ✓':'Вступить в круг'}</button></div><div className="section-heading"><div><span className="micro">ОБЪЯВЛЕНИЯ</span><h2>В этом круге <span className="muted-count">{items.length}</span></h2></div></div>{this.renderCards(items,'Здесь пока нет одобренных объявлений')}</>;}return <><div className="page-intro"><div><span className="micro">СООБЩЕСТВА MAX</span><h1>Твои круги<span className="dot-lime">.</span></h1><p>Локальные и тематические витрины. Находи вещи среди своих.</p></div></div><div className="circles-banner"><div><span className="micro">БОЛЬШЕ ВМЕСТЕ</span><h2>Каждый круг — своя история находок.</h2><p>Присоединяйся к сообществам, в которых тебе интересно.</p></div><div className="circles-banner-icon">◎</div></div><div className="section-heading"><div><span className="micro">ИССЛЕДУЙ СООБЩЕСТВА</span><h2>Все круги</h2></div></div><div className="circles-grid">{this.state.circles.map(c=><div key={c.id} className="circle-wrap">{this.circleCard(c)}<button className={'join-circle '+(c.isJoined?'joined':'')} onClick={()=>this.toggleCircle(c.id)}>{c.isJoined?<><Icon name="check" size={15}/> Ты в круге</>:<><Icon name="plus" size={15}/> Вступить</>}</button></div>)}</div></>;}
 toggleCircle(id:string){this.setState(s=>({circles:s.circles.map(c=>c.id===id?{...c,isJoined:!c.isJoined}:c)}));}
 renderFavorites(){const fav=this.state.favoritesAuthenticated?this.state.favoriteListings:this.state.listings.filter(l=>this.state.favorites.includes(l.id)&&l.status==='active');return <><div className="page-intro"><div><span className="micro">ТВОИ СОХРАНЕНИЯ</span><h1>Избранное<span className="dot-lime">.</span></h1><p>Вещи, к которым хочется вернуться.</p></div></div>{!this.state.favoritesAuthenticated&&!import.meta.env.DEV?<p>Войдите через MAX, чтобы синхронизировать избранное на всех устройствах.</p>:null}{this.renderCards(fav,'Здесь пока ничего нет')}</>;}
 renderMy(){const mine=this.state.listings.filter(x=>x.mine);return <><div className="page-intro"><div><span className="micro">ЛИЧНЫЙ КАБИНЕТ</span><h1>Мои объявления<span className="dot-lime">.</span></h1><p>Управляй товарами. Изменения статуса действуют во всех кругах.</p></div><button className="btn btn-primary" onClick={()=>this.openCreate()}><Icon name="plus" size={18}/>Новое объявление</button></div><div className="stats-grid"><div className="stat-card"><span>Всего объявлений</span><strong>{mine.length}</strong><Icon name="bag"/></div><div className="stat-card"><span>Активных</span><strong>{mine.filter(l=>l.status==='active').length}</strong><Icon name="bolt"/></div><div className="stat-card"><span>Продано</span><strong>{mine.filter(l=>l.status==='sold').length}</strong><Icon name="check"/></div><div className="stat-card"><span>Просмотры</span><strong>{fmt(mine.reduce((s,l)=>s+l.views,0))}</strong><Icon name="eye"/></div></div><div className="section-heading"><div><h2>Мои товары</h2></div></div><div className="manage-list">{mine.map(l=><div className="manage-item" key={l.id}><button className={'manage-cover '+l.art} onClick={()=>this.openListing(l.id)}>{demoPhoto(l)?<img src={demoPhoto(l)} alt={'Иллюстрация: '+l.title}/>:<span>{l.emoji}</span>}</button><div className="manage-info"><b>{l.title}</b><span>{money(l.price)} · {l.city}</span><div className="manage-tags"><span className={'status '+l.status}>{l.status==='active'?'Активно':l.status==='sold'?'Продано':l.status==='reserved'?'Резерв':'Архив'}</span><span>{Object.entries(l.placements).filter(([c,s])=>c!=='global'&&s==='approved').length} круг(а)</span>{Object.values(l.placements).includes('pending')?<span className="status pending">Есть проверка</span>:null}</div></div><div className="manage-actions"><button title="Изменить" onClick={()=>this.openCreate(l.id)}><Icon name="edit" size={18}/></button><button onClick={()=>this.markStatus(l.id,l.status==='sold'?'active':'sold')} title={l.status==='sold'?'Вернуть в продажу':'Отметить проданным'}><Icon name={l.status==='sold'?'refresh':'check'} size={18}/></button><button title="Открыть" onClick={()=>this.openListing(l.id)}><Icon name="arrow" size={18}/></button></div></div>)}</div></>;}
 renderModeration(){const mod=this.state.modCircle;const items=this.state.listings.filter(l=>l.placements[mod]&&l.placements[mod]!=='rejected'&&(this.state.modTab==='all'||l.placements[mod]===this.state.modTab));const pending=this.state.listings.filter(l=>l.placements[mod]==='pending').length;return <><div className="page-intro"><div><span className="micro">КАБИНЕТ АДМИНИСТРАТОРА · ДЕМО</span><h1>Модерация<span className="dot-lime">.</span></h1><p>Каждый круг решает, какие объявления показывать у себя.</p></div><span className="demo-badge">Демо-роль модератора</span></div><div className="moderation-toolbar"><div><label>Витрина</label><select value={mod} onChange={(e:any)=>this.setState({modCircle:e.target.value,modTab:'pending'})}>{this.state.circles.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div><div className="moderation-tabs"><button className={this.state.modTab==='pending'?'active':''} onClick={()=>this.setState({modTab:'pending'})}>На проверке <b>{pending}</b></button><button className={this.state.modTab==='approved'?'active':''} onClick={()=>this.setState({modTab:'approved'})}>Одобрено</button><button className={this.state.modTab==='all'?'active':''} onClick={()=>this.setState({modTab:'all'})}>Все</button></div></div><div className="review-list">{items.length?items.map(l=><div className="review-item" key={l.id}><div className={'review-art '+l.art}>{demoPhoto(l)?<img src={demoPhoto(l)} alt={'Иллюстрация: '+l.title}/>:l.emoji}</div><div className="review-content"><b>{l.title}</b><span>{money(l.price)} · {l.seller}</span><div className="review-description">{l.description}</div><small>Витрина: {this.state.circles.find(c=>c.id===mod)?.name} · {l.placements[mod]==='pending'?'Ожидает проверки':'Одобрено'}</small></div><div className="review-actions">{l.placements[mod]==='pending'?<><button className="approve" onClick={()=>this.moderate(l.id,mod,'approved')}><Icon name="check" size={17}/>Одобрить</button><button className="reject" onClick={()=>this.moderate(l.id,mod,'rejected')}><Icon name="close" size={17}/>Отклонить</button></>:<button className="reject" onClick={()=>this.moderate(l.id,mod,'pending')}>На проверку</button>}</div></div>):<div className="empty-state slim"><div className="empty-glyph">✓</div><h3>На проверке пусто</h3><p>Все объявления в выбранной вкладке обработаны.</p></div>}</div><div className="notice"><Icon name="info"/><p>В реальном продукте администратор сможет модерировать только свои сообщества. В прототипе переключатель доступен для тестирования сценариев.</p></div></>;}
 renderKit(){return <><div className="page-intro"><div><span className="micro">LAVOSE DESIGN SYSTEM · 1.4</span><h1>Фирменный стиль<span className="dot-lime">.</span></h1><p>Единые компоненты для веб-приложения и будущего Mini App в MAX.</p></div></div><div className="kit-hero"><div><Brand/><h2>Находи своё.</h2><p>Честный, быстрый и человечный маркетплейс.</p></div><img src="assets/yori-raccoon.webp" alt="Маскот Лаврик"/></div><div className="section-heading"><h2>Палитра</h2></div><div className="swatch-grid">{[{name:'Графит',hex:'#0D0F12',dark:true},{name:'Лайм',hex:'#C8FF4D',dark:false},{name:'Молоко',hex:'#F7F8F5',dark:false},{name:'Поверхность',hex:'#FFFFFF',dark:false},{name:'Серый',hex:'#8B9099',dark:true}].map(c=><div className="swatch-card" key={c.hex}><div style={{background:c.hex,color:c.dark?'white':'#171919'}}>{c.name}</div><b>{c.hex}</b></div>)}</div><div className="section-heading"><h2>Компоненты интерфейса</h2></div><div className="kit-elements"><button className="btn btn-primary" onClick={()=>this.say('Основное действие')}>Основная кнопка</button><button className="btn btn-secondary" onClick={()=>this.say('Вторичное действие')}>Вторичная</button><button className="btn btn-dark" onClick={()=>this.say('Контрастная кнопка')}>Контрастная</button><span className="status active">Активно</span><span className="status pending">На проверке</span><span className="status sold">Продано</span></div><div className="section-heading"><h2>Лаврик — твой помощник</h2></div><div className="mascot-kit"><img src="assets/yori-raccoon.webp" alt="Лаврик спереди"/><div><span className="micro">УМНЫЙ · ДРУЖЕЛЮБНЫЙ · НЕ НАВЯЗЧИВЫЙ</span><h3>Привет! Я Лаврик — енот LAVOSE!</h3><p>Подскажу, как разместить вещь и найти нужное рядом. Енот в лаймовом худи и чёрной кепке с буквой Y — фирменный персонаж LAVOSE. Он помогает продавать и находить вещи рядом.</p><button className="btn btn-secondary" onClick={()=>this.setState({helpOpen:true})}>Познакомиться <Icon name="arrow" size={15}/></button></div></div><div className="notice"><Icon name="info"/><p>Это UI Kit и интерактивный прототип. Изображения и объявления демонстрационные; сервер, платежи, реальные роли и MAX API не подключены.</p></div></>;}
 renderDetails(){const id=this.state.selectedListing;if(!id)return null;if(/^[0-9a-f-]{36}$/i.test(id))return <ListingDetails key={id} id={id} liked={this.state.favorites.includes(id)} onClose={this.closeDetails} onFavorite={()=>void this.favorite(id)} onOpen={next=>this.openListing(next)}/>;return this.renderDemoDetails();}
 renderDemoDetails(){const l=this.state.listings.find(x=>x.id===this.state.selectedListing);if(!l)return null;return <div className="modal-layer" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)this.setState({selectedListing:null});}}><div className="detail-modal" role="dialog" aria-modal="true" aria-label={l.title}><button className="modal-close" title="Закрыть" onClick={()=>this.setState({selectedListing:null})}><Icon name="close"/></button><div className="detail-grid"><div className="yorvi-gallery"><div className={'detail-art '+l.art}>{this.state.gallery.length?<img src={this.state.gallery[this.state.galleryIndex]||this.state.gallery[0]} alt={'Фотография '+l.title+' '+(this.state.galleryIndex+1)} />:demoPhoto(l)?<img src={demoPhoto(l)} alt={'Иллюстрация: '+l.title}/>:<span>{l.emoji}</span>}<div className="photo-count">{this.state.gallery.length?(this.state.galleryIndex+1)+' / '+this.state.gallery.length:demoPhoto(l)?'1 / 1 · Демо':'Нет фотографий'}</div></div>
  {this.state.gallery.length>1?<div className="yorvi-gallery-thumbs" role="group" aria-label="Фотографии объявления">{this.state.gallery.map((url,i)=><button type="button" key={url} className={i===this.state.galleryIndex?'active':''} onClick={()=>this.setState({galleryIndex:i})} aria-label={'Показать фото '+(i+1)} aria-pressed={i===this.state.galleryIndex}><img src={url} alt="" loading="lazy"/></button>)}</div>:null}</div><div className="detail-info"><div className="detail-topline"><span className="soft-tag">{categoryName(l.category)}</span><span><Icon name="eye" size={15}/>{l.views} просмотров</span></div><h2>{l.title}</h2><div className="detail-price">{l.deal==='free'?'Бесплатно':money(l.price)}</div><div className="detail-tags"><span><Icon name="map" size={15}/>{l.city}</span><span><Icon name="clock" size={15}/>{relativeDate(l.createdAt)}</span><span>{conditionName(l.condition)}</span></div><h3>Описание</h3><p className="detail-desc">{l.description}</p><div className="detail-seller"><div className="seller-avatar">{l.seller[0]}</div><div><b>{l.seller}</b><small>{l.remote?'Продавец Лавось':l.mine?'Это ты':'Демо-профиль'}</small></div><span className="seller-verify"><Icon name="shield" size={15}/> LAVOSE</span></div><div className="detail-cta">{l.mine?<button className="btn btn-primary" onClick={()=>this.openCreate(l.id)}><Icon name="edit" size={18}/>Редактировать</button>:<button className="btn btn-primary" onClick={()=>{if(l.remote)window.dispatchEvent(new CustomEvent('lavose:messages',{detail:{listingId:l.id}}));else this.say('Переписка доступна для настоящих объявлений.');}}><Icon name="message" size={18}/>Написать продавцу</button>}<button className="btn btn-secondary" onClick={()=>this.favorite(l.id)}><Icon name="heart" size={18} filled={this.state.favorites.includes(l.id)}/>{this.state.favorites.includes(l.id)?'В избранном':'Сохранить'}</button><button className="btn btn-iconish" aria-label="Поделиться" title="Скопировать ссылку" onClick={()=>this.shareItem(l.id)}><Icon name="copy"/></button></div><div className="detail-placements"><b>{l.remote?'Размещено в Лавось':'Где размещено'}</b><div>{Object.entries(l.placements).filter(([id,status])=>id!=='global').map(([id,status])=><span className={'placement-pill '+status} key={id}>{this.state.circles.find(c=>c.id===id)?.name||id} · {status==='approved'?'Активно':status==='pending'?'На проверке':'Отклонено'}</span>)}</div></div><div className="detail-note"><Icon name="shield" size={16}/>Не переводите предоплату незнакомым продавцам. Тестовый прототип не проводит сделки.</div></div></div></div></div>;}
 renderCreate(){const d=this.state.draft;return <div className="modal-layer" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)this.setState({createOpen:false});}}><div className="create-modal" role="dialog" aria-modal="true" aria-label="Создание объявления"><div className="create-head"><div><span className="micro">LAVOSE · ПРОДАВАЙ ПРОЩЕ</span><h2>{this.state.editId?'Редактирование':'Новое объявление'}</h2></div><button className="modal-close inline" title="Закрыть" onClick={()=>this.setState({createOpen:false})}><Icon name="close"/></button></div><div className="stepper">{['Детали','Описание','Круги'].map((name,i)=><div key={name} className={'step '+(this.state.step===i+1?'selected':this.state.step>i+1?'complete':'')}><span>{this.state.step>i+1?<Icon name="check" size={15}/>:i+1}</span><b>{name}</b></div>)}</div>
  <div className="create-body">{this.state.step===1?<div className="form-grid"><div className="form-field span-2"><label>Название вещи <em>*</em></label><input autoFocus maxLength={90} placeholder="Например, iPhone 13, 128 ГБ" value={d.title} onChange={(e:any)=>this.updateDraft({title:e.target.value})}/></div><div className="form-field"><label>Категория</label><select value={d.category} onChange={(e:any)=>this.updateDraft({category:e.target.value,emoji:CAT.find(c=>c.id===e.target.value)?.emoji||'📦'})}>{CAT.filter(x=>x.id!=='all').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="form-field"><label>Город</label><select value={d.city} onChange={(e:any)=>this.updateDraft({city:e.target.value})}><option>Воронеж</option><option>Москва</option><option>Липецк</option><option>Санкт-Петербург</option><option>Краснодар</option></select></div><div className="form-field"><label>Тип объявления</label><select value={d.deal} onChange={(e:any)=>this.updateDraft({deal:e.target.value as DealType})}><option value="sell">Продать</option><option value="swap">Обменять</option><option value="free">Отдать бесплатно</option></select></div><div className="form-field"><label>Цена в ₽ {d.deal==='sell'?'*':''}</label><input type="number" min="0" disabled={d.deal==='free'} placeholder="Например, 19000" value={d.deal==='free'?'0':d.price} onChange={(e:any)=>this.updateDraft({price:e.target.value})}/></div></div>:null}
  {this.state.step===2?<div className="form-grid"><div className="form-field span-2"><label>Описание <em>*</em></label><textarea rows={5} value={d.description} placeholder="Состояние вещи, комплектация, особенности..." onChange={(e:any)=>this.updateDraft({description:e.target.value})}/></div><div className="form-field span-2"><label>Состояние</label><div className="condition-choices">{(['new','excellent','good','used'] as Condition[]).map(c=><button key={c} className={d.condition===c?'picked':''} onClick={()=>this.updateDraft({condition:c})}>{conditionName(c)}</button>)}</div></div><div className="form-field span-2"><label>Фото вещи (необязательно в демо)</label><div className="upload-area"><input type="file" id="upload-photo" accept="image/*" onChange={(e:any)=>this.handleFile(e)}/>{d.image?<img src={d.image} alt="Предпросмотр фотографии"/>:<><Icon name="upload" size={27}/><b>Загрузи фото</b><span>PNG, JPEG, WebP · до 3 МБ</span></>}<label htmlFor="upload-photo" className="btn btn-secondary">{d.image?'Заменить фото':'Выбрать файл'}</label></div></div></div>:null}
  {this.state.step===3?<div className="circle-chooser"><p>Где показать вещь? Один товар можно разместить сразу в нескольких кругах — без дублей.</p><label className="circle-check"><input type="checkbox" checked={d.circles.includes('global')} onChange={(e:any)=>this.updateDraft({circles:e.target.checked?[...d.circles,'global']:d.circles.filter(x=>x!=='global')})}/><span className="check-emoji">🌐</span><span><b>Общий каталог LAVOSE</b><small>Доступно всем пользователям</small></span><span className="check-tag">Публично</span></label>{this.state.circles.map(c=><label className="circle-check" key={c.id}><input type="checkbox" checked={d.circles.includes(c.id)} onChange={(e:any)=>this.updateDraft({circles:e.target.checked?[...d.circles,c.id]:d.circles.filter(x=>x!==c.id)})}/><span className="check-emoji">{c.emoji}</span><span><b>{c.name}</b><small>{c.summary}</small></span><span className="check-tag">Модерация</span></label>)}<div className="form-notice"><Icon name="info" size={17}/>В кругах объявления появятся после одобрения модератором. Проданный товар исчезнет из активного поиска везде.</div></div>:null}</div>
  <div className="create-foot"><button className="btn btn-secondary" onClick={()=>this.state.step===1?this.setState({createOpen:false}):this.setState(s=>({step:s.step-1}))}>{this.state.step===1?'Отмена':'Назад'}</button><span>Шаг {this.state.step} из 3</span><button className="btn btn-primary" onClick={()=>this.state.step===3?this.saveListing():this.nextStep()}>{this.state.step===3?(this.state.editId?'Сохранить':'Опубликовать'):'Далее'}<Icon name={this.state.step===3?'check':'arrow'} size={16}/></button></div>
 </div></div>;}
 renderHelp(){return <div className="modal-layer" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)this.setState({helpOpen:false});}}><div className="help-modal"><button className="modal-close" onClick={()=>this.setState({helpOpen:false})}><Icon name="close"/></button><img src="assets/yori-raccoon.webp" alt="Лаврик приветствует"/><span className="micro">ЗНАКОМЬСЯ</span><h2>Лаврик на связи! <span>✦</span></h2><p>Я — маскот LAVOSE. Помогу разобраться с объявлениями, кругами и находками. Пока я живу в демо-прототипе, но скоро появлюсь и в боте MAX.</p><div className="help-buttons"><button className="btn btn-primary" onClick={()=>{this.setState({helpOpen:false});this.openCreate();}}>Разместить вещь</button><button className="btn btn-secondary" onClick={()=>{this.setState({helpOpen:false});this.go('circles');}}>Посмотреть круги</button></div></div></div>;}
 renderMobileNav(){return <nav className="mobile-nav" aria-label="Основные разделы">{[{id:'catalog',name:'Поиск',icon:'search'},{id:'favorites',name:'Избранное',icon:'heart'},{id:'server',name:'Объявления',icon:'bag'},{id:'cart',name:'Корзина',icon:'cart'},{id:'account',name:'Профиль',icon:'user'}].map(n=><button type="button" aria-current={this.state.page===n.id?'page':undefined} className={this.state.page===n.id?'active':''} key={n.id} onClick={()=>this.go(n.id as Page)}><Icon name={n.icon} size={22}/><span>{n.name}</span></button>)}</nav>;}
 render(){const {page}=this.state;return <div className="app-shell" data-page={page}>{this.renderSidebar()}<div className="main-shell">{this.renderHeader()}<main className="page-content" id="main"><Conversations active={page==='messages'} onOpen={this.showMessages} onClose={this.closeMessages}/><div hidden={this.state.apiStatus==='live'} className={'api-status api-'+this.state.apiStatus} role="status">{this.state.apiStatus==='checking'?'Проверяем подключение к серверу…':this.state.apiStatus==='live'?`Подключено к API · ${this.state.serverCount} объявлений из PostgreSQL (просмотр)` :this.state.apiStatus==='error'?'Каталог временно недоступен. Попробуйте обновить страницу.':'Демо-режим · объявления сохраняются только в этом браузере'}</div>{page==='home'?this.renderCatalog():page==='catalog'?this.renderCatalog():page==='circles'?this.renderCircles():page==='cart'?this.renderCart():page==='favorites'?this.renderFavorites():page==='my'?this.renderMy():page==='moderation'?this.renderModeration():page==='server'?<ServerWorkspace key="workspace" view="listings" createRequest={this.state.createRequest}/>:page==='account'?<ServerWorkspace key="workspace" view="profile"/>:page==='messages'?null:this.renderKit()}</main><footer className="app-footer"><span>© 2026 LAVOSE. По лапкам — и по рукам! 🤝</span><span>LAVOSE 2.3 alpha · вход MAX по защищённой сессии · платежи ещё не подключены</span><button onClick={()=>this.resetDemo()}><Icon name="reset" size={13}/>Сбросить демо</button></footer></div>{this.renderMobileNav()}{this.state.selectedListing?this.renderDetails():null}{import.meta.env.DEV&&this.state.createOpen?this.renderCreate():null}{this.state.helpOpen?this.renderHelp():null}{this.state.loginOpen?this.renderLogin():null}{this.state.toast?<div className="toast"><Icon name="check" size={16}/>{this.state.toast}</div>:null}</div>;}
}
export default App;