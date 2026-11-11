import type { Pool } from 'pg';
import { configuredMaxBotToken } from './max-auth.js';

export function channelPost(listing:{title:string;description:string;price_kopecks:string|number;city:string;id:string},origin:string){
 const price=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(Number(listing.price_kopecks)/100);
 return {text:[listing.title,price+' · '+listing.city,listing.description.slice(0,2800),'Лавось — объявления и находки'].filter(Boolean).join('\n\n'),attachments:[{type:'inline_keyboard',payload:{buttons:[[{type:'link',text:'Открыть объявление',url:origin+'/?listing='+encodeURIComponent(listing.id)}]]}}]};
}

// Persistent delivery state: uncertain outcomes are never automatically resent.
export async function publishApproved(pool:Pool){
 if(!configuredMaxBotToken()||!process.env.WEB_ORIGIN)return;
 const db=await pool.connect();let locked=false;
 try{
  locked=(await db.query('SELECT pg_try_advisory_lock(81082275) AS locked')).rows[0].locked;
  if(!locked)return;
  await db.query(`INSERT INTO max_channel_posts(placement_id)
   SELECT p.id FROM placements p JOIN listings l ON l.id=p.listing_id JOIN max_channel_links m ON m.community_id=p.community_id
   WHERE p.status='approved' AND l.status='active' ON CONFLICT DO NOTHING`);
  const jobs=await db.query("SELECT placement_id FROM max_channel_posts WHERE status='pending' ORDER BY created_at LIMIT 5");
  for(const job of jobs.rows){
   await db.query("UPDATE max_channel_posts SET status='sending',updated_at=now() WHERE placement_id=$1",[job.placement_id]);
   await db.query('BEGIN');
   try{
    const found=await db.query(`SELECT l.id,l.title,l.description,l.price_kopecks,l.city,m.chat_id
     FROM placements p JOIN listings l ON l.id=p.listing_id JOIN max_channel_links m ON m.community_id=p.community_id
     JOIN communities c ON c.id=p.community_id
     WHERE p.id=$1 AND p.status='approved' AND l.status='active' AND c.visibility='public' FOR SHARE OF l,p,c,m`,[job.placement_id]);
    if(!found.rows.length){await db.query("UPDATE max_channel_posts SET status='cancelled',updated_at=now() WHERE placement_id=$1",[job.placement_id]);await db.query('COMMIT');continue;}
    const listing=found.rows[0];
    const body=channelPost(listing,process.env.WEB_ORIGIN!.replace(/\/$/,''));
    let response:Response;
    try{
     response=await fetch('https://platform-api2.max.ru/messages?chat_id='+encodeURIComponent(listing.chat_id),{method:'POST',headers:{Authorization:configuredMaxBotToken()!,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    }catch{
     await db.query("UPDATE max_channel_posts SET status='unknown',last_error='Ответ MAX не получен. Проверьте канал перед повторной отправкой.',updated_at=now() WHERE placement_id=$1",[job.placement_id]);await db.query('COMMIT');continue;
    }
    if(!response.ok){
     const uncertain=response.status>=500;
     await db.query('UPDATE max_channel_posts SET status=$2,last_error=$3,updated_at=now() WHERE placement_id=$1',[job.placement_id,uncertain?'unknown':'failed','MAX HTTP '+response.status+(response.status===403?' — проверьте право бота публиковать посты.':'')]);
    }else{
     const payload=await response.json().catch(()=>null) as any;
     const mid=payload?.message?.body?.mid;
     await db.query('UPDATE max_channel_posts SET status=$2,message_id=$3,last_error=$4,updated_at=now() WHERE placement_id=$1',[job.placement_id,mid?'sent':'unknown',mid||null,mid?null:'MAX не вернул ID поста. Проверьте канал.']);
    }
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
   await new Promise(resolve=>setTimeout(resolve,600));
  }
 }finally{if(locked)await db.query('SELECT pg_advisory_unlock(81082275)');db.release();}
}
