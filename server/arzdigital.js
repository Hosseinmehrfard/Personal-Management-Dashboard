// Adapter for the OFFICIAL, user-authorized ArzDigital API (console.arzdigital.com).
// Its public landing page does not expose a readable API schema: configuration is
// deliberately empty until an API contract/key is obtained from the provider.
import {normalizeToman} from './currency-math.js';
import {pinnedRequest} from './outbound.js';

const ALLOWED_HOSTS=new Set(['console.arzdigital.com','api.arzdigital.com','gw.arzdigital.com']);
const PATH_RE=/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,4}$/;
export const DEFAULT_ARZDIGITAL={enabled:false,endpoint:'',unit:'TOMAN',refreshHours:8,rootPath:'data',priceField:'price',codeField:'symbol',authStyle:'bearer'};
export function validateArzdigitalEndpoint(raw){
 if(typeof raw!=='string'||raw.length>750)throw new Error('نشانی API ارزدیجیتال نامعتبر است');
 if(!raw.trim())return '';
 let u;try{u=new URL(raw)}catch{throw new Error('نشانی API ارزدیجیتال نامعتبر است')}
 if(u.protocol!=='https:'||!ALLOWED_HOSTS.has(u.hostname.toLowerCase())||u.username||u.password||u.port||u.hash||u.search||u.pathname.includes('..'))throw new Error('فقط نشانی HTTPS رسمی API ارزدیجیتال و بدون پارامتر مجاز است');
 return u.href;
}
export function validateArzdigitalConfig(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('تنظیمات API نامعتبر است');
 const enabled=input.enabled===true,endpoint=validateArzdigitalEndpoint(input.endpoint||'');
 const unit=input.unit||'TOMAN',authStyle=input.authStyle||'bearer',refreshHours=Number(input.refreshHours??8);
 const rootPath=input.rootPath===undefined?'data':String(input.rootPath),priceField=input.priceField===undefined?'price':String(input.priceField),codeField=input.codeField===undefined?'symbol':String(input.codeField);
 if(!['RIAL','TOMAN'].includes(unit)||!['bearer','x-api-key'].includes(authStyle)||!Number.isInteger(refreshHours)||refreshHours<1||refreshHours>168)throw new Error('تنظیمات واحد، احراز هویت یا تناوب معتبر نیست');
 if(rootPath&&!PATH_RE.test(rootPath)||!PATH_RE.test(priceField)||!PATH_RE.test(codeField)||[rootPath,priceField,codeField].some(p=>p.split('.').some(k=>['__proto__','constructor','prototype'].includes(k))))throw new Error('مسیر فیلدهای JSON نامعتبر است');
 if(enabled&&!endpoint)throw new Error('برای فعال‌کردن اتصال باید نشانی رسمی API را وارد کنید');
 return {enabled,endpoint,unit,refreshHours,rootPath,priceField,codeField,authStyle};
}
function at(obj,path){return path?path.split('.').reduce((a,k)=>a!==null&&typeof a==='object'&&Object.hasOwn(a,k)?a[k]:undefined,obj):obj}
const normalizedCode=x=>String(x||'').trim().toUpperCase();
// Handles arrays of quote objects and maps keyed by currency code. No guessed
// provider payload is assumed; field mapping is explicitly entered by admin.
export function parseArzdigitalRates(body,config,currencies){
 const cfg=validateArzdigitalConfig({...config,enabled:false});
 if(!body||typeof body!=='object'||Array.isArray(body)&&body.length>20000)throw new Error('پاسخ نرخ معتبر نیست');
 const source=at(body,cfg.rootPath);
 if(!source||typeof source!=='object')throw new Error('مسیر داده در پاسخ API پیدا نشد');
 const index=new Map();
 if(Array.isArray(source)){
  if(source.length>20000)throw new Error('تعداد نرخ‌ها بیش‌ازحد است');
  for(const row of source){const code=normalizedCode(at(row,cfg.codeField));if(code&&code.length<=32)index.set(code,row)}
 }else for(const [key,row] of Object.entries(source).slice(0,20000))index.set(normalizedCode(key),row);
 const prices=[];
 for(const currency of currencies){
  if(currency.code==='TOMAN')continue;
  const code=normalizedCode(currency.arzdigital_code||currency.code),record=index.get(code);
  if(record===undefined)continue;
  const raw=typeof record==='object'&&record!==null?at(record,cfg.priceField):record;
  if(raw===undefined||raw===null||raw==='')continue;
  try{
   // No auto-guessing RIAL/TOMAN: user must confirm units from official API docs.
   const price=normalizeToman(raw,cfg.unit);
   if(Number.isFinite(price)&&price>0)prices.push({code:currency.code,price});
  }catch{}
 }
 if(!prices.length)throw new Error('هیچ نرخ قابل‌تطبیقی در پاسخ API یافت نشد؛ مسیر فیلدها و واحد را بررسی کنید');
 return prices;
}
export async function getArzdigitalQuotes({key,config,currencies}){
 const cfg=validateArzdigitalConfig(config);
 if(!cfg.enabled||!key)throw new Error('اتصال ارزدیجیتال فعال یا تنظیم نشده است');
 const headers=cfg.authStyle==='bearer'?{Authorization:`Bearer ${key}`}:{'X-API-Key':key};
 const response=await pinnedRequest(cfg.endpoint,{headers,timeout:12000,maxBytes:1_000_000,publicOnly:true});
 if(response.status!==200)throw new Error(`پاسخ سرویس نرخ نامعتبر است (${response.status})`);
 let payload;try{payload=JSON.parse(response.body)}catch{throw new Error('سرویس نرخ JSON معتبر برنگرداند')}
 return parseArzdigitalRates(payload,cfg,currencies);
}
