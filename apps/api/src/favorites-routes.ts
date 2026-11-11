import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type Auth=(request:FastifyRequest)=>string|null;
const uuid=z.string().uuid();
// The catalog uses a single global listing with independently approved community placements.
export function registerFavoritesRoutes(app:FastifyInstance,pool:Pool,auth:Auth){
 app.get('/api/me/favorites',async(req,reply)=>{
   const userId=auth(req);
   if(!userId)return reply.code(401).send({error:'Authentication required'});
   const {rows}=await pool.query(
    `SELECT l.id,l.title,l.description,l.price_kopecks,l.city,l.category,l.item_condition,l.attributes,l.created_at,
        u.nickname AS seller_name,u.max_contact_url AS seller_contact_url,media.photo_url
      FROM favorites f
      JOIN listings l ON l.id=f.listing_id
      JOIN users u ON u.id=l.seller_id
      LEFT JOIN LATERAL (
        SELECT '/api/media/' || m.id::text AS photo_url FROM listing_media m
        WHERE m.listing_id=l.id AND m.upload_status='ready'
        ORDER BY m.sort_order,m.created_at LIMIT 1
      ) media ON true
      WHERE f.user_id=$1 AND l.status='active'
        AND EXISTS (SELECT 1 FROM placements p WHERE p.listing_id=l.id AND p.status='approved')
      ORDER BY l.created_at DESC LIMIT 100`,[userId]);
   return {items:rows};
 });

 app.put('/api/me/favorites/:id',async(req,reply)=>{
   const userId=auth(req);
   if(!userId)return reply.code(401).send({error:'Authentication required'});
   const id=(req.params as {id:string}).id;
   if(!uuid.safeParse(id).success)return reply.code(400).send({error:'Invalid listing ID'});
   const {rows}=await pool.query(
     `INSERT INTO favorites(user_id,listing_id)
       SELECT $1,l.id FROM listings l WHERE l.id=$2 AND l.status='active'
       AND EXISTS(SELECT 1 FROM placements p WHERE p.listing_id=l.id AND p.status='approved')
       ON CONFLICT(user_id,listing_id) DO NOTHING RETURNING listing_id`,[userId,id]);
   if(rows.length)return {ok:true,saved:true};
   const found=await pool.query(
     `SELECT 1 FROM listings l WHERE l.id=$1 AND l.status='active'
      AND EXISTS(SELECT 1 FROM placements p WHERE p.listing_id=l.id AND p.status='approved')`,[id]);
   if(!found.rows.length)return reply.code(404).send({error:'Listing not available'});
   return {ok:true,saved:true};
 });

 app.delete('/api/me/favorites/:id',async(req,reply)=>{
   const userId=auth(req);
   if(!userId)return reply.code(401).send({error:'Authentication required'});
   const id=(req.params as {id:string}).id;
   if(!uuid.safeParse(id).success)return reply.code(400).send({error:'Invalid listing ID'});
   await pool.query('DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2',[userId,id]);
   return {ok:true,saved:false};
 });
}
