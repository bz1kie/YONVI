import { createHmac, timingSafeEqual } from 'node:crypto';

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

  let user: unknown;
  try {user=JSON.parse(entries.find(([k])=>k==='user')![1]);} catch {throw new InvalidMaxData('Invalid user data');}
  if (!user || typeof user !== 'object') throw new InvalidMaxData('Missing user');
  const data=user as Record<string,unknown>;
  const id = data.id;
  // MAX user.id is int64. Never silently round a large JSON integer.
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new InvalidMaxData('Invalid or unsafe user ID');
  const first = typeof data.first_name === 'string' ? data.first_name.trim().slice(0,80) : '';
  const last = typeof data.last_name === 'string' ? data.last_name.trim().slice(0,80) : '';
  const name = [first,last].filter(Boolean).join(' ').slice(0,120) || 'Пользователь MAX';
  return { maxUserId: String(id), displayName: name, authDate };
}

/** Shared helper only for locally generated test vectors. Never ship a bot token to the browser. */
export function signMaxFixture(fields: Record<string,string>,token:string):string {
  const entries=Object.entries(fields);
  const check=entries.sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const hash=createHmac('sha256',secret).update(check).digest('hex');
  return new URLSearchParams([...entries,['hash',hash]]).toString();
}
