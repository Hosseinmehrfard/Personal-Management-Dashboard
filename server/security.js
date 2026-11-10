import { randomBytes, createHash, createCipheriv, createDecipheriv, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
const encSecret=String(process.env.DATA_ENCRYPTION_KEY||'');
const key=encSecret.length===64&&/^[0-9a-f]{64}$/i.test(encSecret)?Buffer.from(encSecret,'hex'):null;
const scryptOptions={N:32768,r:8,p:1,maxmem:128*1024*1024};
export function encryptionReady(){return Boolean(key)}
export async function hashPassword(input){
 if(!validAdminPassword(input))throw new Error('رمز عبور نامعتبر است');
 const salt=randomBytes(24);const result=await scryptAsync(input,salt,64,scryptOptions);
 return `scrypt-v2$32768$8$1$${salt.toString('base64url')}$${result.toString('base64url')}`;
}
export async function passwordOK(input,stored){
 if(typeof stored!=='string'||typeof input!=='string'||input.length>256||!input)return false;
 try{
  if(stored.startsWith('scrypt-v2$')){
   const parts=stored.split('$');if(parts.length!==6)return false;
   const [N,r,p]=parts.slice(1,4).map(Number);
   if(N!==32768||r!==8||p!==1)return false;
   const salt=Buffer.from(parts[4],'base64url'),expected=Buffer.from(parts[5],'base64url');
   if(salt.length!==24||expected.length!==64)return false;
   const actual=await scryptAsync(input,salt,64,scryptOptions);
   return timingSafeEqual(actual,expected);
  }
  // Read-only compatibility for previous v4 password records. Rehash after a valid login.
  const [salt,hash]=stored.split(':');
  if(!/^[0-9a-f]{32}$/i.test(salt)||! /^[0-9a-f]{128}$/i.test(hash))return false;
  const actual=await scryptAsync(input,salt,64);
  return timingSafeEqual(actual,Buffer.from(hash,'hex'));
 }catch{return false}
}
export function encrypt(value){if(!key)throw Error('کلید رمزگذاری سرور تنظیم نشده');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(x=>x.toString('base64url')).join('.')}
export function decrypt(value){if(!value)return '';if(!key)throw Error('کلید رمزگذاری سرور تنظیم نشده');const parts=String(value).split('.');if(parts.length!==3)throw Error('مقدار رمزگذاری‌شده نامعتبر است');const [iv,tag,body]=parts.map(x=>Buffer.from(x,'base64url'));if(iv.length!==12||tag.length!==16||body.length>8192)throw Error('مقدار رمزگذاری‌شده نامعتبر است');const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8')}
export const randomToken=()=>randomBytes(32).toString('hex');
export const digest=token=>createHash('sha256').update(token).digest('hex');
export function safeString(value,max=256){
 if(value===undefined||value===null)return '';
 if(typeof value!=='string')throw new Error('نوع داده نامعتبر است');
 const s=value.trim();
 if(s.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(s))throw new Error('متن طولانی یا نامعتبر است');
 return s;
}
export const moneyNumber=(v,allowZero=false)=>{if(v===''||v===null||v===undefined||typeof v==='boolean'||typeof v==='object')throw Error('عدد یا مبلغ واردشده معتبر نیست');const n=Number(v);if(!Number.isFinite(n)||n<0||(!allowZero&&n===0)||n>1e19)throw Error('عدد یا مبلغ واردشده معتبر نیست');return n};
export function safeUrl(value){
 if(typeof value!=='string'||value.length>2048)throw Error('آدرس نامعتبر است');
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!url.hostname||url.hostname.endsWith('.')||url.search.length>512)throw Error('آدرس باید HTTPS و بدون اطلاعات ورود باشد');
 return url.href;
}
export function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)}
export function normalizeAdminUsername(value){if(typeof value!=='string')return null;const username=value.trim().toLowerCase();return /^[a-z][a-z0-9_.-]{2,31}$/.test(username)?username:null}
export function validAdminPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=256&&value.trim()===value}
