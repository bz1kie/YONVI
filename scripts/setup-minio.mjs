import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { setTimeout as sleep } from 'node:timers/promises';

const endpoint=process.env.S3_ENDPOINT||'http://127.0.0.1:9000';
const bucket=process.env.S3_BUCKET||'yorvi-private';
const accessKeyId=process.env.S3_ACCESS_KEY_ID||'yorvi_local_access';
const secretAccessKey=process.env.S3_SECRET_ACCESS_KEY||'yorvi_local_secret_change_before_deploy';
const s3=new S3Client({
 endpoint, region:process.env.S3_REGION||'us-east-1',
 forcePathStyle:true, credentials:{accessKeyId,secretAccessKey},
 maxAttempts:2
});
let ready=false;
for(let i=0;i<35;i++){
 try{
  await s3.send(new HeadBucketCommand({Bucket:bucket}));
  ready=true;break;
 }catch(e){
  const status=e?.$metadata?.httpStatusCode;
  if(status===404){
   try{
    await s3.send(new CreateBucketCommand({Bucket:bucket}));
    ready=true;break;
   }catch(e2){if(e2?.name==='BucketAlreadyOwnedByYou'){ready=true;break;}throw e2;}
  }
  if(i===34)throw Error('MinIO unavailable: '+String(e));
  await sleep(500);
 }
}
if(!ready)throw Error('MinIO is not ready');
console.log('MinIO private bucket is ready: '+bucket);
