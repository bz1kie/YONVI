import type {Pool} from 'pg';
import {configuredMaxBotToken} from './max-auth.js';
export async function sendConversationNotifications(pool:Pool){
 const token=configuredMaxBotToken(),origin=process.env.WEB_ORIGIN;if(!token||!origin)return;
 const db=await pool.connect();let locked=false;
 try{
  locked=(await db.query('SELECT pg_try_advisory_lock(81082276) AS locked')).rows[0].locked;if(!locked)return;
  const rows=await db.query(`SELECT n.message_id,m.conversation_id,u.max_user_id,u.message_notifications
   FROM conversation_notifications n JOIN conversation_messages m ON m.id=n.message_id JOIN users u ON u.id=n.recipient_id
   WHERE n.status='pending' ORDER BY n.message_id LIMIT 5`);
  for(const row of rows.rows){
   if(!row.message_notifications||!row.max_user_id){await db.query("UPDATE conversation_notifications SET status='cancelled' WHERE message_id=$1",[row.message_id]);continue;}
   await db.query("UPDATE conversation_notifications SET status='sending' WHERE message_id=$1",[row.message_id]);
   let status='unknown';
   try{
    const response=await fetch('https://platform-api2.max.ru/messages?user_id='+encodeURIComponent(row.max_user_id),{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({text:'Вам написали в Лавось. Откройте приложение, чтобы прочитать сообщение.',attachments:[{type:'inline_keyboard',payload:{buttons:[[{type:'link',text:'Открыть диалог',url:'https://max.ru/se14029050_1_bot?startapp=conversation_'+row.conversation_id}]]}}]}),signal:AbortSignal.timeout(10000)});
    status=response.ok?'sent':response.status<500?'failed':'unknown';
   }catch{ /* Uncertain sends must not be duplicated. */ }
   await db.query('UPDATE conversation_notifications SET status=$2 WHERE message_id=$1',[row.message_id,status]);
   await new Promise(resolve=>setTimeout(resolve,600));
  }
 }finally{if(locked)await db.query('SELECT pg_advisory_unlock(81082276)');db.release();}
}
