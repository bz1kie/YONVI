import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import pg from 'pg';

const root='http://127.0.0.1:3106';
const userId='11111111-1111-4111-8111-111111111111';
const circleId='22222222-2222-4222-8222-222222222222';
const server=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:'3106',NODE_ENV:'test',ALLOW_DEMO_AUTH:'true',
 S3_BUCKET:process.env.S3_BUCKET||'yorvi-private',
 S3_ENDPOINT:process.env.S3_ENDPOINT||'http://127.0.0.1:9000',
 S3_REGION:process.env.S3_REGION||'us-east-1',
 S3_ACCESS_KEY_ID:process.env.S3_ACCESS_KEY_ID||'yorvi_local_access',
 S3_SECRET_ACCESS_KEY:process.env.S3_SECRET_ACCESS_KEY||'yorvi_local_secret_change_before_deploy'},
 stdio:['ignore','ignore','pipe'],
});
let stderr='';
server.stderr.on('data',x=>{stderr+=x.toString();});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
async function call(path,{method='GET',body,who=userId}={}){
 const r=await fetch(root+path,{method,headers:{
  ...(who?{'x-demo-user-id':who}:{}),...(body?{'Content-Type':'application/json'}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,headers:r.headers,data:await r.json().catch(()=>null)};
}
try{
 let running=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error('API exited '+stderr);
  try{if((await call('/health')).status===200){running=true;break;}}catch{}
  await sleep(150);
 }
 assert.ok(running,'API unavailable '+stderr);
 const draft=await call('/api/listings',{method:'POST',body:{
  title:'Фото-проверка YORVI',description:'MinIO pipeline test',priceKopecks:120000,
  city:'Воронеж',category:'electronics',requestKey:crypto.randomUUID()
 }});
 assert.equal(draft.status,201,JSON.stringify(draft.data));
 const id=draft.data.id;
 // PNG with standard magic, enough bytes for the media upload size policy.
 // The content policy checks magic bytes only; actual image decoding is future work.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 assert.ok(png.length>=64);
 const unauthorized=await call('/api/media/uploads',{method:'POST',who:null,body:{listingId:id,contentType:'image/png',size:png.length}});
 assert.equal(unauthorized.status,401);
 const start=await call('/api/media/uploads',{method:'POST',body:{listingId:id,contentType:'image/png',size:png.length}});
 assert.equal(start.status,200,JSON.stringify(start.data));
 const upload=await fetch(start.data.uploadUrl,{method:'PUT',headers:start.data.headers,body:png});
 assert.ok(upload.ok,'S3 put status '+upload.status+' '+await upload.text());
 const confirm=await call('/api/media/'+start.data.mediaId+'/confirm',{method:'POST'});
 assert.equal(confirm.status,200,JSON.stringify(confirm.data));
 const ownerPhoto=await fetch(root+'/api/media/'+start.data.mediaId,{headers:{'x-demo-user-id':userId}});
 assert.equal(ownerPhoto.status,200);
 assert.equal(ownerPhoto.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await ownerPhoto.arrayBuffer()),png);
 // Second image verifies multi-photo sequencing and public gallery ordering.
 const second=await call('/api/media/uploads',{method:'POST',body:{listingId:id,contentType:'image/png',size:png.length}});
 assert.equal(second.status,200,JSON.stringify(second.data));
 const secondPut=await fetch(second.data.uploadUrl,{method:'PUT',headers:second.data.headers,body:png});
 assert.equal(secondPut.status,200,await secondPut.text());
 const secondConfirm=await call('/api/media/'+second.data.mediaId+'/confirm',{method:'POST'});
 assert.equal(secondConfirm.status,200,JSON.stringify(secondConfirm.data));
 const ownerSecond=await fetch(root+'/api/media/'+second.data.mediaId,{headers:{'x-demo-user-id':userId}});
 assert.equal(ownerSecond.status,200);
 const before=await fetch(root+'/api/media/'+start.data.mediaId);
 assert.equal(before.status,404,'Unapproved photo must not be public');
 const submit=await call('/api/listings/'+id+'/submit',{method:'POST',body:{communityIds:[circleId]}});
 assert.equal(submit.status,200);
 const queue=await call('/api/moderation/queue?communityId='+circleId);
 const item=queue.data.items.find(x=>x.listing_id===id);
 assert.ok(item);
 assert.equal((await call('/api/placements/'+item.placement_id+'/moderate',{method:'POST',body:{decision:'approved'}})).status,200);
 const publicPhoto=await fetch(root+'/api/media/'+start.data.mediaId);
 assert.equal(publicPhoto.status,200);
 const listing=await call('/api/listings/'+id);
 assert.equal(listing.status,200);
 assert.ok(Array.isArray(listing.data.images));
 assert.equal(listing.data.images[0].url,'/api/media/'+start.data.mediaId);
 assert.equal(listing.data.images.length,2);
 assert.equal(listing.data.images[1].url,'/api/media/'+second.data.mediaId);
 assert.equal((await call('/api/listings/'+id+'/sold',{method:'POST'})).status,200);
 assert.equal((await fetch(root+'/api/media/'+start.data.mediaId)).status,404);
 assert.equal((await fetch(root+'/api/media/'+second.data.mediaId)).status,404);
 console.log('S3 integration: two signed PUTs, confirm, ordered gallery, ownership, moderation, sold privacy passed');
}finally{
 server.kill('SIGTERM');
 await pool.end();
}
