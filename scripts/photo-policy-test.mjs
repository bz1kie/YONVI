import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhoto,matchesPhotoMagic,MAX_PHOTOS,MAX_PHOTO_SIZE} from '../apps/api/dist/photo-policy.mjs';

test('accepted photo formats, byte boundaries',()=>{
 for(const type of ['image/jpeg','image/png','image/webp']){
  assert.equal(validatePhoto(type,64),true);
  assert.equal(validatePhoto(type,MAX_PHOTO_SIZE),true);
  for(const size of [0,63,MAX_PHOTO_SIZE+1,3.14,-1,NaN,'400'])
   assert.equal(validatePhoto(type,size),false,String(size));
 }
 for(const type of ['image/svg+xml','text/html','image/gif','image/heic','','IMAGE/JPEG'])
  assert.equal(validatePhoto(type,500),false);
});
test('JPEG PNG WebP magic checked from actual object',()=>{
 const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0]);
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13]);
 const webp=Buffer.from('RIFF1234WEBPxxxx');
 assert.equal(matchesPhotoMagic('image/jpeg',jpeg),true);
 assert.equal(matchesPhotoMagic('image/png',png),true);
 assert.equal(matchesPhotoMagic('image/webp',webp),true);
 assert.equal(matchesPhotoMagic('image/png',jpeg),false);
 assert.equal(matchesPhotoMagic('image/webp',png),false);
 assert.equal(matchesPhotoMagic('image/jpeg',Buffer.from('<html>hello!')),false);
 assert.equal(matchesPhotoMagic('image/jpeg',Buffer.alloc(0)),false);
});
test('photo count capped',()=>assert.equal(MAX_PHOTOS,10));
