import {conditionSchema,attributesSchema} from './listing-details.js';
import { sendConversationNotifications } from './conversation-notifications.js';
import { registerConversationRoutes } from './conversation-routes.js';
import { publishApproved } from './max-publish.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { connectConfiguredChannel } from './max-channel.js';
import pg from 'pg';
import { z } from 'zod';
import { canModerate } from './domain.mjs';
import { registerMarketplaceRoutes } from './marketplace-routes.js';
import { registerMaxAuthentication, currentUserId } from './max-session.js';
import { registerPhotoRoutes } from './photo-routes.js';
import { registerFavoritesRoutes } from './favorites-routes.js';

const app=Fastify({logger:true});
const connectionString=process.env.DATABASE_URL || (!process.env.PGHOST && process.env.NODE_ENV !== 'production' ? 'postgresql://yorvi:yorvi_local_password@localhost:5432/yorvi' : undefined);
if (process.env.NODE_ENV === 'production' && !connectionString && !process.env.PGHOST) {
  throw new Error('Production PostgreSQL connection is not configured');
}
const pool=new pg.Pool(connectionString ? {connectionString} : {});
await app.register(cors,{origin:process.env.WEB_ORIGIN || 'http://localhost:5173'});


app.post('/api/ai/recognize-product',{bodyLimit:6*1024*1024},async(req,reply)=>{
 const userId=auth(req);if(!userId)return reply.code(401).send({error:'Требуется авторизация'});
 const parsed=z.object({image:z.string().max(5_600_000),mimeType:z.enum(['image/jpeg','image/png','image/webp'])}).safeParse(req.body);
 if(!parsed.success||!/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.data.image))return reply.code(400).send({error:'Некорректная фотография'});
 const key=process.env.GEMINI_API_KEY;
 if(!key)return reply.code(503).send({error:'Распознавание временно недоступно'});
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),18000);
  let response:Response;
  try{response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
   method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':key},
   body:JSON.stringify({contents:[{parts:[{text:'Определи товар на фотографии для объявления о продаже. Смотри на сам предмет и используй читаемую маркировку только для уточнения модели. Не придумывай бренд, модель или характеристики. Верни только JSON с полями title (краткое конкретное название на русском до 90 символов) и category (строго одно из electronics, gaming, fashion, home, transport, hobby, auto). Если предмет нельзя определить, title должен быть пустой строкой.'},{inline_data:{mime_type:parsed.data.mimeType,data:parsed.data.image}}]}],generationConfig:{responseMimeType:'application/json',temperature:0.1,maxOutputTokens:200}})});
  }finally{clearTimeout(timeout);}
  if(!response.ok){req.log.warn({status:response.status},'Gemini recognition failed');return reply.code(502).send({error:'Сервис распознавания временно недоступен'});}
  const data=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
  const raw=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  const result=z.object({title:z.string().max(120),category:z.enum(['electronics','gaming','fashion','home','transport','hobby','auto'])}).safeParse(JSON.parse(raw));
  if(!result.success)return reply.code(502).send({error:'Не удалось определить товар'});
  return {title:result.data.title.trim(),category:result.data.category};
 }catch(e){req.log.warn({message:e instanceof Error?e.message:'Unknown'},'Gemini request failed');return reply.code(502).send({error:'Не удалось распознать фотографию'});}
});

app.get('/health',async()=>({ok:true,service:'yorvi-api',version:'2.0.0-alpha.1'}));
registerMaxAuthentication(app,pool);
const auth=currentUserId;

