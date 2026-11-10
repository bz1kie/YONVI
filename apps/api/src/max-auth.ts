import { createHmac, timingSafeEqual } from 'node:crypto';

/** Resolve the runtime-only MAX token. A GitHub Actions secret is not injected into the server automatically. */
export function configuredMaxBotToken(env: { MAX_BOT_TOKEN?: string; MAX_YONVI_TOKEN?: string } = process.env): string | undefined {
  return env.MAX_BOT_TOKEN?.trim() || env.MAX_YONVI_TOKEN?.trim() || undefined;
}

export type VerifiedMaxUser = {
  maxUserId: string;
  displayName: string;
  authDate: number;
};

export class InvalidMaxData extends Error { constructor(message='Invalid MAX authentication data') {super(message);} }

/** Official MAX Mini App two-stage HMAC. Always pass the *raw* WebApp.initData, never initDataUnsafe.
 * https://dev.max.ru/docs/webapps/validation/
 */
export function verifyMaxInitData(raw: string, botToken: string, opts: { nowSeconds?: number; maxAgeSeconds?: number } = {}): VerifiedMaxUser {
  if (!botToken || typeof raw !== 'string' || raw.length < 15 || raw.length > 16384) throw new InvalidMaxData();
  const entries = [...new URLSearchParams(raw).entries()];
  if (entries.length > 40) throw new InvalidMaxData('Too many launch parameters');
  const seen = new Set<string>();
  let providedHash = '';
  for (const [key,value] of entries) {
    if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || seen.has(key)) throw new InvalidMaxData('Duplicate or invalid parameter');
    seen.add(key);
    if (key === 'hash') providedHash = value;
  }
  if (!/^[a-f0-9]{64}$/i.test(providedHash)) throw new InvalidMaxData('Missing signature');
  if (!seen.has('auth_date') || !seen.has('user')) throw new InvalidMaxData('Missing required fields');
  const sorted = entries
    .filter(([key]) => key !== 'hash')
    .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k,v]) => k+'='+v).join('\n');
  const secret = createHmac('sha256','WebAppData').update(botToken).digest();
  const expected = createHmac('sha256',secret).update(sorted).digest();
  const supplied = Buffer.from(providedHash,'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) throw new InvalidMaxData('Signature mismatch');

  const authDateRaw = entries.find(([k])=>k==='auth_date')![1];
  if (!/^[0-9]{1,12}$/.test(authDateRaw)) throw new InvalidMaxData('Invalid timestamp');
  const authDate = Number(authDateRaw);
  const now = opts.nowSeconds ?? Math.floor(Date.now()/1000);
  const maxAge = opts.maxAgeSeconds ?? 3600;
  if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now-authDate > maxAge) throw new InvalidMaxData('Expired or future launch data');

  // JSON.parse() rounds integer identifiers > 2^53. Recover the top-level
  // numeric token *lexically* from the already HMAC-verified JSON payload.
  const json=entries.find(([k])=>k==='user')![1];
  const maxUserId=readLosslessUserId(json);
  let user: unknown;
  try {user=JSON.parse(json);} catch {throw new InvalidMaxData('Invalid user data');}
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw new InvalidMaxData('Missing user');
  const data=user as Record<string,unknown>;
  if (!Object.hasOwn(data,'id') || typeof data.id!=='number') throw new InvalidMaxData('Invalid user ID');
  const first = typeof data.first_name === 'string' ? data.first_name.trim().slice(0,80) : '';
  const last = typeof data.last_name === 'string' ? data.last_name.trim().slice(0,80) : '';
  const name = [first,last].filter(Boolean).join(' ').slice(0,120) || 'Пользователь MAX';
  return { maxUserId, displayName: name, authDate };
}


/** Extract only a top-level user.id numeric JSON token without floating-point conversion.
 * Scans strings and nested objects/arrays; rejects duplicate top-level id fields.
 * Requires a positive signed int64 number as emitted by MAX, not a string/exponent.
 */
export function readLosslessUserId(json:string):string {
  let depth=0;
  let id:string|null=null;
  for(let i=0;i<json.length;){
    const c=json[i];
    if(c==='"'){
      const start=i++;
      let escaped=false;
      while(i<json.length){
        const ch=json[i++];
        if(escaped){escaped=false;continue;}
        if(ch==='\\'){escaped=true;continue;}
        if(ch==='"')break;
      }
      if(json[i-1]!=='"')throw new InvalidMaxData('Invalid JSON string');
      if(depth!==1)continue;
      let key:string;
      try{key=JSON.parse(json.slice(start,i));}catch{throw new InvalidMaxData('Invalid JSON key');}
      let j=i;
      while(j<json.length&&/\s/.test(json[j]))j++;
      if(json[j]!==':'||key!=='id')continue;
      if(id!==null)throw new InvalidMaxData('Duplicate user ID');
      j++;
      while(j<json.length&&/\s/.test(json[j]))j++;
      const match=/^(0|[1-9][0-9]*)/.exec(json.slice(j));
      if(!match)throw new InvalidMaxData('Invalid user ID');
      const end=j+match[0].length;
      if(!/[,}\s]/.test(json[end]||''))throw new InvalidMaxData('Invalid user ID format');
      let number:bigint;
      try{number=BigInt(match[0]);}catch{throw new InvalidMaxData('Invalid user ID');}
      if(number<=0n||number>9223372036854775807n)throw new InvalidMaxData('User ID out of range');
      id=number.toString();
      continue;
    }
    if(c==='{'||c==='['){depth++;i++;continue;}
    if(c==='}'||c===']'){depth--;if(depth<0)throw new InvalidMaxData('Invalid JSON nesting');i++;continue;}
    i++;
  }
  if(depth!==0||id===null)throw new InvalidMaxData('Missing or invalid user ID');
  return id;
}

/** Shared helper only for locally generated test vectors. Never ship a bot token to the browser. */
export function signMaxFixture(fields: Record<string,string>,token:string):string {
  const entries=Object.entries(fields);
  const check=entries.sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const hash=createHmac('sha256',secret).update(check).digest('hex');
  return new URLSearchParams([...entries,['hash',hash]]).toString();
}
