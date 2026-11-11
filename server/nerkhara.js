// Public, keyless NerkhAra v1 API. Contract: https://nerkhara.com/en/api/
// IRT = Iranian toman (NOT rial). USD/USDT quotes are converted only with
// same-response, non-stale IRT USD/USDT data. No browser-side cross-origin calls.
import {pinnedRequest} from './outbound.js';
const URL_LATEST='https://nerkhara.com/api/v1/latest.json';
const VALID_ID=/^[a-z][a-z0-9-]{0,47}$/;
export const NERKHARA_DEFAULTS=Object.freeze({selected:'nerkhara',refreshMinutes:15});
export const NERKHARA_ID_MAP=Object.freeze({
 USD:'usd',EUR:'eur',USDT:'usdt',GBP:'gbp',AED:'aed',TRY:'try',CAD:'cad',AFN:'afn',CNY:'cny',
 GOLD18:'gold-18k',GOLD24:'gold-24k',BTC:'btc',ETH:'eth',
 GOLDMESGHAL:'gold-mesghal',COINEMAMI:'coin-emami',COINBAHAR:'coin-bahar-azadi',
 COINHALF:'coin-half',COINQUARTER:'coin-quarter',COINGRAM:'coin-gram'
});
export function validateRateSource(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('تنظیم منبع نرخ نامعتبر است');
 const selected=input.selected??'nerkhara';
 const refreshMinutes=Number(input.refreshMinutes??15);
 if(!['nerkhara','arzdigital','navasan'].includes(selected))throw new Error('منبع نرخ نامعتبر است');
 if(!Number.isInteger(refreshMinutes)||refreshMinutes<10||refreshMinutes>1440)throw new Error('فاصله به‌روزرسانی نرخ‌آرا باید بین ۱۰ تا ۱۴۴۰ دقیقه باشد');
 return {selected,refreshMinutes};
}
export function validateNerkharaId(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||!VALID_ID.test(value))throw new Error('شناسه نرخ‌آرا نامعتبر است');
 return value;
}
function numberPositive(raw){
 if(raw===null||raw===undefined||raw==='')return null;
 const n=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;
 return Number.isFinite(n)&&n>0&&n<=1e18?n:null;
}
function timestamp(raw){
 if(typeof raw!=='string'||raw.length>35||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/.test(raw))return null;
 const d=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(raw)?raw:raw+'Z');
 return Number.isFinite(d.getTime())?d:null;
}
const idForCurrency=c=>validateNerkharaId(c.nerkhara_id||NERKHARA_ID_MAP[c.code]||String(c.code||'').toLowerCase());
// Parses a latest.json payload, excluding invalid/stale/future timestamps.
// quoteTime is the time the upstream source read the rate, not our fetch time.
export function parseNerkharaRates(payload,currencies,{now=Date.now(),maxAgeMs=3*3600_000}={}){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.api!=='nerkhara/v1'||!Array.isArray(payload.items)||payload.items.length>500)throw new Error('ساختار پاسخ نرخ‌آرا نامعتبر است');
 const all=new Map();
 for(const item of payload.items){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!VALID_ID.test(item.id))continue;
  if(item.stale===true)continue;
  const at=timestamp(item.updated_utc);
  if(!at||now-at.getTime()>maxAgeMs||at.getTime()>now+10*60_000)continue;
  if(!['IRT','USD','USDT'].includes(item.unit))continue;
  if(numberPositive(item.price)===null&&numberPositive(item.price_irt)===null)continue;
  all.set(item.id,{...item,at});
 }
 const fiat=all.get('usd'),tether=all.get('usdt');
 const usdToman=fiat?.unit==='IRT'?numberPositive(fiat.price):null;
 const usdtToman=tether?.unit==='IRT'?numberPositive(tether.price):null;
 const quotes=[];
 const codes=new Set();
 for(const c of currencies){
  if(c.code==='TOMAN')continue;
  const id=idForCurrency(c);
  if(!id||codes.has(c.code))continue;
  const item=all.get(id);
  if(!item)continue;
  let price=null;
  if(item.unit==='IRT')price=numberPositive(item.price);
  else {
   const publishedIrt=numberPositive(item.price_irt);
   const basis=item.unit==='USD'?usdToman:usdtToman;
   price=publishedIrt??(basis&&numberPositive(item.price)?item.price*basis:null);
  }
  if(!Number.isFinite(price)||price<=0||price>1e22)continue;
  quotes.push({code:c.code,id,price,quotedAt:item.at.toISOString(),unit:'TOMAN'});
  codes.add(c.code);
 }
 return quotes;
}
export async function getNerkharaQuotes({currencies,request=pinnedRequest,now=Date.now()}){
 const response=await request(URL_LATEST,{timeout:12000,maxBytes:600000,publicOnly:true});
 if(response.status!==200)throw new Error(`سرویس نرخ‌آرا پاسخ HTTP ${response.status} داد`);
 let payload;try{payload=JSON.parse(response.body)}catch{throw new Error('سرویس نرخ‌آرا JSON معتبر برنگرداند')}
 const quotes=parseNerkharaRates(payload,currencies,{now});
 if(!quotes.length)throw new Error('نرخ معتبر و قابل‌تطبیق از نرخ‌آرا دریافت نشد');
 return quotes;
}
