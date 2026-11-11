import test from 'node:test';
import assert from 'node:assert/strict';
import {connectConfiguredChannel} from '../apps/api/dist/max-channel.js';
process.env.MAX_CHANNEL_ID='123';
process.env.MAX_CHANNEL_URL='https://max.ru/example';
process.env.MAX_BOT_TOKEN='test-only';
function mockMax(admin=true){
 global.fetch=async(url,init)=>{
  assert.equal(init.headers.Authorization,'test-only');
  assert.equal(init.method,undefined,'Connection must never send posts');
  const path=new URL(url).pathname;
  const data=path==='/chats/123'?{chat_id:123,type:'channel',status:'active',title:'Example'}:path==='/me'?{user_id:2}:path.endsWith('/admins')?{members:[{user_id:1,is_owner:true,is_admin:true},{user_id:2,is_admin:admin}]}:{is_admin:admin};
  return {ok:true,json:async()=>data};
 };
}
test('Reject another authenticated user before changing a circle',async()=>{
 mockMax();let mutated=false;
 const pool={query:async()=>({rows:[{id:'owner'}]}),connect:async()=>{mutated=true;throw Error('Unexpected write');}};
 await assert.rejects(connectConfiguredChannel(pool,'other'),/только его владелец/);
 assert.equal(mutated,false);
});
test('Reject bot without channel administrator rights',async()=>{
 mockMax(false);
 const pool={query:async()=>{throw Error('Should not query database');}};
 await assert.rejects(connectConfiguredChannel(pool,'owner'),/администратором/);
});
test('A verified owner links their only existing circle without publishing',async()=>{
 mockMax();const queries=[];
 const client={query:async(sql)=>{queries.push(sql);return {rows:sql.startsWith('SELECT id FROM communities')?[{id:'circle'}]:[]};},release(){}};
 const result=await connectConfiguredChannel({query:async()=>({rows:[{id:'owner'}]}),connect:async()=>client},'owner');
 assert.equal(result.communityId,'circle');assert.equal(result.connected,true);
 assert(queries.some(sql=>sql.startsWith('INSERT INTO max_channel_links')));
 assert(!queries.some(sql=>sql.startsWith('INSERT INTO communities')));
});

test('Report authentication failure before suggesting channel administrator rights',async()=>{
 global.fetch=async()=>({ok:false,status:401});
 await assert.rejects(connectConfiguredChannel({},'owner'),/MAX_HTTP_401.*бот/);
});
test('Distinguish TLS failure from missing channel membership',async()=>{
 global.fetch=async()=>{throw Object.assign(new Error('fetch failed'),{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}});};
 await assert.rejects(connectConfiguredChannel({},'owner'),/MAX_TLS/);
});
