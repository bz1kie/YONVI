/** Public and account-scoped YORVI API. Never send a user ID from the client as authentication. */
export interface ServerListing {
 id:string;title:string;description:string;price_kopecks:string|number;
 category:string;city:string;created_at:string;seller_name?:string;photo_url?:string|null;
}
export interface ServerCircle {id:string;name:string;city?:string|null;visibility?:string}
export interface PublicListingFilters {communityId?:string;city?:string;category?:string;search?:string}
async function json<T>(path:string,init:RequestInit={}):Promise<T>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),6000);
 try{
  const response=await fetch(path,{
   ...init,credentials:'same-origin',signal:controller.signal,
   headers:{Accept:'application/json',...init.headers},
  });
  if(!response.ok)throw new Error('API '+response.status);
  return await response.json() as T;
 }finally{clearTimeout(timeout);}
}
export async function fetchPublicListings(filters:PublicListingFilters={}):Promise<{items:ServerListing[]}>{
 const p=new URLSearchParams({limit:'50'});
 if(filters.communityId)p.set('communityId',filters.communityId);
 if(filters.city)p.set('city',filters.city);
 if(filters.category)p.set('category',filters.category);
 if(filters.search)p.set('search',filters.search);
 return json('/api/listings?'+p.toString());
}
export async function fetchPublicCircles():Promise<{items:ServerCircle[]}>{
 return json('/api/communities');
}
export async function fetchMyFavorites():Promise<{items:ServerListing[]}>{
 return json('/api/me/favorites');
}
export async function setFavorite(id:string,saved:boolean):Promise<void>{
 const response=await fetch('/api/me/favorites/'+encodeURIComponent(id),{
  method:saved?'PUT':'DELETE',credentials:'same-origin',headers:{Accept:'application/json'},
 });
 if(!response.ok)throw new Error('API '+response.status);
}
