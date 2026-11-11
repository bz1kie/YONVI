import type { Pool } from 'pg';
import { configuredMaxBotToken } from './max-auth.js';

type Member={user_id:number;is_owner?:boolean;is_admin?:boolean;permissions?:string[]};
export async function connectConfiguredChannel(pool:Pool, requesterId?:string){
 const configured=process.env.MAX_CHANNEL_ID;
 const channelUrl=process.env.MAX_CHANNEL_URL;
 const token=configuredMaxBotToken();
 if(!configured||!channelUrl||!token)throw new Error('Подключение канала ещё не настроено.');
 if(!/^-?\d{1,16}$/.test(configured))throw new Error('Некорректный ID канала.');
 const request=async(path:string)=>{
  let response:Response;
  try{
   response=await fetch('https://platform-api2.max.ru'+path,{headers:{Authorization:token},signal:AbortSignal.timeout(10000)});
  }catch(error){
   const cause=(error as {cause?:{code?:string}})?.cause?.code;
   if(cause&&/CERT|TLS|SSL|VERIFY/.test(cause))throw new Error('MAX_TLS: сервер не смог проверить сертификат MAX API. Это ошибка подключения сервера, а не ваших прав.');
   throw new Error('MAX_NETWORK: сервер не получил ответ MAX API. Повторите подключение позже.');
  }
  if(!response.ok){
   const stage=path==='/me'?'бот':path.endsWith('/admins')?'администраторы':path.endsWith('/me')?'права бота':'канал';
   const hint=response.status===401?'Проверьте серверный токен Лаврика.':response.status===403?'Добавьте Лаврика в администраторы канала.':response.status===404?'MAX не нашёл объект по этому ID.':'Ошибка MAX API.';
   throw new Error(`MAX_HTTP_${response.status} (${stage}): ${hint}`);
  }
  return response.json() as Promise<any>;
 };
 // Verify the token first, rather than reporting every failure as missing rights.
 const bot=await request('/me');
 let chat:any;
 let lastError:unknown;
 for(const id of [...new Set([configured,configured.startsWith('-')?configured.slice(1):'-'+configured])]){
  try{
   const candidate=await request('/chats/'+id);
   if(candidate.type!=='channel')throw new Error('MAX_TYPE: указанный объект не является каналом.');
   if(candidate.status!=='active')throw new Error('MAX_MEMBERSHIP: Лаврик не является активным участником канала.');
   chat=candidate;break;
  }catch(error){
   lastError=error;
   // Only a missing ID warrants trying its alternate sign.
   if(!(error instanceof Error)||!error.message.startsWith('MAX_HTTP_404'))throw error;
  }
 }
 if(!chat)throw lastError||new Error('MAX_CHANNEL: не удалось определить канал.');
 const id=String(chat.chat_id);
 if(id.replace(/^-/, '')!==configured.replace(/^-/,''))throw new Error('MAX вернул другой канал.');
 const [admins,membership]=await Promise.all([request('/chats/'+id+'/members/admins'),request('/chats/'+id+'/members/me')]);
 const members:Member[]=admins.members||[];
 const botAdmin=members.find(m=>String(m.user_id)===String(bot.user_id));
 if(!botAdmin?.is_admin&&!membership.is_admin)throw new Error('Назначьте Лаврика администратором канала.');
 const owner=members.find(m=>m.is_owner&&!String(m.user_id).startsWith('-'));
 if(!owner)throw new Error('MAX не вернул владельца канала.');
 const user=await pool.query('SELECT id FROM users WHERE max_user_id=$1',[String(owner.user_id)]);
 if(!user.rows.length)throw new Error('Владелец канала должен открыть Лавось через бота и войти через MAX.');
 const ownerId=String(user.rows[0].id);
 if(requesterId&&requesterId!==ownerId)throw new Error('Подключить канал может только его владелец.');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(81082274)');
  const existing=await client.query('SELECT community_id FROM max_channel_links WHERE chat_id=$1',[id]);
  let communityId=existing.rows[0]?.community_id;
  if(communityId){
   const owned=await client.query('SELECT id FROM communities WHERE id=$1 AND owner_id=$2',[communityId,ownerId]);
   if(!owned.rows.length)throw new Error('Владелец привязанного круга отличается от владельца канала.');
  }else{
   const circles=await client.query('SELECT id FROM communities WHERE owner_id=$1 ORDER BY id',[ownerId]);
   // Reuse only an unambiguous circle owned by the verified channel owner.
   if(circles.rows.length===1)communityId=circles.rows[0].id;
   else communityId=(await client.query("INSERT INTO communities(owner_id,name,visibility) VALUES($1,$2,'public') RETURNING id",[ownerId,String(chat.title||'Лавось — канал MAX')])).rows[0].id;
  }
  await client.query("INSERT INTO community_roles(community_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT(community_id,user_id) DO UPDATE SET role='owner'",[communityId,ownerId]);
  await client.query('INSERT INTO max_channel_links(community_id,chat_id,channel_url,title) VALUES($1,$2,$3,$4) ON CONFLICT(chat_id) DO UPDATE SET title=EXCLUDED.title,channel_url=EXCLUDED.channel_url,verified_at=now()',[communityId,id,channelUrl,String(chat.title||'Лавось')]);
  await client.query('COMMIT');
  return {connected:true,communityId,title:String(chat.title||'Лавось'),url:channelUrl};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
