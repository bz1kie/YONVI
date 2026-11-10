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
test('MAX: preserves signed int64 IDs without rounding',()=>{
  for (const id of ['9007199254740993','9223372036854775807']) {
    const value=signMaxFixture({...base,user:'{"id":'+id+',"first_name":"Big"}'},token);
    assert.equal(verifyMaxInitData(value,token,{nowSeconds:now}).maxUserId,id);
  }
});
test('MAX: rejects malformed or conflicting user identifiers',()=>{
  const malformed=[
    '{"id":9223372036854775808}',
    '{"id":-10}',
    '{"id":0}',
    '{"id":"9007199254740993"}',
    '{"id":1e5}',
    '{"id":1,"id":2}',
    '{"payload":{"id":1}}',
    '{"id":1.5}',
    '{"id":10,"nickname":"ok","nested":{"id":999}}',
  ];
  for(const json of malformed) {
    const value=signMaxFixture({...base,user:json},token);
    // Nested id is legitimate, and must not overwrite top-level identity.
    if(json.includes('"nested"')) {
      assert.equal(verifyMaxInitData(value,token,{nowSeconds:now}).maxUserId,'10');
    } else {
      assert.throws(()=>verifyMaxInitData(value,token,{nowSeconds:now}),InvalidMaxData,json);
    }
  }
});
test('MAX: rejects empty hash and malformed user',()=>{
  assert.throws(()=>verifyMaxInitData('user=x&hash=',token,{nowSeconds:now}),InvalidMaxData);
  const value=signMaxFixture({...base,user:'bad json'},token);
  assert.throws(()=>verifyMaxInitData(value,token,{nowSeconds:now}),InvalidMaxData);
});