app.get('/api/me/managed-communities',async(req,reply)=>{
 const user=auth(req);if(!user)return reply.code(401).send({error:'Unauthorized'});
 const result=await pool.query(`SELECT DISTINCT c.id,c.name,c.city FROM communities c LEFT JOIN community_roles r ON r.community_id=c.id AND r.user_id=$1 WHERE c.owner_id=$1 OR r.role IN ('owner','moderator') ORDER BY c.name`,[user]);return {items:result.rows};
});
app.get('/api/me/contact',async(req,reply)=>{
 const userId=auth(req);if(!userId)return reply.code(401).send({error:'Unauthorized'});
 const result=await pool.query('SELECT max_contact_url FROM users WHERE id=$1',[userId]);
 return {url:result.rows[0]?.max_contact_url||''};
});
app.put('/api/me/contact',async(req,reply)=>{
 const userId=auth(req);if(!userId)return reply.code(401).send({error:'Unauthorized'});
 const data=z.object({url:z.string().trim().max(280).refine(value=>value===''||/^https:\/\/max\.ru\/u\/[A-Za-z0-9_-]{1,256}$/.test(value))}).strict().safeParse(req.body);
 if(!data.success)return reply.code(400).send({error:'Вставьте полную ссылку на личный профиль вида https://max.ru/u/…'});
 await pool.query('UPDATE users SET max_contact_url=$1 WHERE id=$2',[data.data.url||null,userId]);
 return {url:data.data.url};
});

