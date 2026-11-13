import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { signMaxFixture } from '../apps/api/dist/max-auth.js';
import pg from 'pg';

const origin='http://localhost:5173';
const root='http://127.0.0.1:3104';
const token='CI-only-bot-token-no-production-secrets';
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
  stdio:['ignore','ignore','pipe'],
  env:{...process.env,PORT:'3104',NODE_ENV:'test',ALLOW_DEMO_AUTH:'false',MAX_BOT_TOKEN:token,WEB_ORIGIN:origin},
});
let stderr='';
child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
async function send(path,{method='GET',body,cookie,requestOrigin}={}){
  const headers={Accept:'application/json'};
  if(body)headers['Content-Type']='application/json';
  if(cookie)headers.Cookie=cookie;
  if(requestOrigin)headers.Origin=requestOrigin;
  const response=await fetch(root+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,headers:response.headers,data:await response.json().catch(()=>({}))};
}
try{
 let ready=false;
 for(let i=0;i<70;i++){
   if(child.exitCode!==null)throw new Error('API stopped: '+stderr);
   try{const response=await send('/health');if(response.status===200){ready=true;break;}}catch{}
   await sleep(120);
 }
 assert.ok(ready,'Server did not start: '+stderr);
 assert.equal((await send('/api/auth/me')).status,401);
 const now=Math.floor(Date.now()/1000);
 const initData=signMaxFixture({
  auth_date:String(now),
  query_id:'ci-session',
  user:JSON.stringify({id:67890,first_name:'Йори',last_name:'Тест'}),
 },token);
 const rejected=await send('/api/auth/max',{method:'POST',requestOrigin:origin,body:{initData:initData.replace('67890','99999')}});
 assert.equal(rejected.status,401);
 const foreign=await send('/api/auth/max',{method:'POST',requestOrigin:'https://evil.example',body:{initData}});
 assert.equal(foreign.status,403);

 const loggedIn=await send('/api/auth/max',{method:'POST',requestOrigin:origin,body:{initData}});
 assert.equal(loggedIn.status,200,JSON.stringify(loggedIn.data));
 const setCookie=loggedIn.headers.get('set-cookie')||'';
 assert.match(setCookie,/yorvi_session=[a-f0-9]{64}/);
 assert.match(setCookie,/HttpOnly/i);
 assert.match(setCookie,/SameSite=Strict/i);
 const cookie=setCookie.split(';')[0];
 const current=await send('/api/auth/me',{cookie});
 assert.equal(current.status,200);
 assert.equal(current.data.user.nickname,'Йори Тест');

 const fakeUser=await fetch(root+'/api/me/listings',{headers:{'x-demo-user-id':current.data.user.id}});
 assert.equal(fakeUser.status,401,'Demo header must be disabled');
 const forbidden=await send('/api/listings',{method:'POST',cookie,body:{
   title:'Тест MAX',description:'Новый товар',priceKopecks:10000,
   city:'Воронеж',category:'electronics',requestKey:crypto.randomUUID(),
 }});
 assert.equal(forbidden.status,403,'Cookie writes must validate Origin');

 const listing=await send('/api/listings',{method:'POST',cookie,requestOrigin:origin,body:{
   title:'Тест MAX',description:'Новый товар',priceKopecks:10000,
   city:'Воронеж',category:'electronics',requestKey:crypto.randomUUID(),
 }});
 assert.equal(listing.status,201,JSON.stringify(listing.data));
 const mine=await send('/api/me/listings',{cookie});
 assert.equal(mine.status,200);
 assert.ok(mine.data.items.some(x=>x.id===listing.data.id));

 const rawToken=cookie.split('=')[1];
 const sessionRows=await pool.query('SELECT token_hash FROM user_sessions WHERE user_id=$1',[current.data.user.id]);
 assert.equal(sessionRows.rows.length,1);
 assert.notEqual(sessionRows.rows[0].token_hash,rawToken,'Raw cookie must never be persisted');
 // Browser handoff: the public code cannot be used to claim the session.
 assert.equal((await send('/api/auth/browser/start',{method:'POST'})).status,403);
 const begin=await send('/api/auth/browser/start',{method:'POST',requestOrigin:origin});
 assert.equal(begin.status,200);
 const pairCookie=begin.headers.get('set-cookie').split(';')[0];
 assert.match(begin.data.code,/^[A-F0-9]{12}$/);
 assert.equal((await send('/api/auth/browser/confirm',{method:'POST',requestOrigin:origin,body:{code:begin.data.code}})).status,401);
 assert.equal((await send('/api/auth/browser/poll',{method:'POST',requestOrigin:origin})).status,401);
 assert.equal((await send('/api/auth/browser/poll',{method:'POST',requestOrigin:origin,cookie:pairCookie})).data.authenticated,false);
 const approval=await send('/api/auth/browser/confirm',{method:'POST',requestOrigin:origin,cookie,body:{code:begin.data.code}});
 assert.equal(approval.status,200);
 assert.equal((await send('/api/auth/browser/confirm',{method:'POST',requestOrigin:origin,cookie,body:{code:begin.data.code}})).status,400);
 const claimed=await send('/api/auth/browser/poll',{method:'POST',requestOrigin:origin,cookie:pairCookie});
 assert.equal(claimed.data.authenticated,true);
 const browserCookie=claimed.headers.getSetCookie().find(v=>v.startsWith('yorvi_session=')).split(';')[0];
 assert.equal((await send('/api/auth/me',{cookie:browserCookie})).data.user.id,current.data.user.id);
 assert.equal((await send('/api/auth/browser/poll',{method:'POST',requestOrigin:origin,cookie:pairCookie})).status,410);
 await send('/api/auth/logout',{method:'POST',requestOrigin:origin,cookie:browserCookie});
 const expired=await send('/api/auth/browser/start',{method:'POST',requestOrigin:origin});
 await pool.query("UPDATE browser_login_requests SET expires_at=now()-interval '1 second'");
 assert.equal((await send('/api/auth/browser/confirm',{method:'POST',requestOrigin:origin,cookie,body:{code:expired.data.code}})).status,400);
 const logout=await send('/api/auth/logout',{method:'POST',cookie,requestOrigin:origin});
 assert.equal(logout.status,200);
 assert.equal((await send('/api/auth/me',{cookie})).status,401,'Logout must revoke token at DB');
 console.log('MAX auth integration passed: signed login, forged data, origin/CSRF, cookie session, owner writes, logout');
}finally{
 child.kill('SIGTERM');
 await pool.end();
}
