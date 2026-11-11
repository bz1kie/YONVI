import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const origin = 'http://127.0.0.1:3102';
const userId = '11111111-1111-4111-8111-111111111111';
const circleId = '22222222-2222-4222-8222-222222222222';
// Local fake header is enabled only for this CI-only process, never production.
const server = spawn(process.execPath,['apps/api/dist/server.js'],{
  stdio: 'pipe', env: {...process.env,PORT:'3102',NODE_ENV:'test',ALLOW_DEMO_AUTH:'true'},
});
let errors='';
server.stderr.on('data',x=>{errors+=x.toString();});
async function req(path,{method='GET',body,auth=true}={}) {
  const response=await fetch(origin+path,{
    method,headers:{...(auth?{'x-demo-user-id':userId}:{}),...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  return {status:response.status,body:await response.json()};
}
try {
  let ready=false;
  for(let i=0;i<60;i++){
    if(server.exitCode!==null)throw new Error('API exited: '+errors);
    try{const r=await req('/health');if(r.status===200){ready=true;break;}}catch{}
    await sleep(150);
  }
  assert.ok(ready,'API did not start: '+errors);

  const forbidden=await req('/api/me/listings',{auth:false});
  assert.equal(forbidden.status,401);

  assert.equal((await req('/api/me/contact',{auth:false})).status,401);
  assert.equal((await req('/api/me/contact',{method:'PUT',body:{url:'https://max.ru/u/test_contact'},auth:false})).status,401);
  for(const url of ['javascript:alert(1)','https://max.ru.evil.com/u/test','https://max.ru@evil.com/u/test','https://max.ru/u/test?redirect=evil','https://max.ru/se14029050_biz']){
    assert.equal((await req('/api/me/contact',{method:'PUT',body:{url}})).status,400);
  }
  assert.equal((await req('/api/me/contact',{method:'PUT',body:{url:'https://max.ru/u/test_contact'}})).status,200);
  assert.equal((await req('/api/me/contact')).body.url,'https://max.ru/u/test_contact');

  const key=crypto.randomUUID();
  const creation={title:'Тестовый планшет YORVI',description:'Создан интеграционным тестом',priceKopecks:850000,city:'Воронеж',category:'electronics',requestKey:key};
  const create=await req('/api/listings',{method:'POST',body:creation});
  assert.equal(create.status,201,JSON.stringify(create.body));
  const id=create.body.id;
  const retry=await req('/api/listings',{method:'POST',body:creation});
  assert.equal(retry.status,201);
  assert.equal(retry.body.id,id,'Idempotent create must not duplicate a listing');

  const pending=await req('/api/listings/'+id);
  assert.equal(pending.status,404,'Draft must be hidden');

  const submit=await req('/api/listings/'+id+'/submit',{method:'POST',body:{communityIds:[circleId]}});
  assert.equal(submit.status,200,JSON.stringify(submit.body));
  assert.equal(submit.body.submitted,1);
  const submitRetry=await req('/api/listings/'+id+'/submit',{method:'POST',body:{communityIds:[circleId]}});
  assert.equal(submitRetry.status,200);
  assert.equal(submitRetry.body.submitted,0,'Resubmitting an already-pending placement is idempotent');

  const queue=await req('/api/moderation/queue?communityId='+circleId);
  assert.equal(queue.status,200);
  const placement=queue.body.items.find(x=>x.listing_id===id);
  assert.ok(placement,'New placement should be in moderator queue');

  const approval=await req('/api/placements/'+placement.placement_id+'/moderate',{method:'POST',body:{decision:'approved'}});
  assert.equal(approval.status,200,JSON.stringify(approval.body));
  const visible=await req('/api/listings/'+id);
  assert.equal(visible.status,200,'Approved listing must be visible');
  assert.equal(visible.body.seller_contact_url,'https://max.ru/u/test_contact');
  assert.equal((await req('/api/me/contact',{method:'PUT',body:{url:''}})).status,200);
  assert.equal((await req('/api/listings/'+id)).body.seller_contact_url,null);


  const edited=await req('/api/listings/'+id,{method:'PATCH',body:{title:'Тестовый планшет после редактирования',description:'Изменили цену и характеристики',priceKopecks:810000}});
  assert.equal(edited.status,200);
  const hiddenAgain=await req('/api/listings/'+id);
  assert.equal(hiddenAgain.status,404,'Material edits should require re-moderation');

  const queueAgain=await req('/api/moderation/queue?communityId='+circleId);
  assert.ok(queueAgain.body.items.some(x=>x.listing_id===id));
  const approvedAgain=await req('/api/placements/'+placement.placement_id+'/moderate',{method:'POST',body:{decision:'approved'}});
  assert.equal(approvedAgain.status,200);
  const sold=await req('/api/listings/'+id+'/sold',{method:'POST'});
  assert.equal(sold.status,200);
  const soldAgain=await req('/api/listings/'+id+'/sold',{method:'POST'});
  assert.equal(soldAgain.status,409);
  const notVisible=await req('/api/listings/'+id);
  assert.equal(notVisible.status,404);
  console.log('Write-path integration passed: auth, idempotent create, submit, queue, approve, edit re-review, sold');
}finally{
 server.kill('SIGTERM');
 await sleep(100);
}
