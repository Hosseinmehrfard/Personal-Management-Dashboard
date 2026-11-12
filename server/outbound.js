// Bounded TLS outbound calls with DNS resolution pinned to the validated address.
// HTTPS certificates are still verified against the original hostname.
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {safeUrl} from './security.js';
export function isPublicIP(ip){
 if(!isIP(ip))return false;
 if(isIP(ip)===4){
  const p=ip.split('.').map(Number),[a,b,c]=p;
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0&&c===0||a===192&&b===0&&c===2||a===198&&b>=18&&b<=19||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
 }
 const v=ip.toLowerCase();
 if(v==='::'||v==='::1'||v.startsWith('fe80:')||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('ff')||v.startsWith('2001:db8:'))return false;
 if(v.startsWith('::ffff:'))return isPublicIP(v.slice(7));
 return true;
}
export function agentAllowedHost(url,hosts=process.env.ALLOWED_AGENT_HOSTS||''){
 const u=new URL(safeUrl(url));
 const allowed=hosts.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowed.includes(u.hostname.toLowerCase()))throw Object.assign(new Error('میزبان عامل باید در ALLOWED_AGENT_HOSTS سرور مجاز شده باشد'),{status:403});
 if(u.pathname!=='/'&&u.pathname!=='')throw new Error('آدرس عامل باید فقط نام میزبان باشد');
 if(u.search)throw new Error('آدرس عامل نباید پارامتر داشته باشد');
 return u;
}
export async function pinnedRequest(url,{method='GET',headers={},maxBytes=65536,timeout=7000,publicOnly=true}={}){
 const u=new URL(safeUrl(url));
 const records=await lookup(u.hostname,{all:true,verbatim:true});
 if(!records.length||records.some(r=>!isIP(r.address)||publicOnly&&!isPublicIP(r.address)))throw Object.assign(new Error('آدرس شبکه مجاز نیست'),{status:403});
 const record=records[0];
 return await new Promise((resolve,reject)=>{
  const req=https.request(u,{method,headers:{'Accept':'application/json',...headers},timeout,signal:AbortSignal.timeout(timeout),lookup:(_host,_opts,cb)=>cb(null,record.address,record.family),maxHeaderSize:8192,autoSelectFamily:false,agent:false},res=>{
   let length=0;const chunks=[];
   if([301,302,303,307,308].includes(res.statusCode)){res.resume();reject(Object.assign(new Error('تغییر مسیر شبکه مجاز نیست'),{status:502}));return;}
   res.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){req.destroy(new Error('پاسخ سرویس بیش‌ازحد بزرگ است'));return;}chunks.push(chunk)});
   res.on('error',reject);
   res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('timeout',()=>req.destroy(new Error('زمان اتصال پایان یافت')));
  req.on('error',reject);req.end();
 });
}
export function validateMetrics(m){
 if(!m||typeof m!=='object'||Array.isArray(m))throw new Error('داده منابع ناقص است');
 for(const k of ['cpu','memory','disk'])if(!m[k]||typeof m[k]!=='object'||Array.isArray(m[k]))throw new Error('داده منابع ناقص است');
 const cpu=Number(m.cpu.usagePercent),cores=Number(m.cpu.cores),used=Number(m.memory.used),total=Number(m.memory.total),du=Number(m.disk.used),dt=Number(m.disk.total);
 if(![cpu,cores,used,total,du,dt].every(Number.isFinite)||cpu<0||cpu>100||cores<0||cores>1024||used<0||total<=0||used>total||du<0||dt<=0||du>dt||dt>1e18||total>1e18)throw new Error('داده منابع نامعتبر است');
 const p=typeof m.disk.path==='string'?m.disk.path:'/',path=p.length<=100?p:'/';
 return {cpu:{usagePercent:cpu,cores},memory:{used,total},disk:{used:du,total:dt,path},at:new Date().toISOString()};
}
export const safeDocHost=host=>['owasp.org','github.com','portswigger.net','developer.mozilla.org','mitre.org'].some(d=>host===d||host.endsWith('.'+d));
