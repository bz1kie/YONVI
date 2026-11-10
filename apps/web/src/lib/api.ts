/** Public read-only API — no browser-generated demo identity is trusted as login. */
export interface ServerListing {
 id:string;title:string;description:string;price_kopecks:string|number;
 category:string;city:string;created_at:string;seller_name?:string;photo_url?:string|null;
}
export async function fetchPublicListings():Promise<{items:ServerListing[]}> {
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),3500);
 try {
  const response=await fetch('/api/listings?limit=40',{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`API responded ${response.status}`);
  const data:unknown=await response.json();
  if(!data||typeof data!=='object'||!Array.isArray((data as {items?:unknown}).items))throw new Error('Invalid API payload');
  return data as {items:ServerListing[]};
 } finally {clearTimeout(timeout);}
}
