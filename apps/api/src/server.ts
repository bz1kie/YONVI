import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';
import { z } from 'zod';
import { canModerate } from './domain.mjs';
import { registerMarketplaceRoutes } from './marketplace-routes.js';
import { registerMaxAuthentication, currentUserId } from './max-session.js';

const app=Fastify({logger:true});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL || 'postgresql://yorvi:yorvi_local_password@localhost:5432/yorvi'});
await app.register(cors,{origin:process.env.WEB_ORIGIN || 'http://localhost:5173'});

app.get('/health',async()=>({ok:true,service:'yorvi-api',version:'2.0.0-alpha.1'}));
registerMaxAuthentication(app,pool);
const auth=currentUserId;
app.get('/api/listings',async(req,reply)=>{
  const q=z.object({city:z.string().max(80).optional(),category:z.string().max(50).optional(),search:z.string().max(100).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).safeParse(req.query);
  if(!q.success)return reply.code(400).send({error:'Invalid query'});
  const {city,category,search,limit}=q.data;
  const {rows}=await pool.query(`SELECT l.id,l.title,l.description,l.price_kopecks,l.city,l.category,l.created_at, u.nickname AS seller_name FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND EXISTS (SELECT 1 FROM placements p WHERE p.listing_id=l.id AND p.status='approved')
    AND ($1::text IS NULL OR l.city=$1)
    AND ($2::text IS NULL OR l.category=$2)
    AND ($3::text IS NULL OR l.title ILIKE '%'||$3||'%')
    ORDER BY l.created_at DESC LIMIT $4`,[city||null,category||null,search||null,limit]);
  return {items:rows};
});
app.get('/api/listings/:id',async(req,reply)=>{
  const id=(req.params as {id:string}).id;
  if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Invalid id'});
  const {rows}=await pool.query("SELECT l.id,l.title,l.description,l.price_kopecks,l.city,l.category,l.created_at,u.nickname AS seller_name FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=$1 AND l.status=$2 AND EXISTS (SELECT 1 FROM placements p WHERE p.listing_id=l.id AND p.status='approved')",[id,'active']);
  if(!rows.length)return reply.code(404).send({error:'Not found'});
  return rows[0];
});
const listingSchema=z.object({title:z.string().trim().min(3).max(120),description:z.string().max(5000).default(''),priceKopecks:z.number().int().nonnegative(),city:z.string().trim().min(1).max(80),category:z.string().min(1).max(50),requestKey:z.string().uuid()});
app.post('/api/listings',async(req,reply)=>{
  const userId=auth(req);if(!userId)return reply.code(401).send({error:'Authentication required'});
  const parsed=listingSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Invalid listing',details:parsed.error.issues});
  const d=parsed.data;
  const {rows}=await pool.query(`INSERT INTO listings(seller_id,title,description,price_kopecks,city,category,status,create_request_key)
    VALUES($1,$2,$3,$4,$5,$6,'draft',$7)
    ON CONFLICT(seller_id,create_request_key) DO UPDATE SET updated_at=listings.updated_at
    RETURNING *`,[userId,d.title,d.description,d.priceKopecks,d.city,d.category,d.requestKey]);
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
app.get('/api/communities',async()=>({items:(await pool.query("SELECT id,name,city,visibility FROM communities WHERE visibility='public' ORDER BY name")).rows}));
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

registerMarketplaceRoutes(app,pool,auth);

const port=Number(process.env.PORT||3001);
try{await app.listen({port,host:'0.0.0.0'});}catch(err){app.log.error(err);process.exit(1)}