import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import pg from 'pg';
const seller='11111111-1111-4111-8111-111111111111',buyer=crypto.randomUUID(),other=crypto.randomUUID(),circle='22222222-2222-4222-8222-222222222222';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
await db.query('INSERT INTO users(id,nickname) VALUES($1,$2),($3,$4)',[buyer,'Покупатель тест',other,'Посторонний тест']);
const server=spawn(process.execPath,['apps/api/dist/server.js'],{stdio:'pipe',env:{...process.env,PORT:'3113',NODE_ENV:'test',ALLOW_DEMO_AUTH:'true'}});let errors='';server.stderr.on('data',d=>{errors+=d;});server.stdout.on('data',()=>{});
async function req(path,user=seller,body,method=body?'POST':'GET'){
 const r=await fetch('http://127.0.0.1:3113/api'+path,{method,headers:{...(user?{'x-demo-user-id':user}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
}
let listing;
try{
 let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error(errors);try{const r=await req('/conversations');if(r.status===200){ready=true;break;}}catch{}await sleep(150);}assert.ok(ready);
 assert.equal((await req('/conversations',null)).status,401);
 assert.equal((await req('/me/managed-communities',null)).status,401);
 assert.equal((await req('/me/managed-communities',other)).body.items.length,0);
 assert.ok((await req('/me/managed-communities',seller)).body.items.some(c=>c.id===circle));
 assert.equal((await req('/me/message-notifications',null)).status,401);
 assert.equal((await req('/me/message-notifications',seller)).body.enabled,false);
 assert.equal((await req('/me/message-notifications',seller,{enabled:true},'PUT')).status,200);
 let r=await req('/listings',seller,{title:'Диалог тест',description:'Тест переписки',priceKopecks:10000,city:'Воронеж',category:'electronics',requestKey:crypto.randomUUID()});assert.equal(r.status,201);listing=r.body.id;
 assert.equal((await req('/conversations',buyer,{listingId:listing})).status,404);
 await req('/listings/'+listing+'/submit',seller,{communityIds:[circle]});
 const q=await req('/moderation/queue?communityId='+circle);const p=q.body.items.find(x=>x.listing_id===listing);assert.ok(p);assert.equal((await req('/placements/'+p.placement_id+'/moderate',seller,{decision:'approved'})).status,200);
 assert.equal((await req('/conversations',seller,{listingId:listing})).status,409);
 const copies=await Promise.all([req('/conversations',buyer,{listingId:listing}),req('/conversations',buyer,{listingId:listing})]);assert.equal(copies[0].status,200);assert.equal(copies[0].body.id,copies[1].body.id);const id=copies[0].body.id;
 assert.equal((await req('/conversations/'+id+'/messages',other)).status,404);
 assert.equal((await req('/conversations/'+id+'/messages',other,{text:'Взлом',requestKey:crypto.randomUUID()})).status,404);
 assert.equal((await req('/conversations/'+id+'/messages',null)).status,401);
 const body={text:'<script>plain text</script> Товар в наличии?',requestKey:crypto.randomUUID()};const first=await req('/conversations/'+id+'/messages',buyer,body);assert.equal(first.status,201);const retry=await req('/conversations/'+id+'/messages',buyer,body);assert.equal(retry.body.id,first.body.id);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM conversation_notifications WHERE message_id=$1',[first.body.id])).rows[0].n,1);
 await req('/me/message-notifications',seller,{enabled:false},'PUT');
 let messages=await req('/conversations/'+id+'/messages',seller);assert.equal(messages.body.items.length,1);assert.equal(messages.body.items[0].mine,false);assert.equal(messages.body.items[0].text,body.text);
 assert.equal((await req('/conversations/'+id+'/messages',seller,{text:'Да, в наличии',requestKey:crypto.randomUUID()})).status,201);
 messages=await req('/conversations/'+id+'/messages',buyer);assert.deepEqual(messages.body.items.map(m=>m.mine),[true,false]);
 assert.equal((await req('/conversations',other)).body.items.length,0);
 assert.equal((await req('/conversations/'+id+'/messages',buyer,{text:'',requestKey:crypto.randomUUID()})).status,400);
 console.log('Conversations: participant isolation, replies, draft visibility and retry idempotency passed');
}finally{
 server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));
 if(listing){await db.query('DELETE FROM conversation_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE listing_id=$1)',[listing]);await db.query('DELETE FROM conversations WHERE listing_id=$1',[listing]);}
 await db.end();
}
