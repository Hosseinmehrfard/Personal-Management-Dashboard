import {query} from './db.js';
import {decrypt} from './security.js';
import {normalizeToman} from './currency-math.js';
import {pinnedRequest} from './outbound.js';
// Navasan's public documentation describes IRR values. All persisted/displayed rates are TOMAN.
let inflight=null;
export async function refreshRates(force=false){
 if(inflight)return inflight;
 inflight=(async()=>{
  const settings=(await query(`SELECT config,encrypted_key FROM provider_settings WHERE name='navasan'`)).rows[0];
  const unit=settings?.config?.unit||'RIAL',hours=Math.max(1,Number(settings?.config?.refreshHours)||8);
  const currencies=(await query(`SELECT code,navasan_code,manual_toman FROM currencies ORDER BY code`)).rows;
  const current=(await query(`SELECT code,price_toman,source,quoted_at FROM exchange_rates`)).rows;
  const lastProvider=current.filter(x=>x.source==='نوسان').reduce((m,x)=>Math.max(m,Date.parse(x.quoted_at)),0);
  const key=settings?.encrypted_key?decrypt(settings.encrypted_key):process.env.NAVASAN_API_KEY||'';
  const due=Date.now()-lastProvider>=hours*3600000;
  if(key&&(force||due)){
   try{
    const response=await pinnedRequest(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(key)}`,{timeout:12000,maxBytes:512000,publicOnly:true});
    if(response.status!==200)throw Error('پاسخ سرویس نرخ معتبر نیست');
    const remote=JSON.parse(response.body);if(!remote||typeof remote!=='object'||Array.isArray(remote))throw Error('ساختار پاسخ سرویس نرخ نامعتبر است');let count=0;
    for(const c of currencies){if(!c.navasan_code)continue;const record=remote?.[c.navasan_code];if(record?.value==null)continue;try{const price=normalizeToman(record.value,unit);await query(`INSERT INTO exchange_rates(code,price_toman,source,quoted_at) VALUES($1,$2,'نوسان',now()) ON CONFLICT(code) DO UPDATE SET price_toman=$2,source='نوسان',quoted_at=now()`,[c.code,price]);await query(`INSERT INTO rate_history(code,price_toman,source) VALUES($1,$2,'نوسان')`,[c.code,price]);count++}catch{}}
    if(!count)throw Error('هیچ کد ارز قابل دریافت نبود؛ کدهای نوسان را بررسی کنید');
    return {updated:count};
   }catch(e){if(force)throw Error('دریافت نرخ انجام نشد؛ وضعیت سرویس را بررسی کنید');return {error:'به‌روزرسانی نرخ ناموفق بود',updated:0}}
  }
  return {updated:0,reason:!key?'کلید API تنظیم نشده': 'هنوز زمان به‌روزرسانی نرسیده است'};
 })().finally(()=>inflight=null);
 return inflight;
}
export async function effectiveRates(){
 const rows=(await query(`SELECT c.code,c.manual_toman,e.price_toman,e.source,e.quoted_at FROM currencies c LEFT JOIN exchange_rates e ON e.code=c.code ORDER BY c.code`)).rows;
 return rows.map(r=>({code:r.code,price:Number(r.manual_toman??r.price_toman)||null,source:r.manual_toman!=null?'دستی':r.source||'بدون نرخ',updatedAt:r.manual_toman!=null?null:r.quoted_at}));
}
