import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyMaxInitData, signMaxFixture, InvalidMaxData } from '../apps/api/dist/max-auth.js';

const token='unit-test-token-not-a-real-secret';
const now=1_800_000_000;
const base={
  auth_date:String(now),
  query_id:'fictional-launch-123',
  user:JSON.stringify({id:67890,first_name:'Йори',last_name:'Тест'}),
};
const signed=()=>signMaxFixture({...base},token);

test('MAX: authentic signed launch returns verified user',()=>{
  const user=verifyMaxInitData(signed(),token,{nowSeconds:now});
  assert.equal(user.maxUserId,'67890');
  assert.equal(user.displayName,'Йори Тест');
});
test('MAX: rejects tampering with user id',()=>{
  const attack=signed().replace('67890','99999');
  assert.throws(()=>verifyMaxInitData(attack,token,{nowSeconds:now}),InvalidMaxData);
});
test('MAX: rejects incorrect token',()=>{
  assert.throws(()=>verifyMaxInitData(signed(),'wrong-key',{nowSeconds:now}),InvalidMaxData);
});
test('MAX: rejects duplicate fields',()=>{
  assert.throws(()=>verifyMaxInitData(signed()+'&user=another',{nowSeconds:now}),InvalidMaxData);
  assert.throws(()=>verifyMaxInitData(signed()+'&hash='+('f'.repeat(64)),token,{nowSeconds:now}),InvalidMaxData);
});
test('MAX: rejects stale or future login',()=>{
  assert.throws(()=>verifyMaxInitData(signed(),token,{nowSeconds:now+3601}),InvalidMaxData);
  assert.throws(()=>verifyMaxInitData(signed(),token,{nowSeconds:now-61}),InvalidMaxData);
});
test('MAX: rejects unsafe int64 IDs instead of rounding',()=>{
  const value=signMaxFixture({...base,user:'{"id":9007199254740993,"first_name":"Big"}'},token);
  assert.throws(()=>verifyMaxInitData(value,token,{nowSeconds:now}),InvalidMaxData);
});
test('MAX: rejects empty hash and malformed user',()=>{
  assert.throws(()=>verifyMaxInitData('user=x&hash=',token,{nowSeconds:now}),InvalidMaxData);
  const value=signMaxFixture({...base,user:'bad json'},token);
  assert.throws(()=>verifyMaxInitData(value,token,{nowSeconds:now}),InvalidMaxData);
});
