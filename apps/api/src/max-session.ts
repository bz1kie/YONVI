import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { registerBrowserLogin } from './browser-login.js';
import { verifyMaxInitData, InvalidMaxData, configuredMaxBotToken } from './max-auth.js';

const COOKIE='yorvi_session';
const SESSION_SECONDS=12*3600;
const rawToHash=(raw:string)=>createHash('sha256').update(raw).digest('hex');
const cookieValue=(req:FastifyRequest):string|null=>{
 const raw=req.headers.cookie;
 if(!raw || raw.length>4096)return null;
 const pairs=raw.split(';').map(x=>x.trim()).filter(Boolean);
 const matches=pairs.filter(pair=>pair.startsWith(COOKIE+'='));
 if(matches.length!==1)return null;
 const value=matches[0].slice(COOKIE.length+1);
 return /^[a-f0-9]{64}$/i.test(value) ? value : null;
};
const isProd=()=>process.env.NODE_ENV==='production';
// MAX Web embeds the app cross-site. Partition the HTTPS session by its host site.
const cookieOptions=(maxAge=SESSION_SECONDS)=>`Path=/api; HttpOnly; ${isProd()?'SameSite=None; Secure; Partitioned; ':'SameSite=Strict; '}Max-Age=${maxAge}`;
const allowedOrigin=()=>process.env.WEB_ORIGIN||'http://localhost:5173';
function originMatches(req:FastifyRequest):boolean {
 const origin=req.headers.origin;
 return typeof origin==='string'&&origin===allowedOrigin();
}
export function registerMaxAuthentication(app:FastifyInstance,pool:Pool){
 app.addHook('preHandler',async req=>{
   const raw=cookieValue(req);
   if(!raw)return;
   // Session lookup is on the server on EVERY request. Logout revokes this token.
   const {rows}=await pool.query(
    `SELECT s.user_id FROM user_sessions s WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [rawToHash(raw)],
   );
   if(rows.length){
     // SameSite alone is not sufficient: same-site cross-origin requests still exist.
     if (!['GET','HEAD','OPTIONS'].includes(req.method) && !originMatches(req)) {
       throw Object.assign(new Error('Invalid Origin'),{statusCode:403});
     }
     (req as FastifyRequest & {yorviUserId?:string}).yorviUserId=String(rows[0].user_id);
   }
 });

 const requireOrigin=(req:FastifyRequest,reply:any)=>{
   if(!originMatches(req))return reply.code(403).send({error:'Invalid Origin'});
   return null;
 };

 registerBrowserLogin(app,pool,{cookieOptions,originMatches});

 app.post('/api/auth/max',async (req,reply)=>{
   const denied=requireOrigin(req,reply);
   if(denied)return denied;
   const token=configuredMaxBotToken();
   if(!token)return reply.code(503).send({error:'MAX authentication is not configured'});
   const parsed=z.object({initData:z.string().min(20).max(16384)}).strict().safeParse(req.body);
   if(!parsed.success)return reply.code(400).send({error:'Invalid launch data'});
   let user;
   try{user=verifyMaxInitData(parsed.data.initData,token);}
   catch(e){
     if(e instanceof InvalidMaxData)return reply.code(401).send({error:'MAX signature is invalid or expired'});
     throw e;
   }
   const client=await pool.connect();
   try{
     await client.query('BEGIN');
     const found=await client.query(
       `INSERT INTO users(max_user_id,nickname) VALUES($1,$2)
         ON CONFLICT(max_user_id) DO UPDATE SET nickname=EXCLUDED.nickname
         RETURNING id,nickname`,
       [user.maxUserId,user.displayName],
     );
     const id=String(found.rows[0].id);
     const session=randomBytes(32).toString('hex');
     await client.query(
       `INSERT INTO user_sessions(user_id,token_hash,expires_at)
         VALUES($1,$2,now()+interval '12 hours')`,
       [id,rawToHash(session)],
     );
     await client.query('COMMIT');
     reply.header('Set-Cookie',`${COOKIE}=${session}; ${cookieOptions()}`);
     reply.header('Cache-Control','no-store');
     return {authenticated:true,user:{id,nickname:user.displayName}};
   }catch(error){
     await client.query('ROLLBACK');throw error;
   }finally{client.release();}
 });

 app.get('/api/auth/me',async (req,reply)=>{
   const userId=(req as FastifyRequest & {yorviUserId?:string}).yorviUserId;
   if(!userId)return reply.code(401).send({error:'Not authenticated'});
   const {rows}=await pool.query('SELECT id,nickname FROM users WHERE id=$1',[userId]);
   if(!rows.length)return reply.code(401).send({error:'Not authenticated'});
   reply.header('Cache-Control','no-store');
   return {authenticated:true,user:rows[0]};
 });

 app.post('/api/auth/logout',async (req,reply)=>{
   const denied=requireOrigin(req,reply);if(denied)return denied;
   const raw=cookieValue(req);
   if(raw)await pool.query('DELETE FROM user_sessions WHERE token_hash=$1',[rawToHash(raw)]);
   reply.header('Set-Cookie',`${COOKIE}=; ${cookieOptions(0)}`);
   reply.header('Cache-Control','no-store');
   return {ok:true};
 });
}

export function currentUserId(req:FastifyRequest):string|null {
 const fromSession=(req as FastifyRequest & {yorviUserId?:string}).yorviUserId;
 if(fromSession)return fromSession;
 // Local CI demo only. Never accept supplied IDs when running in production.
 if(isProd()||process.env.ALLOW_DEMO_AUTH!=='true')return null;
 const id=req.headers['x-demo-user-id'];
 return typeof id==='string'&&z.string().uuid().safeParse(id).success?id:null;
}
