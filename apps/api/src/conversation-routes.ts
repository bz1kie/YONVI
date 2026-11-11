import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
type Auth=(request:FastifyRequest)=>string|null|undefined;
const uuid=z.string().uuid();
export function registerConversationRoutes(app:FastifyInstance,pool:Pool,auth:Auth){
 app.get('/api/me/message-notifications',async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({error:'Войдите через MAX.'});
  const row=await pool.query("SELECT message_notifications AS enabled,(SELECT status FROM conversation_notifications n WHERE n.recipient_id=users.id ORDER BY n.message_id DESC LIMIT 1) AS last_status FROM users WHERE id=$1",[user]);return row.rows[0]||{enabled:false};
 });
 app.put('/api/me/message-notifications',async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({error:'Войдите через MAX.'});
  const data=z.object({enabled:z.boolean()}).strict().safeParse(req.body);if(!data.success)return reply.code(400).send({error:'Некорректная настройка.'});
  await pool.query('UPDATE users SET message_notifications=$1 WHERE id=$2',[data.data.enabled,user]);return data.data;
 });
 app.post('/api/conversations',async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({error:'Войдите через MAX, чтобы написать продавцу.'});
  const data=z.object({listingId:uuid}).strict().safeParse(req.body);
  if(!data.success)return reply.code(400).send({error:'Некорректное объявление.'});
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user]);
   const recent=await db.query("SELECT count(*)::int AS n FROM conversations WHERE buyer_id=$1 AND created_at>now()-interval '1 minute'",[user]);
   if(recent.rows[0].n>=20){await db.query('ROLLBACK');return reply.code(429).send({error:'Подождите минуту перед созданием нового диалога.'});}
   const listing=await db.query(`SELECT l.seller_id FROM listings l WHERE l.id=$1 AND l.status='active'
    AND EXISTS(SELECT 1 FROM placements p JOIN communities c ON c.id=p.community_id WHERE p.listing_id=l.id AND p.status='approved' AND c.visibility='public') FOR SHARE OF l`,[data.data.listingId]);
   if(!listing.rows.length){await db.query('ROLLBACK');return reply.code(404).send({error:'Объявление недоступно.'});}
   if(listing.rows[0].seller_id===user){await db.query('ROLLBACK');return reply.code(409).send({error:'Это ваше объявление. Ответы покупателей будут в разделе «Сообщения».'});}
   const row=await db.query(`INSERT INTO conversations(listing_id,buyer_id,seller_id) VALUES($1,$2,$3)
    ON CONFLICT(listing_id,buyer_id) DO UPDATE SET listing_id=EXCLUDED.listing_id RETURNING id`,[data.data.listingId,user,listing.rows[0].seller_id]);
   await db.query('COMMIT');return {id:row.rows[0].id};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
 app.get('/api/conversations',async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({error:'Войдите через MAX, чтобы открыть сообщения.'});
  const rows=await pool.query(`SELECT c.id,l.title,l.status AS listing_status,
   CASE WHEN c.buyer_id=$1 THEN seller.nickname ELSE buyer.nickname END AS partner_name,c.updated_at,
   (SELECT text FROM conversation_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_message
   FROM conversations c JOIN listings l ON l.id=c.listing_id JOIN users seller ON seller.id=c.seller_id JOIN users buyer ON buyer.id=c.buyer_id
   WHERE c.buyer_id=$1 OR c.seller_id=$1 ORDER BY c.updated_at DESC LIMIT 100`,[user]);return {items:rows.rows};
 });
 app.get('/api/conversations/:id/messages',async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({error:'Войдите через MAX.'});
  const id=(req.params as {id:string}).id;if(!uuid.safeParse(id).success)return reply.code(400).send({error:'Некорректный диалог.'});
  const member=await pool.query('SELECT id FROM conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)',[id,user]);
  if(!member.rows.length)return reply.code(404).send({error:'Диалог недоступен.'});
  const rows=await pool.query(`SELECT id::text,text,sender_id=$2 AS mine,created_at FROM conversation_messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 100`,[id,user]);
  return {items:rows.rows.reverse()};
 });
 app.post('/api/conversations/:id/messages',async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({error:'Войдите через MAX.'});
  const id=(req.params as {id:string}).id;
  const data=z.object({text:z.string().trim().min(1).max(2000),requestKey:uuid}).strict().safeParse(req.body);
  if(!uuid.safeParse(id).success||!data.success)return reply.code(400).send({error:'Введите сообщение до 2000 символов.'});
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user]);
   const member=await db.query('SELECT id FROM conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2) FOR UPDATE',[id,user]);
   if(!member.rows.length){await db.query('ROLLBACK');return reply.code(404).send({error:'Диалог недоступен.'});}
   const previous=await db.query('SELECT id::text,text,true AS mine,created_at FROM conversation_messages WHERE conversation_id=$1 AND sender_id=$2 AND request_key=$3',[id,user,data.data.requestKey]);
   if(previous.rows.length){await db.query('COMMIT');return previous.rows[0];}
   const count=await db.query("SELECT count(*)::int AS n FROM conversation_messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",[user]);
   if(count.rows[0].n>=20){await db.query('ROLLBACK');return reply.code(429).send({error:'Слишком много сообщений. Подождите минуту.'});}
   const result=await db.query('INSERT INTO conversation_messages(conversation_id,sender_id,text,request_key) VALUES($1,$2,$3,$4) RETURNING id::text,text,true AS mine,created_at',[id,user,data.data.text,data.data.requestKey]);
   await db.query(`INSERT INTO conversation_notifications(message_id,recipient_id)
    SELECT $1,u.id FROM conversations c JOIN users u ON u.id=CASE WHEN c.buyer_id=$3 THEN c.seller_id ELSE c.buyer_id END
    WHERE c.id=$2 AND u.message_notifications=true ON CONFLICT DO NOTHING`,[result.rows[0].id,id,user]);
   await db.query('UPDATE conversations SET updated_at=now() WHERE id=$1',[id]);await db.query('COMMIT');return reply.code(201).send(result.rows[0]);
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
}
