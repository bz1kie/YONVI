import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_PHOTOS, MEDIA_TYPES, validatePhoto, matchesPhotoMagic } from './photo-policy.mjs';

type Auth = (request: FastifyRequest)=>string|null;
const uuid=z.string().uuid();
const startSchema=z.object({listingId:uuid,contentType:z.enum(['image/jpeg','image/png','image/webp']),size:z.number().int().min(64).max(5*1024*1024)}).strict();

export function registerPhotoRoutes(app:FastifyInstance,pool:Pool,auth:Auth){
 const bucket=process.env.S3_BUCKET;
 const endpoint=process.env.S3_ENDPOINT;
 const region=process.env.S3_REGION||'us-east-1';
 const accessKeyId=process.env.S3_ACCESS_KEY_ID;
 const secretAccessKey=process.env.S3_SECRET_ACCESS_KEY;
 // Never silently fall back to a public unauthenticated upload or mock credentials.
 const enabled=Boolean(bucket&&endpoint&&accessKeyId&&secretAccessKey);
 const client=enabled?new S3Client({
   region,endpoint,forcePathStyle:true,credentials:{accessKeyId:accessKeyId!,secretAccessKey:secretAccessKey!},
 }):null;

 app.post('/api/media/uploads',async(req,reply)=>{
  const userId=auth(req);
  if(!userId)return reply.code(401).send({error:'Authentication required'});
  if(!client||!bucket)return reply.code(503).send({error:'Photo storage not configured'});
  const parsed=startSchema.safeParse(req.body);
  if(!parsed.success||!validatePhoto(parsed.data?.contentType,parsed.data?.size))
   return reply.code(400).send({error:'Invalid image metadata'});
  const {listingId,contentType,size}=parsed.data!;
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const own=await db.query(
     'SELECT id,status FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',
     [listingId,userId]);
   if(!own.rows.length){await db.query('ROLLBACK');return reply.code(404).send({error:'Listing not found'});}
   if(!['draft','active'].includes(own.rows[0].status)){
    await db.query('ROLLBACK');return reply.code(409).send({error:'Listing cannot receive photos'});
   }
   const count=await db.query('SELECT count(*)::integer AS n FROM listing_media WHERE listing_id=$1',[listingId]);
   if(count.rows[0].n>=MAX_PHOTOS){
    await db.query('ROLLBACK');return reply.code(409).send({error:'Photo limit reached'});
   }
   const mediaId=randomUUID();
   const key='listings/'+listingId+'/'+mediaId+'.'+MEDIA_TYPES[contentType];
   const media=await db.query(
    `INSERT INTO listing_media(id,listing_id,storage_key,content_type,bytes,upload_status,sort_order)
     VALUES($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
    [mediaId,listingId,key,contentType,size,count.rows[0].n]);
   await db.query('COMMIT');
   try{
    const uploadUrl=await getSignedUrl(client,new PutObjectCommand({
      Bucket:bucket,Key:key,ContentType:contentType,ContentLength:size,
    }),{expiresIn:300});
    reply.header('Cache-Control','no-store');
    return {mediaId:media.rows[0].id,uploadUrl,method:'PUT',headers:{'Content-Type':contentType},expiresIn:300};
   }catch(error){
    await pool.query("DELETE FROM listing_media WHERE id=$1 AND upload_status='pending'",[mediaId]);
    throw error;
   }
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally{db.release();}
 });

 app.post('/api/media/:id/confirm',async(req,reply)=>{
  const userId=auth(req);
  if(!userId)return reply.code(401).send({error:'Authentication required'});
  if(!client||!bucket)return reply.code(503).send({error:'Photo storage not configured'});
  const id=(req.params as {id:string}).id;
  if(!uuid.safeParse(id).success)return reply.code(400).send({error:'Invalid media ID'});
  const {rows}=await pool.query(
    `SELECT m.id,m.storage_key,m.content_type,m.bytes,m.upload_status,l.id AS listing_id
     FROM listing_media m JOIN listings l ON l.id=m.listing_id
     WHERE m.id=$1 AND l.seller_id=$2 AND l.status IN ('draft','active')`,[id,userId]);
  if(!rows.length)return reply.code(404).send({error:'Media not found'});
  const media=rows[0];
  if(media.upload_status==='ready')return {ok:true,photoUrl:'/api/media/'+id};
  let head;
  try{head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:media.storage_key}));}
  catch{return reply.code(409).send({error:'Uploaded object not found'});}
  if(head.ContentType!==media.content_type || Number(head.ContentLength)!==Number(media.bytes))
    return reply.code(422).send({error:'Image type or size mismatch'});
  // Validate signature bytes, not just client-supplied Content-Type headers.
  const object=await client.send(new GetObjectCommand({
    Bucket:bucket,Key:media.storage_key,Range:'bytes=0-31',
  }));
  const first=await object.Body?.transformToByteArray();
  if(!first||!matchesPhotoMagic(media.content_type,first))
    return reply.code(422).send({error:'Invalid image format'});
  // Material image changes require re-moderation.
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const listed=await db.query('SELECT status FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',[media.listing_id,userId]);
   if(!listed.rows.length||!['draft','active'].includes(listed.rows[0].status)){
    await db.query('ROLLBACK');return reply.code(409).send({error:'Listing cannot be updated'});
   }
   await db.query("UPDATE listing_media SET upload_status='ready' WHERE id=$1 AND upload_status='pending'",[id]);
   await db.query("UPDATE placements SET status='pending',reviewed_by=NULL,reviewed_at=NULL WHERE listing_id=$1 AND status='approved'",[media.listing_id]);
   await db.query('COMMIT');
   return {ok:true,photoUrl:'/api/media/'+id};
  }catch(error){await db.query('ROLLBACK');throw error;}
  finally{db.release();}
 });

 app.get('/api/media/:id',async(req,reply)=>{
  if(!client||!bucket)return reply.code(503).send({error:'Photo storage not configured'});
  const id=(req.params as {id:string}).id;
  if(!uuid.safeParse(id).success)return reply.code(400).send({error:'Invalid media ID'});
  const userId=auth(req);
  const {rows}=await pool.query(
    `SELECT m.storage_key,m.content_type,m.bytes FROM listing_media m
     JOIN listings l ON l.id=m.listing_id
     WHERE m.id=$1 AND m.upload_status='ready'
       AND (l.seller_id=$2 OR
           (l.status='active' AND EXISTS (
             SELECT 1 FROM placements p WHERE p.listing_id=l.id AND p.status='approved'
           ))) LIMIT 1`,[id,userId]);
  if(!rows.length)return reply.code(404).send({error:'Media not found'});
  try{
    const data=await client.send(new GetObjectCommand({Bucket:bucket,Key:rows[0].storage_key}));
    reply.header('Content-Type',rows[0].content_type);
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('Cache-Control','private, max-age=60');
    const body=data.Body;
    if(!body)return reply.code(502).send({error:'Storage returned no data'});
    return reply.send(Readable.fromWeb(body.transformToWebStream() as any));
  }catch(error){
    req.log.error(error);
    return reply.code(502).send({error:'Photo unavailable'});
  }
 });
}