app.get('/api/listings',async(req,reply)=>{
  const q=z.object({city:z.string().max(80).optional(),category:z.string().max(50).optional(),search:z.string().max(100).optional(),communityId:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).safeParse(req.query);
  if(!q.success)return reply.code(400).send({error:'Invalid query'});
  const {city,category,search,communityId,limit}=q.data;
  const {rows}=await pool.query(`SELECT l.id,l.title,l.description,l.price_kopecks,l.city,l.category,l.item_condition,l.attributes,l.created_at, u.nickname AS seller_name,u.max_contact_url AS seller_contact_url, media.photo_url FROM listings l JOIN users u ON u.id=l.seller_id
  LEFT JOIN LATERAL (
    SELECT '/api/media/' || m.id::text AS photo_url
    FROM listing_media m WHERE m.listing_id=l.id AND m.upload_status='ready'
    ORDER BY m.sort_order,m.created_at LIMIT 1
  ) media ON true WHERE l.status='active' AND EXISTS (SELECT 1 FROM placements p JOIN communities c ON c.id=p.community_id
      WHERE p.listing_id=l.id AND p.status='approved' AND c.visibility='public'
        AND ($5::uuid IS NULL OR p.community_id=$5))
    AND ($1::text IS NULL OR l.city=$1)
    AND ($2::text IS NULL OR l.category=$2)
    AND ($3::text IS NULL OR l.title ILIKE '%'||$3||'%')
    ORDER BY l.created_at DESC LIMIT $4`,[city||null,category||null,search||null,limit,communityId||null]);
  return {items:rows};
});
app.get('/api/listings/:id',async(req,reply)=>{
  const id=(req.params as {id:string}).id;
  if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Invalid id'});
  const {rows}=await pool.query(`SELECT l.id,l.title,l.description,l.price_kopecks,l.city,l.category,l.item_condition,l.attributes,l.created_at,u.nickname AS seller_name,u.max_contact_url AS seller_contact_url, media.photo_url,
  COALESCE((SELECT json_agg(json_build_object('id',im.id,'url','/api/media/' || im.id::text) ORDER BY im.sort_order,im.created_at)
    FROM listing_media im WHERE im.listing_id=l.id AND im.upload_status='ready'),'[]'::json) AS images FROM listings l JOIN users u ON u.id=l.seller_id
  LEFT JOIN LATERAL (
    SELECT '/api/media/' || m.id::text AS photo_url
    FROM listing_media m WHERE m.listing_id=l.id AND m.upload_status='ready'
    ORDER BY m.sort_order,m.created_at LIMIT 1
  ) media ON true WHERE l.id=$1 AND l.status=$2 AND EXISTS (SELECT 1 FROM placements p JOIN communities c ON c.id=p.community_id WHERE p.listing_id=l.id AND p.status='approved' AND c.visibility='public')`,[id,'active']);
  if(!rows.length)return reply.code(404).send({error:'Not found'});
  return rows[0];
});
app.get('/api/listings/:id/recommendations',async(req,reply)=>{
 const id=(req.params as {id:string}).id;if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Invalid id'});
 const listing=await pool.query(`SELECT l.seller_id,l.category,l.city,u.nickname FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=$1 AND l.status='active' AND EXISTS(SELECT 1 FROM placements p JOIN communities c ON c.id=p.community_id WHERE p.listing_id=l.id AND p.status='approved' AND c.visibility='public')`,[id]);
 if(!listing.rows.length)return reply.code(404).send({error:'Not found'});
 const current=listing.rows[0];
 const rows=await pool.query(`SELECT l.id,l.title,l.price_kopecks,l.city,l.category,l.created_at,l.seller_id=$2 AS same_seller,
  (SELECT '/api/media/'||m.id::text FROM listing_media m WHERE m.listing_id=l.id AND m.upload_status='ready' ORDER BY m.sort_order,m.created_at LIMIT 1) AS photo_url
  FROM listings l WHERE l.id<>$1 AND l.status='active' AND (l.category=$3 OR l.seller_id=$2)
  AND EXISTS(SELECT 1 FROM placements p JOIN communities c ON c.id=p.community_id WHERE p.listing_id=l.id AND p.status='approved' AND c.visibility='public')
  ORDER BY (l.seller_id=$2) DESC,(l.city=$4) DESC,l.created_at DESC LIMIT 12`,[id,current.seller_id,current.category,current.city]);
 return {sellerName:current.nickname,sellerItems:rows.rows.filter(x=>x.same_seller).slice(0,6),similarItems:rows.rows.filter(x=>x.category===current.category).slice(0,6)};
});
const listingSchema=z.object({title:z.string().trim().min(3).max(120),description:z.string().max(5000).default(''),priceKopecks:z.number().int().nonnegative(),city:z.string().trim().min(1).max(80),category:z.string().min(1).max(50),requestKey:z.string().uuid(),itemCondition:conditionSchema,attributes:attributesSchema.optional()});
app.post('/api/listings',async(req,reply)=>{
  const userId=auth(req);if(!userId)return reply.code(401).send({error:'Authentication required'});
  const parsed=listingSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Invalid listing',details:parsed.error.issues});
  const d=parsed.data;
  const {rows}=await pool.query(`INSERT INTO listings(seller_id,title,description,price_kopecks,city,category,status,create_request_key,item_condition,attributes)
    VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9::jsonb)
    ON CONFLICT(seller_id,create_request_key) DO UPDATE SET updated_at=listings.updated_at
    RETURNING *`,[userId,d.title,d.description,d.priceKopecks,d.city,d.category,d.requestKey,d.itemCondition||null,JSON.stringify(d.attributes||{})]);
  return reply.code(201).send(rows[0]);
});
app.post('/api/listings/:id/sold',async(req,reply)=>{
  const userId=auth(req);if(!userId)return reply.code(401).send({error:'Unauthorized'});
  const id=(req.params as {id:string}).id;
  if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Invalid id'});
  // Atomic conditional update avoids TOCTOU races when another request changes status.
  const {rows}=await pool.query(`UPDATE listings SET status='sold',updated_at=now()
    WHERE id=$1 AND seller_id=$2 AND status IN ('active','reserved') RETURNING id`,[id,userId]);
  if(rows.length)return {ok:true};
  const exists=await pool.query('SELECT id FROM listings WHERE id=$1 AND seller_id=$2',[id,userId]);
  return exists.rows.length?reply.code(409).send({error:'Invalid state transition'}):reply.code(404).send({error:'Not found'});
});
app.get('/api/communities',async()=>({items:(await pool.query("SELECT c.id,c.name,c.city,c.visibility,m.channel_url AS max_channel_url,m.title AS max_channel_title FROM communities c LEFT JOIN max_channel_links m ON m.community_id=c.id WHERE c.visibility='public' ORDER BY c.name")).rows}));
// Each authenticated seller may create and moderate their own public circle.
app.post('/api/communities',async(req,reply)=>{
  const userId=auth(req);if(!userId)return reply.code(401).send({error:'Unauthorized'});
  const parsed=z.object({name:z.string().trim().min(3).max(80)}).strict().safeParse(req.body);
  if(!parsed.success)return reply.code(400).send({error:'Invalid community name'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[userId]);
    const existing=await client.query('SELECT id,name FROM communities WHERE owner_id=$1 AND name=$2',[userId,parsed.data.name]);
    let community=existing.rows[0];
    if(!community){
      const created=await client.query("INSERT INTO communities(owner_id,name,visibility) VALUES($1,$2,'public') RETURNING id,name",[userId,parsed.data.name]);
      community=created.rows[0];
      await client.query("INSERT INTO community_roles(community_id,user_id,role) VALUES($1,$2,'owner')",[community.id,userId]);
    }
    await client.query('COMMIT');
    return reply.code(existing.rows.length?200:201).send(community);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});
app.post('/api/placements/:id/moderate',async(req,reply)=>{
  const userId=auth(req);if(!userId)return reply.code(401).send({error:'Unauthorized'});
  const id=(req.params as {id:string}).id;
  const p=z.object({decision:z.enum(['approved','rejected']),reason:z.string().max(1000).optional()}).safeParse(req.body);
  if(!z.string().uuid().safeParse(id).success||!p.success)return reply.code(400).send({error:'Invalid request'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    // Lock the listing before its placement, matching the edit lock order.
    // Prevents approving obsolete content while the seller edits the listing.
    const parent=await client.query(
      `SELECT l.id,l.status FROM listings l
       JOIN placements p ON p.listing_id=l.id
       WHERE p.id=$1 FOR UPDATE OF l`,[id]
    );
    if(!parent.rows.length){await client.query('ROLLBACK');return reply.code(404).send({error:'Not found'});}
    if(parent.rows[0].status!=='active'){await client.query('ROLLBACK');return reply.code(409).send({error:'Listing is not active'});}
    const item=await client.query(`SELECT p.id,p.status,r.role,c.owner_id FROM placements p
      JOIN communities c ON c.id=p.community_id
      LEFT JOIN community_roles r ON r.community_id=p.community_id AND r.user_id=$2 WHERE p.id=$1 FOR UPDATE OF p`,[id,userId]);
    if(!item.rows.length){await client.query('ROLLBACK');return reply.code(404).send({error:'Not found'});}
    if(item.rows[0].owner_id!==userId && !canModerate(item.rows[0].role)){await client.query('ROLLBACK');return reply.code(403).send({error:'Forbidden'});}
    if(item.rows[0].status!=='pending'){await client.query('ROLLBACK');return reply.code(409).send({error:'Already reviewed'});}
    await client.query('UPDATE placements SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3',[p.data!.decision,userId,id]);
    await client.query('INSERT INTO moderation_actions(placement_id,moderator_id,decision,reason) VALUES($1,$2,$3,$4)',[id,userId,p.data!.decision,p.data!.reason||null]);
    await client.query('COMMIT');return {ok:true};
  } catch(e){await client.query('ROLLBACK');throw e;} finally {client.release();}
});

app.post('/api/me/channel/connect',async(req,reply)=>{
 const userId=auth(req);if(!userId)return reply.code(401).send({error:'Unauthorized'});
 try{return await connectConfiguredChannel(pool,userId);}
 catch(error){return reply.code(409).send({error:error instanceof Error?error.message:'Не удалось подключить канал'});}
});
registerMarketplaceRoutes(app,pool,auth);
registerPhotoRoutes(app,pool,auth);
registerFavoritesRoutes(app,pool,auth);
registerConversationRoutes(app,pool,auth);


const publish=()=>Promise.all([publishApproved(pool),sendConversationNotifications(pool)]).catch(()=>app.log.warn("MAX publication interrupted; inspect delivery status"));
void publish();
const publishTimer=setInterval(()=>void publish(),30000);
publishTimer.unref();
app.addHook("onClose",async()=>{clearInterval(publishTimer);});

const port=Number(process.env.PORT||3001);
try{await app.listen({port,host:'0.0.0.0'});}catch(err){app.log.error(err);process.exit(1)}
if(process.env.MAX_CHANNEL_ID){void connectConfiguredChannel(pool).then(()=>app.log.info("MAX channel connected")).catch(()=>app.log.warn("MAX channel connection pending; retry from profile"));}
