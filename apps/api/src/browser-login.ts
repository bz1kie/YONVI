import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Pool} from 'pg';
import {createHash,randomBytes} from 'node:crypto';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const COOKIE='lavose_browser_login';
const cookie=(req:FastifyRequest)=>{const values=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));return values.length===1&&/^[a-f0-9]{64}$/.test(values[0].slice(COOKIE.length+1))?values[0].slice(COOKIE.length+1):null;};
export function registerBrowserLogin(app:FastifyInstance,pool:Pool,options:{cookieOptions:(age?:number)=>string;originMatches:(req:FastifyRequest)=>boolean}){
 // Bounded short-lived limits; approval also requires an authenticated MAX session.
 const limits=new Map<string,{count:number;until:number}>();
 const allow=(key:string,max:number)=>{const now=Date.now();for(const [k,v] of limits)if(v.until<now)limits.delete(k);const v=limits.get(key);if(v){v.count++;return v.count<=max;}if(limits.size>=10000)return false;limits.set(key,{count:1,until:now+60000});return true;};
 const guard=(req:FastifyRequest,reply:any)=>{reply.header('Cache-Control','no-store');if(!options.originMatches(req)){reply.code(403).send({error:'Invalid Origin'});return false;}return true;};
 app.post('/api/auth/browser/start',async(req,reply)=>{
  if(!guard(req,reply))return;
  if(!allow('start:'+req.ip,10))return reply.code(429).send({error:'Подождите минуту перед новым запросом.'});
  const raw=randomBytes(32).toString('hex'),code=randomBytes(6).toString('hex').toUpperCase();
  const old=cookie(req);if(old)await pool.query('DELETE FROM browser_login_requests WHERE token_hash=$1',[hash(old)]);
  await pool.query('DELETE FROM browser_login_requests WHERE expires_at<now()');
  await pool.query("INSERT INTO browser_login_requests(token_hash,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[hash(raw),hash(code)]);
  reply.header('Set-Cookie',`${COOKIE}=${raw}; ${options.cookieOptions(300)}`);
  return {code,expiresAt:Date.now()+300000};
 });
 app.post('/api/auth/browser/confirm',async(req,reply)=>{
  if(!guard(req,reply))return;
  const userId=(req as FastifyRequest&{yorviUserId?:string}).yorviUserId;
  if(!userId)return reply.code(401).send({error:'Сначала войдите через MAX.'});
  if(!allow('confirm:'+userId,10))return reply.code(429).send({error:'Слишком много попыток. Подождите минуту.'});
  const body=req.body as {code?:unknown}|null;
  const code=typeof body?.code==='string'?body.code.replace(/[ -]/g,'').toUpperCase():'';
  if(!/^[A-F0-9]{12}$/.test(code))return reply.code(400).send({error:'Введите 12 символов кода с сайта.'});
  const result=await pool.query('UPDATE browser_login_requests SET user_id=$1 WHERE code_hash=$2 AND expires_at>now() AND user_id IS NULL RETURNING token_hash',[userId,hash(code)]);
  if(!result.rowCount)return reply.code(400).send({error:'Код истёк, уже использован или введён неверно.'});
  return {confirmed:true};
 });
 app.post('/api/auth/browser/poll',async(req,reply)=>{
  if(!guard(req,reply))return;
  const raw=cookie(req);if(!raw)return reply.code(401).send({error:'Запросите новый код входа.'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const {rows}=await client.query('SELECT user_id FROM browser_login_requests WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',[hash(raw)]);
   if(!rows.length){await client.query('ROLLBACK');return reply.code(410).send({error:'Код истёк. Запросите новый.'});}
   if(!rows[0].user_id){await client.query('COMMIT');return {authenticated:false};}
   const session=randomBytes(32).toString('hex');
   await client.query("INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours')",[rows[0].user_id,hash(session)]);
   await client.query('DELETE FROM browser_login_requests WHERE token_hash=$1',[hash(raw)]);
   await client.query('COMMIT');
   reply.header('Set-Cookie',[`yorvi_session=${session}; ${options.cookieOptions()}`,`${COOKIE}=; ${options.cookieOptions(0)}`]);
   return {authenticated:true};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
}
