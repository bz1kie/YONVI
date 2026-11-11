import test from 'node:test';
import assert from 'node:assert/strict';
import {publishApproved,channelPost} from '../apps/api/dist/max-publish.js';
const listing={id:'123',title:'Лямбда',description:'Описание',city:'Воронеж',price_kopecks:200000,chat_id:'-123'};
function pool(status){
 const calls=[];let state='pending';
 const db={query:async(sql,args=[])=>{calls.push([sql,args]);if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.startsWith('SELECT placement_id'))return {rows:state==='pending'?[{placement_id:'p'}]:[]};if(sql.startsWith('SELECT l.id'))return {rows:status==='approved'?[listing]:[]};if(sql.includes("SET status='sending'"))state='sending';if(sql.includes('SET status=$2'))state=args[1];return {rows:[]};},release(){}};
 return {connect:async()=>db,calls,get state(){return state;}};
}
process.env.MAX_YONVI_TOKEN='test';process.env.WEB_ORIGIN='https://example.com';
test('plain text post limits description and links to listing',()=>{const p=channelPost({...listing,description:'x'.repeat(5000)},'https://example.com');assert.ok(p.text.length<4000);assert.equal(p.attachments[0].payload.buttons[0][0].url,'https://example.com/?listing=123');});
test('accepted post is recorded and not sent twice',async()=>{const p=pool('approved');let sent=0;globalThis.fetch=async()=>{sent++;return new Response(JSON.stringify({message:{body:{mid:'mid'}}}),{status:200});};await publishApproved(p);await publishApproved(p);assert.equal(sent,1);assert.equal(p.state,'sent');});
test('withdrawn approval is not sent',async()=>{const p=pool('pending');globalThis.fetch=async()=>{throw Error('must not send');};await publishApproved(p);assert.ok(p.calls.some(([sql])=>sql.includes("status='cancelled'")));});
test('network uncertainty never retries automatically',async()=>{const p=pool('approved');let sent=0;globalThis.fetch=async()=>{sent++;throw Error('timeout');};await publishApproved(p);await publishApproved(p);assert.equal(sent,1);assert.ok(p.calls.some(([sql])=>sql.includes("status='unknown'")));});
