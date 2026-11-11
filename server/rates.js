import {query,tx} from './db.js';
import {getArzdigitalQuotes,validateArzdigitalConfig} from './arzdigital.js';
import {getNerkharaQuotes,validateRateSource} from './nerkhara.js';
import {decrypt} from './security.js';
import {normalizeToman} from './currency-math.js';
import {pinnedRequest} from './outbound.js';

// One configured provider at a time. There is no silent provider fallback.
// Everything stored in exchange_rates is TOMAN per asset unit.
let inflight=null;
const lastUpdated=(rows,source)=>rows.filter(x=>x.source===source).reduce((m,x)=>Math.max(m,Date.parse(x.quoted_at)||0),0);

export async function refreshRates(force=false){
 if(inflight)return inflight;
 inflight=(async()=>{
  const sourceRow=(await query("SELECT config FROM provider_settings WHERE name='rate_source'")).rows[0];
  const chosen=validateRateSource(sourceRow?.config||{});
  const currencies=(await query('SELECT code,navasan_code,arzdigital_code,nerkhara_id,manual_toman FROM currencies ORDER BY code')).rows;
  const current=(await query('SELECT code,price_toman,source,quoted_at FROM exchange_rates')).rows;
  if(chosen.selected==='nerkhara'){
   const last=lastUpdated(current,'نرخ‌آرا');
   if(!force&&last&&Date.now()-last<chosen.refreshMinutes*60_000)return {updated:0,provider:'nerkhara',reason:'هنوز زمان به‌روزرسانی نرخ‌آرا نرسیده است'};
   try{
    const quotes=await getNerkharaQuotes({currencies});
    const updated=await tx(async client=>{
     let count=0;
     for(const quote of quotes){
      const old=(await client.query('SELECT price_toman,source,quoted_at FROM exchange_rates WHERE code=$1 FOR UPDATE',[quote.code])).rows[0];
      if(old?.source==='نرخ‌آرا'&&new Date(old.quoted_at).getTime()>=new Date(quote.quotedAt).getTime())continue;
      const result=await client.query(`INSERT INTO exchange_rates(code,price_toman,source,quoted_at)
       VALUES($1,$2,'نرخ‌آرا',$3)
       ON CONFLICT(code) DO UPDATE SET price_toman=EXCLUDED.price_toman,source='نرخ‌آرا',quoted_at=EXCLUDED.quoted_at
       WHERE exchange_rates.source IS DISTINCT FROM EXCLUDED.source OR exchange_rates.quoted_at < EXCLUDED.quoted_at
       RETURNING code`,[quote.code,quote.price,quote.quotedAt]);
      if(result.rowCount){
       count++;
       if(!old||Number(old.price_toman)!==quote.price)await client.query("INSERT INTO rate_history(code,price_toman,source,at) VALUES($1,$2,'نرخ‌آرا',$3)",[quote.code,quote.price,quote.quotedAt]);
      }
     }
     return count;
    });
    return {updated,provider:'nerkhara',reason:!updated?'نرخ تازه‌تری نسبت به دادهٔ ذخیره‌شده وجود ندارد':undefined};
   }catch(e){
    if(force)throw Object.assign(new Error('دریافت نرخ‌آرا ناموفق بود؛ اتصال سرور، پاسخ سرویس یا تاریخ نرخ‌ها را بررسی کنید'),{status:502});
    return {updated:0,provider:'nerkhara',error:'به‌روزرسانی نرخ‌آرا ناموفق بود؛ نرخ قبلی حفظ شد'};
   }
  }
  if(chosen.selected==='arzdigital'){
   const arzdigital=(await query("SELECT config,encrypted_key FROM provider_settings WHERE name='arzdigital'")).rows[0];
   const cfg=validateArzdigitalConfig(arzdigital?.config||{});
   if(!cfg.enabled)return {updated:0,provider:'arzdigital',reason:'ابتدا API ارزدیجیتال را از تنظیمات فعال کنید'};
   const key=arzdigital?.encrypted_key?decrypt(arzdigital.encrypted_key):process.env.ARZDIGITAL_API_KEY||'';
   if(!key)return {updated:0,provider:'arzdigital',reason:'کلید رسمی API ارزدیجیتال وارد نشده است'};
   const last=lastUpdated(current,'ارزدیجیتال');
   if(!force&&Date.now()-last<cfg.refreshHours*3600000)return {updated:0,provider:'arzdigital',reason:'هنوز زمان به‌روزرسانی نرخ نرسیده است'};
   try{
    const quotes=await getArzdigitalQuotes({key,config:cfg,currencies});
    await tx(async c=>{
     for(const {code,price} of quotes){
      await c.query(`INSERT INTO exchange_rates(code,price_toman,source,quoted_at) VALUES($1,$2,'ارزدیجیتال',now()) ON CONFLICT(code) DO UPDATE SET price_toman=$2,source='ارزدیجیتال',quoted_at=now()`,[code,price]);
      await c.query(`INSERT INTO rate_history(code,price_toman,source) VALUES($1,$2,'ارزدیجیتال')`,[code,price]);
     }
    });
    return {updated:quotes.length,provider:'arzdigital'};
   }catch(e){
    if(force)throw Object.assign(new Error('دریافت نرخ رسمی ارزدیجیتال ناموفق بود؛ کلید، آدرس API و ساختار JSON را بررسی کنید'),{status:502});
    return {error:'دریافت نرخ ارزدیجیتال ناموفق بود',updated:0,provider:'arzdigital'};
   }
  }
  const settings=(await query("SELECT config,encrypted_key FROM provider_settings WHERE name='navasan'")).rows[0];
  const unit=settings?.config?.unit||'RIAL',hours=Math.max(1,Number(settings?.config?.refreshHours)||8);
  const last=lastUpdated(current,'نوسان');
  const key=settings?.encrypted_key?decrypt(settings.encrypted_key):process.env.NAVASAN_API_KEY||'';
  if(!key)return {updated:0,provider:'navasan',reason:'کلید API نوسان تنظیم نشده است'};
  if(!force&&Date.now()-last<hours*3600000)return {updated:0,provider:'navasan',reason:'هنوز زمان به‌روزرسانی نرسیده است'};
  try{
   const response=await pinnedRequest(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(key)}`,{timeout:12000,maxBytes:512000,publicOnly:true});
   if(response.status!==200)throw Error('پاسخ سرویس نرخ معتبر نیست');
   const remote=JSON.parse(response.body);
   if(!remote||typeof remote!=='object'||Array.isArray(remote))throw Error('ساختار پاسخ سرویس نرخ نامعتبر است');
   let count=0;
   for(const c of currencies){
    if(!c.navasan_code)continue;
    const record=remote?.[c.navasan_code];
    if(record?.value==null)continue;
    try{
     const price=normalizeToman(record.value,unit);
     await query(`INSERT INTO exchange_rates(code,price_toman,source,quoted_at) VALUES($1,$2,'نوسان',now()) ON CONFLICT(code) DO UPDATE SET price_toman=$2,source='نوسان',quoted_at=now()`,[c.code,price]);
     await query(`INSERT INTO rate_history(code,price_toman,source) VALUES($1,$2,'نوسان')`,[c.code,price]);
     count++;
    }catch{}
   }
   if(!count)throw Error('هیچ کد ارز قابل دریافت نبود');
   return {updated:count,provider:'navasan'};
  }catch(e){
   if(force)throw Object.assign(new Error('دریافت نرخ نوسان ناموفق بود؛ وضعیت سرویس را بررسی کنید'),{status:502});
   return {updated:0,provider:'navasan',error:'به‌روزرسانی نرخ ناموفق بود'};
  }
 })().finally(()=>{inflight=null});
 return inflight;
}
export async function effectiveRates(){
 const rows=(await query('SELECT c.code,c.manual_toman,e.price_toman,e.source,e.quoted_at FROM currencies c LEFT JOIN exchange_rates e ON e.code=c.code ORDER BY c.code')).rows;
 return rows.map(r=>({code:r.code,price:Number(r.manual_toman??r.price_toman)||null,source:r.manual_toman!=null?'دستی':r.source||'بدون نرخ',updatedAt:r.manual_toman!=null?null:r.quoted_at}));
}
