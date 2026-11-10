export const MAX_PHOTOS=10;
export const MAX_PHOTO_SIZE=5*1024*1024;
export const MEDIA_TYPES=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'});
export function validatePhoto(type,bytes){
 return typeof type==='string'&&Object.hasOwn(MEDIA_TYPES,type) &&
  Number.isSafeInteger(bytes)&&bytes>=64&&bytes<=MAX_PHOTO_SIZE;
}
export function matchesPhotoMagic(type,header){
 if(!header||header.length<12)return false;
 if(type==='image/jpeg')return header[0]===0xff&&header[1]===0xd8&&header[2]===0xff;
 if(type==='image/png')return Buffer.from(header.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(type==='image/webp')return Buffer.from(header.subarray(0,4)).toString()==='RIFF' &&
  Buffer.from(header.subarray(8,12)).toString()==='WEBP';
 return false;
}
