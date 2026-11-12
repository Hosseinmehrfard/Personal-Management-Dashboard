import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {query,tx,migrate,pool,claimLegacy} from './db.js';
import {OWNED_TABLES,canManageGlobal} from './tenancy.js';
import {validateGithubRepo, githubDispatch, githubStatus} from './updates.js';
import {encrypt,decrypt,encryptionReady,randomToken,digest,safeString,moneyNumber,safeUrl,passwordOK,hashPassword,secureEqual,normalizeAdminUsername,validAdminPassword} from './security.js';
import {effectiveRates,refreshRates,rateSnapshot} from './rates.js';
import {DEFAULT_ARZDIGITAL,validateArzdigitalConfig} from './arzdigital.js';
import {validateRateSource,validateNerkharaId} from './nerkhara.js';
import {agentAllowedHost,pinnedRequest,validateMetrics,safeDocHost} from './outbound.js';

const app=express();
app.disable('x-powered-by');
app.set('trust proxy',process.env.TRUST_PROXY==='1'?1:false);
const PUBLIC_ORIGIN=String(process.env.PUBLIC_ORIGIN||'').replace(/\/$/,'');
if(PUBLIC_ORIGIN&&(!/^https:\/\/[a-z0-9.-]+$/i.test(PUBLIC_ORIGIN)||PUBLIC_ORIGIN.includes('..')))throw new Error('PUBLIC_ORIGIN معتبر نیست');
const SESSION_AGE=24*3600*1000;
app.use((req,res,next)=>{
 res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-DNS-Prefetch-Control':'off','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"});
 if(PUBLIC_ORIGIN.startsWith('https://'))res.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
 if(req.path.startsWith('/api/')||req.path==='/health')res.set('Cache-Control','no-store');
 next();
});
// Only JSON payloads are accepted. The import endpoint is intentionally larger,
// but still bounded; multipart uploads and arbitrary files are not supported.
app.use((req,res,next)=>{
 if(!['POST','PUT','PATCH','DELETE'].includes(req.method)||!req.path.startsWith('/api/'))return next();
 if(!['POST','PUT','PATCH'].includes(req.method)||req.path==='/api/logout')return next();
 if(!/^application\/json(?:\s*;|$)/i.test(req.get('content-type')||''))return res.status(415).json({error:'فقط JSON مجاز است'});
 const limit=req.path==='/api/import/legacy'?'5mb':'48kb';
 express.json({limit,strict:true,type:'application/json'})(req,res,next);
});
function cookieName(req){return req.secure?'__Host-markaz_session':'markaz_session'}
function setCookie(req,res,value,expires=SESSION_AGE){
 if(PUBLIC_ORIGIN.startsWith('https://')&&!req.secure)throw Object.assign(new Error('برای نشست مدیر HTTPS ضروری است'),{status:403});
 res.cookie(cookieName(req),value,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:expires,path:'/',priority:'high'});
}
function clearCookie(req,res){res.clearCookie(cookieName(req),{httpOnly:true,sameSite:'strict',secure:req.secure,path:'/'});}
function responseError(res,e){const msg=String(e.message||'خطای داخلی');const expected=e.status||(/شناسه|نامعتبر|ضروری|معتبر نیست|نیست|قابل قبول|ناموجود|پرداخت/.test(msg)?400:500);if(e.code==='23503')return res.status(409).json({error:'این مورد دارای اطلاعات وابسته است؛ ابتدا وابستگی‌ها را ویرایش یا حذف کنید'});if(e.code==='23505')return res.status(409).json({error:'این شناسه یا کد قبلاً ثبت شده است'});if(expected>=500)console.error('Request failure',e.code||e.name||'InternalError');return res.status(expected).json({error:expected>=500?'خطای داخلی سرور':msg})}
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(e=>responseError(res,e));
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const val=(v,max=300,required=false)=>{const s=safeString(v,max);if(required&&!s)fail('فیلد الزامی خالی است');return s};
const idOf=v=>{const id=val(v,100,true);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))fail('شناسه نامعتبر است');return id};
const dateOf=v=>{if(v===null||v===''||v===undefined)return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(new Date(v+'T00:00:00Z').getTime())||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('تاریخ نامعتبر است');return v};
const numOrNull=v=>v===null||v===undefined||v===''?null:moneyNumber(v);
const numberOrZero=v=>v===null||v===''||v===undefined?0:moneyNumber(v,true);
const allow=(v,items,def)=>items.includes(v)?v:def;
const timestampOf=v=>{if(v===null||v===undefined||v==='')return null;if(typeof v!=='string'||v.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v)))fail('زمان نامعتبر است');return new Date(v).toISOString()};
const TYPES={
 tasks:{table:'tasks',fields:['title','category','status','priority','due_date','notes','chapter_id','class_id'],shape:v=>({title:val(v.title,180,true),category:allow(v.category,['work','personal','server','class','owasp','finance'],'work'),status:allow(v.status,['todo','progress','review','done'],'todo'),priority:allow(v.priority,['low','medium','high'],'medium'),due_date:dateOf(v.due_date??v.due),notes:val(v.notes,8000),chapter_id:val(v.chapter_id??v.chapterId,100)||null,class_id:val(v.class_id??v.classId,100)||null})},
 servers:{table:'servers',fields:['name','host','environment','mode','notes'],shape:v=>({name:val(v.name,120,true),host:val(v.host,200),environment:allow(v.environment,['production','staging','development','other'],'production'),mode:allow(v.mode,['manual','agent'],'manual'),notes:val(v.notes,8000)})},
 transactions:{table:'transactions',fields:['type','amount','date','category','description','installment_id'],shape:v=>({type:allow(v.type,['income','expense','installment'],'expense'),amount:moneyNumber(v.amount),date:dateOf(v.date)||fail('تاریخ ضروری است'),category:val(v.category,80)||'عمومی',description:val(v.description,220,true),installment_id:val(v.installment_id??v.installmentId,100)||null})},
 installments:{table:'installments',fields:['title','total','paid','monthly','due_date','notes'],shape:v=>{const total=moneyNumber(v.total),paid=numberOrZero(v.paid);if(paid>total)fail('مجموع پرداخت نباید از کل تعهد بیشتر باشد');return {title:val(v.title,180,true),total,paid,monthly:numberOrZero(v.monthly),due_date:dateOf(v.due_date??v.dueDate),notes:val(v.notes,8000)}}},
 holdings:{table:'holdings',fields:['asset','quantity','note'],shape:v=>({asset:val(v.asset,12,true).toUpperCase(),quantity:moneyNumber(v.quantity,true),note:val(v.note,1000)})},
 currencies:{table:'currencies',pk:'code',fields:['name','symbol','unit','navasan_code','arzdigital_code','nerkhara_id','manual_toman'],shape:v=>({name:val(v.name,100,true),symbol:val(v.symbol,16,true),unit:val(v.unit,50,true),navasan_code:val(v.navasan_code??v.navasanCode,40).toLowerCase()||null,arzdigital_code:val(v.arzdigital_code??v.arzdigitalCode,32).toUpperCase()||null,nerkhara_id:validateNerkharaId(v.nerkhara_id??null),manual_toman:numOrNull(v.manual_toman??v.manualToman)})},
 classes:{table:'classes',fields:['title','description','status','notes'],shape:v=>({title:val(v.title,200,true),description:val(v.description,8000),status:allow(v.status,['todo','progress','review','done'],'todo'),notes:val(v.notes,12000)})},
 chapters:{table:'chapters',fields:['code','title','en','description','status','verified','notes','class_id'],shape:v=>({code:val(v.code,35)||'CUSTOM',title:val(v.title,200,true),en:val(v.en,230),description:val(v.description,8000),status:allow(v.status,['todo','progress','review','done'],'todo'),verified:Boolean(v.verified),notes:val(v.notes,12000),class_id:idOf(v.class_id??v.classId)})},
 topics:{table:'topics',fields:['chapter_id','title','status','notes','verified'],shape:v=>({chapter_id:idOf(v.chapter_id??v.chapterId),title:val(v.title,250,true),status:allow(v.status,['todo','progress','review','done'],'todo'),notes:val(v.notes,8000),verified:Boolean(v.verified)})},
 resources:{table:'resources',fields:['chapter_id','title','url','status','notes','checked_at'],shape:v=>({chapter_id:idOf(v.chapter_id??v.chapterId),title:val(v.title,250,true),url:safeUrl(val(v.url,2048,true)),status:allow(v.status,['pending','verified','broken','review'],'pending'),notes:val(v.notes,5000),checked_at:timestampOf(v.checked_at??v.checkedAt)})}
};
async function assertOwnedReference(client,table,id,userId){
 if(!id)return;
 if(!(await client.query(`SELECT 1 FROM "${table}" WHERE id=$1 AND user_id=$2`,[id,userId])).rowCount)fail('رکورد وابسته متعلق به فضای کاری شما نیست',404);
}
async function putRecord(client,kind,key,input,userId){
 const info=TYPES[kind];if(!info)fail('بخش نامعتبر');
 const owned=kind!=='currencies';if(owned&&!userId)fail('شناسه مالک الزامی است',403);
 const pk=info.pk||'id',data=info.shape(input),fields=info.fields;
 if(kind==='currencies'){
  if(data.navasan_code&&!/^[a-z0-9_]{1,40}$/.test(data.navasan_code))fail('کد نماد API نامعتبر است');
  if(data.arzdigital_code&&!/^[A-Z0-9_-]{1,32}$/.test(data.arzdigital_code))fail('کد نماد ارزدیجیتال نامعتبر است');
  if(key==='TOMAN'){data.manual_toman=1;data.navasan_code=null;data.arzdigital_code=null;data.nerkhara_id=null;}
  if(!/^[A-Z0-9]{2,12}$/.test(key))fail('کد ارز نامعتبر است');
 }
 if(owned){
  if((kind==='topics'||kind==='resources')&&data.chapter_id)await assertOwnedReference(client,'chapters',data.chapter_id,userId);
  if(kind==='chapters')await assertOwnedReference(client,'classes',data.class_id,userId);
  if(kind==='tasks'){
   if(data.class_id)await assertOwnedReference(client,'classes',data.class_id,userId);
   if(data.chapter_id)await assertOwnedReference(client,'chapters',data.chapter_id,userId);
  }
  if(kind==='transactions'&&data.installment_id)await assertOwnedReference(client,'installments',data.installment_id,userId);
 }
 const columns=[pk,...fields,...(owned?['user_id']:[])],vals=[key,...fields.map(f=>data[f]),...(owned?[userId]:[])];
 const update=fields.map(f=>`"${f}"=EXCLUDED."${f}"`).join(',');
 const oldManual=kind==='currencies'?(await client.query('SELECT manual_toman FROM currencies WHERE code=$1',[key])).rows[0]?.manual_toman:null;
 const where=owned?` WHERE "${info.table}".user_id=EXCLUDED.user_id`:'';
 const result=await client.query(`INSERT INTO "${info.table}"(${columns.map(c=>'"'+c+'"').join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT("${pk}") DO UPDATE SET ${update}${where} RETURNING *`,vals);
 if(!result.rowCount)fail('رکورد مربوط به کاربر دیگری است',404);
 if(kind==='currencies'&&data.manual_toman!==null&&Number(oldManual)!==Number(data.manual_toman))await client.query("INSERT INTO rate_history(code,price_toman,source) VALUES($1,$2,'دستی')",[key,data.manual_toman]);
 return result.rows[0];
}
function logActivity(client,text,kind='system',userId){
 if(!userId)return Promise.resolve();
 return client.query('INSERT INTO activities(id,kind,text,user_id) VALUES($1,$2,$3,$4)',[randomUUID(),kind,text.slice(0,500),userId]);
}
async function dashboard(userId){
 const keys=['tasks','servers','transactions','installments','holdings','classes','chapters','topics','resources','activities'];
 const results=await Promise.all(keys.map(k=>query(`SELECT * FROM "${k}" WHERE user_id=$1 ORDER BY ${k==='activities'?'at DESC':k==='classes'?'title':k==='chapters'?'code':k==='transactions'?'date DESC':'created_at DESC'} ${k==='activities'?'LIMIT 100':''}`,[userId])));
 const data=Object.fromEntries(keys.map((k,i)=>[k,results[i].rows]));
 const currencies=await query(`SELECT c.*,COALESCE(p.visible,true) AS is_visible FROM currencies c LEFT JOIN user_currency_preferences p ON p.code=c.code AND p.user_id=$1 ORDER BY c.code`,[userId]);
 return {...data,currencies:currencies.rows,...await rateSnapshot()};
}
app.get('/health',wrap(async(req,res)=>{await query('SELECT 1');res.json({ok:true})}));
// Database-backed throttling survives restarts and works across app instances.
function bucket(kind,value){return digest(process.env.SESSION_SECRET+':'+kind+':'+String(value).toLowerCase())}
async function throttle(keys,maximum){
 for(const key of keys){const row=(await query('SELECT attempts,window_end FROM auth_attempts WHERE bucket=$1',[key])).rows[0];if(row&&new Date(row.window_end)>new Date()&&row.attempts>=maximum)fail('درخواست‌های ناموفق زیاد است؛ بعداً تلاش کنید',429)}
}
async function recordFailure(keys){
 for(const key of keys)await query(`INSERT INTO auth_attempts(bucket,attempts,window_end) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_end<now() THEN 1 ELSE auth_attempts.attempts+1 END,window_end=CASE WHEN auth_attempts.window_end<now() THEN now()+interval '15 minutes' ELSE auth_attempts.window_end END`,[key]);
}
async function clearFailures(keys){await query('DELETE FROM auth_attempts WHERE bucket=ANY($1::text[])',[keys]);}
function authOrigin(req){
 if(req.get('sec-fetch-site')==='cross-site')fail('مبدأ درخواست مجاز نیست',403);
 const origin=req.get('origin');
 const expected=PUBLIC_ORIGIN||`${req.protocol}://${req.get('host')}`;
 if(origin&&origin!==expected)fail('مبدأ درخواست مجاز نیست',403);
 if(PUBLIC_ORIGIN&&req.get('host')!==new URL(PUBLIC_ORIGIN).host)fail('دامنه درخواست نامعتبر است',403);
}
const validUsername=value=>{
 const username=normalizeAdminUsername(value);
 if(!username)fail('نام کاربری باید ۳ تا ۳۲ نویسه لاتین و با حرف شروع شود');
 return username;
};
function validNewPassword(value){
 if(!validAdminPassword(value))fail('رمز عبور باید ۱۲ تا ۲۵۶ نویسه باشد و فاصله اضافی ابتدا یا انتها نداشته باشد');
 return value;
}
async function createSession(req,res,user){
 const token=randomToken(),csrf=randomToken();
 await query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval \'1 day\')',[digest(token),user.id,csrf]);
 setCookie(req,res,token);
 res.json({ok:true,csrf,username:user.username,role:user.role||'admin'});
}
async function getSession(req){
 const name=cookieName(req)+'=';const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name))?.slice(name.length);
 if(!cookie||!/^[a-f0-9]{64}$/.test(cookie))return null;
 const found=await query('SELECT s.token_hash,s.user_id,s.csrf,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[digest(cookie)]);
 return found.rows[0]||null;
}
app.get('/api/auth/status',wrap(async(req,res)=>{
 const s=await getSession(req);
 const hasAdmin=(await query('SELECT EXISTS(SELECT 1 FROM users) AS has_admin')).rows[0].has_admin;
 res.json({authenticated:!!s,needsSetup:!hasAdmin,csrf:s?.csrf||null,username:s?.username||null,role:s?.role||null});
}));
app.post('/api/setup',wrap(async(req,res)=>{
 authOrigin(req);
 const keys=[bucket('setup-ip',req.ip||'unknown')];await throttle(keys,8);
 const setupToken=String(process.env.SETUP_TOKEN||'').trim().toLowerCase();
 if(!/^[a-f0-9]{64}$/i.test(setupToken))fail('کد راه‌اندازی روی سرور تنظیم نشده است',503);
 const code=String(req.body?.setupCode||'').trim().toLowerCase();
 // Require the secret from the installer to prevent takeover of a newly published site.
 if(!secureEqual(code,setupToken)){
  await recordFailure(keys);
  fail('کد یک‌بارمصرف راه‌اندازی نادرست است',403);
 }
 const username=validUsername(req.body?.username);
 const password=validNewPassword(req.body?.password);
 if(req.body?.confirm!==password)fail('تکرار رمز عبور مطابقت ندارد');
 // Serialize competing first-account requests across all Node.js instances.
 const user=await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(7200341, 1)');
  const exists=await c.query('SELECT 1 FROM users LIMIT 1');
  if(exists.rowCount)fail('مدیر قبلاً ساخته شده است. از صفحه ورود استفاده کنید',409);
  const u={id:randomUUID(),username};
  await c.query("INSERT INTO users(id,username,password_hash,role) VALUES($1,$2,$3,'admin')",[u.id,u.username,await hashPassword(password)]);
  await claimLegacy(c,u.id);
  await logActivity(c,'ساخت حساب مدیر در راه‌اندازی اولیه','security',u.id);
  return u;
 });
 await clearFailures(keys);
 await createSession(req,res,user);
}));
const dummyHash=hashPassword(randomToken());
app.post('/api/login',wrap(async(req,res)=>{
 authOrigin(req);
 const username=normalizeAdminUsername(req.body?.username);
 const ipKey=bucket('login-ip',req.ip||'unknown');
 const userKey=bucket('login-username',username||'invalid');
 await throttle([ipKey],8);await throttle([userKey],24);
 const user=username?(await query('SELECT id,username,password_hash,role,active FROM users WHERE username=$1',[username])).rows[0]:null;
 // Equal-cost verification for known and unknown users reduces account enumeration.
 const sampleHash=user?.password_hash||await dummyHash;
 if(!await passwordOK(String(req.body?.password||''),sampleHash)||!user||user.active===false){
  await recordFailure([ipKey,userKey]);fail('نام کاربری یا رمز عبور نادرست است',401);
 }
 if(!user.password_hash.startsWith('scrypt-v2$'))await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await hashPassword(req.body.password),user.id]);
 await clearFailures([ipKey,userKey]);
 await createSession(req,res,user);
}));
app.use('/api',wrap(async(req,res,next)=>{
 const s=await getSession(req);if(!s)fail('ورود لازم است',401);req.session=s;
 if(!['GET','HEAD'].includes(req.method)){
  authOrigin(req);
  if(req.get('x-csrf-token')!==s.csrf)fail('نشانه امنیتی درخواست نامعتبر است',403);
 }
 next();
}));
app.post('/api/logout',wrap(async(req,res)=>{await query('DELETE FROM sessions WHERE token_hash=$1',[req.session.token_hash]);clearCookie(req,res);res.json({ok:true})}));
app.post('/api/account/password',wrap(async(req,res)=>{const {current,password}=req.body||{};const user=(await query('SELECT password_hash FROM users WHERE id=$1',[req.session.user_id])).rows[0];if(!await passwordOK(current,user.password_hash))fail('رمز فعلی صحیح نیست',403);validNewPassword(password);await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await hashPassword(password),req.session.user_id]);await query('DELETE FROM sessions WHERE user_id=$1',[req.session.user_id]);clearCookie(req,res);res.json({ok:true})}));
app.post('/api/account/username',wrap(async(req,res)=>{
 const username=validUsername(req.body?.username);
 const password=String(req.body?.current||'');
 const user=(await query('SELECT password_hash FROM users WHERE id=$1',[req.session.user_id])).rows[0];
 if(!user||!await passwordOK(password,user.password_hash))fail('رمز فعلی صحیح نیست',403);
 await tx(async c=>{
  await c.query('UPDATE users SET username=$1 WHERE id=$2',[username,req.session.user_id]);
  await c.query('DELETE FROM sessions WHERE user_id=$1',[req.session.user_id]);
  await logActivity(c,'تغییر نام کاربری حساب','security',req.session.user_id);
 });
 clearCookie(req,res);res.json({ok:true});
}));
function requireAdmin(req){if(!canManageGlobal(req.session?.role))fail('فقط مدیر اصلی مجاز است',403)}
app.get('/api/admin/users',wrap(async(req,res)=>{
 requireAdmin(req);const result=await query(`SELECT id,username,role,active,created_at FROM users ORDER BY created_at ASC`);res.json(result.rows);
}));
app.post('/api/admin/users',wrap(async(req,res)=>{
 requireAdmin(req);const username=validUsername(req.body?.username),password=validNewPassword(req.body?.password);
 if(req.body?.confirm!==password)fail('تکرار رمز با رمز عبور یکسان نیست');
 const record=await tx(async c=>{
  const u={id:randomUUID(),username};
  await c.query(`INSERT INTO users(id,username,password_hash,role) VALUES($1,$2,$3,'user')`,[u.id,username,await hashPassword(password)]);
  await logActivity(c,'افزودن کاربر '+username,'security',req.session.user_id);return u;
 });res.status(201).json({id:record.id,username:record.username,role:'user',active:true});
}));
app.put('/api/admin/users/:id',wrap(async(req,res)=>{
 requireAdmin(req);const id=idOf(req.params.id);if(id===req.session.user_id)fail('حساب مدیر از این بخش تغییر نمی‌کند');
 const {active,password}=req.body||{};if(active===undefined&&password===undefined)fail('تغییری مشخص نشده است');
 if(active!==undefined&&typeof active!=='boolean')fail('وضعیت حساب باید صحیح باشد');
 const hash=password!==undefined?await hashPassword(validNewPassword(password)):null;
 await tx(async c=>{
  const old=await c.query("SELECT 1 FROM users WHERE id=$1 AND role='user' FOR UPDATE",[id]);if(!old.rowCount)fail('کاربر پیدا نشد',404);
  if(active!==undefined)await c.query('UPDATE users SET active=$1 WHERE id=$2',[active,id]);
  if(hash)await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,id]);
  await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
  await logActivity(c,'تغییر وضعیت دسترسی کاربر','security',req.session.user_id);
 });res.json({ok:true});
}));
app.put('/api/currencies/:code/visibility',wrap(async(req,res)=>{
 const code=val(req.params.code,12,true).toUpperCase();if(typeof req.body?.visible!=='boolean')fail('وضعیت نمایش نامعتبر است');
 if(!(await query('SELECT 1 FROM currencies WHERE code=$1',[code])).rowCount)fail('ارز پیدا نشد',404);
 if(code==='TOMAN'&&!req.body.visible)fail('تومان باید همیشه قابل انتخاب باشد');
 await query(`INSERT INTO user_currency_preferences(user_id,code,visible) VALUES($1,$2,$3) ON CONFLICT(user_id,code) DO UPDATE SET visible=EXCLUDED.visible`,[req.session.user_id,code,req.body.visible]);
 res.json({ok:true});
}));
app.get('/api/dashboard',wrap(async(req,res)=>res.json(await dashboard(req.session.user_id))));
for(const kind of Object.keys(TYPES)){
 const isGlobal=kind==='currencies';
 app.post('/api/'+kind,wrap(async(req,res)=>{
  if(isGlobal)requireAdmin(req);
  const key=isGlobal?val(req.body.code,12,true).toUpperCase():randomUUID();
  const obj=await tx(async c=>{
   if(isGlobal&&(await c.query('SELECT 1 FROM currencies WHERE code=$1',[key])).rowCount)fail('این کد ارز از قبل وجود دارد',409);
   const o=await putRecord(c,kind,key,req.body||{},req.session.user_id);
   await logActivity(c,'افزودن '+kind+': '+(o.title||o.name||o.code||key),kind,req.session.user_id);return o;
  });res.status(201).json(obj);
 }));
 app.put('/api/'+kind+'/:id',wrap(async(req,res)=>{
  if(isGlobal)requireAdmin(req);
  const key=isGlobal?val(req.params.id,12,true).toUpperCase():idOf(req.params.id);
  const lookup=isGlobal?'':' AND user_id=$2';
  const args=isGlobal?[key]:[key,req.session.user_id];
  const item=await tx(async c=>{
   const existing=await c.query(`SELECT * FROM "${TYPES[kind].table}" WHERE "${TYPES[kind].pk||'id'}"=$1${lookup} FOR UPDATE`,args);
   if(!existing.rowCount)fail('رکورد پیدا نشد',404);
   const o=await putRecord(c,kind,key,{...existing.rows[0],...req.body},req.session.user_id);
   await logActivity(c,'ویرایش '+kind+': '+(o.title||o.name||key),kind,req.session.user_id);return o;
  });res.json(item);
 }));
 app.delete('/api/'+kind+'/:id',wrap(async(req,res)=>{
  if(isGlobal)requireAdmin(req);
  const key=isGlobal?val(req.params.id,12,true).toUpperCase():idOf(req.params.id);
  await tx(async c=>{
   if(isGlobal){const currency=(await c.query('SELECT is_default FROM currencies WHERE code=$1',[key])).rows[0];if(currency?.is_default)fail('ارز پیش‌فرض را نمی‌توان حذف کرد')}
   const args=isGlobal?[key]:[key,req.session.user_id];
   const check=isGlobal?'':' AND user_id=$2';
   const o=await c.query(`DELETE FROM "${TYPES[kind].table}" WHERE "${TYPES[kind].pk||'id'}"=$1${check} RETURNING *`,args);
   if(!o.rowCount)fail('مورد پیدا نشد',404);
   await logActivity(c,'حذف '+kind+' / '+key,kind,req.session.user_id);
  });res.json({ok:true});
 }));
}
app.post('/api/installments/:id/pay',wrap(async(req,res)=>{const id=idOf(req.params.id),amount=moneyNumber(req.body?.amount),date=dateOf(req.body?.date)||new Date().toISOString().slice(0,10);
 const result=await tx(async c=>{const item=(await c.query('SELECT * FROM installments WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,req.session.user_id])).rows[0];if(!item)fail('قسط پیدا نشد',404);const pending=Number(item.total)-Number(item.paid);if(amount>pending+0.001)fail('مبلغ پرداخت از باقی‌مانده بیشتر است');await c.query('UPDATE installments SET paid=paid+$1 WHERE id=$2 AND user_id=$3',[amount,id,req.session.user_id]);const entry={type:'installment',amount,date,category:'اقساط',description:'پرداخت '+item.title,installment_id:id};const txRow=await putRecord(c,'transactions',randomUUID(),entry,req.session.user_id);await logActivity(c,'پرداخت قسط '+item.title+' به مبلغ '+amount,'finance',req.session.user_id);return txRow});res.json(result)}));
app.put('/api/servers/:id/metrics',wrap(async(req,res)=>{const id=idOf(req.params.id),m=req.body||{};for(const k of ['cpu','memory','disk'])if(typeof m[k]!=='object'||m[k]===null)fail('داده منابع ناقص است');const metrics=validateMetrics(m);const updated=await query("UPDATE servers SET metrics=$1,metrics_source='manual',metrics_at=now(),updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING id",[metrics,id,req.session.user_id]);if(!updated.rowCount)fail('سرور یافت نشد',404);res.json(metrics)}));
app.post('/api/servers/:id/agent',wrap(async(req,res)=>{const id=idOf(req.params.id),url=agentAllowedHost(val(req.body.url,500,true)).href,token=val(req.body.token,512,true);if(token.length<32)fail('توکن عامل حداقل ۳۲ نویسه باشد');if(!(await query('SELECT 1 FROM servers WHERE id=$1 AND user_id=$2',[id,req.session.user_id])).rowCount)fail('سرور یافت نشد',404);await query('INSERT INTO agents(server_id,url,encrypted_token) VALUES($1,$2,$3) ON CONFLICT(server_id) DO UPDATE SET url=$2,encrypted_token=$3',[id,url,encrypt(token)]);await query("UPDATE servers SET mode='agent' WHERE id=$1 AND user_id=$2",[id,req.session.user_id]);res.json({ok:true})}));
app.delete('/api/servers/:id/agent',wrap(async(req,res)=>{const id=idOf(req.params.id);await query('DELETE FROM agents WHERE server_id=$1 AND EXISTS(SELECT 1 FROM servers WHERE id=$1 AND user_id=$2)',[id,req.session.user_id]);await query("UPDATE servers SET mode='manual' WHERE id=$1 AND user_id=$2",[id,req.session.user_id]);res.json({ok:true})}));
app.post('/api/servers/:id/poll',wrap(async(req,res)=>{const id=idOf(req.params.id),a=(await query('SELECT a.url,a.encrypted_token FROM agents a JOIN servers s ON s.id=a.server_id WHERE a.server_id=$1 AND s.user_id=$2',[id,req.session.user_id])).rows[0];if(!a)fail('عامل پایش تنظیم نشده',404);agentAllowedHost(a.url);const response=await pinnedRequest(new URL('/metrics',a.url).href,{headers:{Authorization:'Bearer '+decrypt(a.encrypted_token)},timeout:8000,publicOnly:false});if(response.status!==200)fail('پاسخ عامل پایش نامعتبر است',502);let m;try{m=validateMetrics(JSON.parse(response.body))}catch{fail('داده عامل پایش نامعتبر است',502)}await query("UPDATE servers SET metrics=$1,metrics_source='agent',metrics_at=now(),updated_at=now() WHERE id=$2 AND user_id=$3",[m,id,req.session.user_id]);res.json(m)}));
app.get('/api/settings/provider',wrap(async(req,res)=>{requireAdmin(req);const x=(await query("SELECT encrypted_key,config FROM provider_settings WHERE name='navasan'")).rows[0];res.json({configured:Boolean(x?.encrypted_key||process.env.NAVASAN_API_KEY),unit:x?.config?.unit||'RIAL',refreshHours:x?.config?.refreshHours||8})}));
app.put('/api/settings/provider',wrap(async(req,res)=>{requireAdmin(req);const b=req.body||{},unit=allow(b.unit,['RIAL','TOMAN'],'RIAL'),refreshHours=Number(b.refreshHours);if(!Number.isInteger(refreshHours)||refreshHours<1||refreshHours>168)fail('فاصله به‌روزرسانی باید ۱ تا ۱۶۸ ساعت باشد');const key=b.key?val(b.key,256,true):null;
 await tx(async c=>{const previous=(await c.query("SELECT config FROM provider_settings WHERE name='navasan'")).rows[0];await c.query("UPDATE provider_settings SET config=$1,encrypted_key=CASE WHEN $2::boolean THEN NULL WHEN $3::text IS NOT NULL THEN $3 ELSE encrypted_key END,updated_at=now() WHERE name='navasan'",[{unit,refreshHours},b.clearKey===true,key?encrypt(key):null]);if(previous?.config?.unit!==unit||key||b.clearKey)await c.query("DELETE FROM exchange_rates WHERE source='نوسان'");});res.json({ok:true})}));
// ArzDigital official API: activate only after receiving authorized credentials/docs.
app.get('/api/settings/arzdigital',wrap(async(req,res)=>{requireAdmin(req);
 const x=(await query("SELECT encrypted_key,config FROM provider_settings WHERE name='arzdigital'")).rows[0];
 res.json({...DEFAULT_ARZDIGITAL,...x?.config,configured:Boolean(x?.encrypted_key||process.env.ARZDIGITAL_API_KEY)});
}));
app.put('/api/settings/arzdigital',wrap(async(req,res)=>{requireAdmin(req);
 const cfg=validateArzdigitalConfig(req.body||{});
 const key=req.body?.key?val(req.body.key,512,true):null;
 if(key&&(key.includes('\n')||key.includes('\r')))fail('کلید API نامعتبر است');
 await tx(async c=>{
  await c.query(`INSERT INTO provider_settings(name,config,encrypted_key,updated_at) VALUES('arzdigital',$1,$2,now()) ON CONFLICT(name) DO UPDATE SET config=$1,encrypted_key=CASE WHEN $3::boolean THEN NULL WHEN $2::text IS NOT NULL THEN $2 ELSE provider_settings.encrypted_key END,updated_at=now()`,[cfg,key?encrypt(key):null,req.body?.clearKey===true]);
 });
 res.json({ok:true});
}));
// Selected rate provider: explicit choice, no silent fallback or exposed API credentials.
app.get('/api/settings/rate-source',wrap(async(req,res)=>{requireAdmin(req);
 const x=(await query("SELECT config FROM provider_settings WHERE name='rate_source'")).rows[0];
 res.json(validateRateSource(x?.config||{}));
}));
app.put('/api/settings/rate-source',wrap(async(req,res)=>{requireAdmin(req);
 const config=validateRateSource(req.body||{});
 await query("INSERT INTO provider_settings(name,config,updated_at) VALUES('rate_source',$1,now()) ON CONFLICT(name) DO UPDATE SET config=EXCLUDED.config,updated_at=now()",[config]);
 res.json({ok:true,...config});
}));
app.get('/api/rates',wrap(async(req,res)=>res.json(await effectiveRates())));
app.get('/api/rates/snapshot',wrap(async(req,res)=>res.json(await rateSnapshot())));
app.post('/api/rates/refresh',wrap(async(req,res)=>{
 requireAdmin(req);
 const result=await refreshRates(true);
 if(result.error)return res.status(502).json({error:result.error});
 res.json({...result,...await rateSnapshot()});
}));
app.get('/api/links/check',wrap(async(req,res)=>{const target=new URL(safeUrl(String(req.query.url||'')));const host=target.hostname.toLowerCase();if(!safeDocHost(host))fail('بررسی خودکار فقط برای دامنه‌های مستندات شناخته‌شده مجاز است');const r=await pinnedRequest(target.href,{method:'HEAD',maxBytes:0,timeout:6500,publicOnly:true});res.json({ok:r.status>=200&&r.status<400,status:r.status,checkedAt:new Date().toISOString()})}));
app.get('/api/export',wrap(async(req,res)=>{const data=await dashboard(req.session.user_id);const history=(await query('SELECT code,price_toman,source,at FROM rate_history ORDER BY at DESC LIMIT 10000')).rows;const quotes=(await query('SELECT * FROM exchange_rates')).rows;res.setHeader('Content-Disposition','attachment; filename="personal-dashboard-backup.json"');res.json({version:6,exportedAt:new Date().toISOString(),...data,rate_history:history,exchange_rates:quotes})}));
app.post('/api/import/legacy',wrap(async(req,res)=>{requireAdmin(req);
 const old=req.body||{};
 if(!old||typeof old!=='object'||Array.isArray(old)||!Array.isArray(old.tasks)||!Array.isArray(old.chapters)||!Array.isArray(old.holdings))fail('ساختار فایل پشتیبان معتبر نیست');
 for(const k of ['tasks','chapters','holdings','servers','transactions','installments','currencies','topics','resources','activities','rate_history','exchange_rates','classes'])if(old[k]!==undefined&&(!Array.isArray(old[k])||old[k].length>5000))fail('حجم یا ساختار پشتیبان نامعتبر است');
 let imported=0;
 await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(7200341, 2)');
  const existing=(await c.query('SELECT (SELECT count(*) FROM tasks WHERE user_id=$1)+(SELECT count(*) FROM holdings WHERE user_id=$1)+(SELECT count(*) FROM transactions WHERE user_id=$1)+(SELECT count(*) FROM servers WHERE user_id=$1)+(SELECT count(*) FROM classes WHERE user_id=$1)+(SELECT count(*) FROM chapters WHERE user_id=$1) AS n',[req.session.user_id])).rows[0];
  if(Number(existing.n)>0)fail('برای جلوگیری از تداخل، دیتابیس باید بدون اطلاعات کاربر باشد');
  const settings=old.settings||{};
  // Both v2 (nested chapters, customCurrencies) and v3 (relational arrays) are supported.
  for(const currency of [...(settings.customCurrencies||[]),...(old.currencies||[]).filter(x=>!x.is_default)]){
   if(!currency.code)continue;
   const code=val(currency.code,12).toUpperCase();await putRecord(c,'currencies',code,currency,req.session.user_id);imported++;
  }
  for(const currency of (old.currencies||[]).filter(x=>x.is_default)){
   await putRecord(c,'currencies',val(currency.code,12).toUpperCase(),currency,req.session.user_id);
  }
  const manual={USD:settings.manualUSD,EUR:settings.manualEUR,USDT:settings.manualUSDT,GOLD18:settings.manualGOLD18,GOLD24:settings.manualGOLD24,...settings.extraRates};
  for(const [code,price] of Object.entries(manual))if(price!==null&&price!==undefined&&Number(price)>0)await c.query('UPDATE currencies SET manual_toman=$1 WHERE code=$2',[Number(price),code]);
  const legacyClassId=randomUUID();
  if(Array.isArray(old.classes)&&old.classes.length){for(const cl of old.classes)await putRecord(c,'classes',idOf(cl.id||randomUUID()),cl,req.session.user_id)}
  await c.query("INSERT INTO classes(id,user_id,title) VALUES($1,$2,'کلاس واردشده از پشتیبان')",[legacyClassId,req.session.user_id]);
  for(const chapter of old.chapters){const cid=idOf(chapter.id||randomUUID());await putRecord(c,'chapters',cid,{...chapter,class_id:(old.classes?.some(cl=>cl.id===chapter.class_id)?chapter.class_id:legacyClassId)},req.session.user_id);imported++;}
  const topics=old.version>=3?(old.topics||[]):old.chapters.flatMap(ch=>(ch.topics||[]).map(x=>({...x,chapter_id:ch.id})));
  const resources=old.version>=3?(old.resources||[]):old.chapters.flatMap(ch=>(ch.resources||[]).map(x=>({...x,chapter_id:ch.id})));
  for(const item of topics){await putRecord(c,'topics',idOf(item.id||randomUUID()),item,req.session.user_id);imported++;}
  for(const item of resources){await putRecord(c,'resources',idOf(item.id||randomUUID()),item,req.session.user_id);imported++;}
  for(const kind of ['tasks','servers','transactions','installments','holdings']){
   for(const source of old[kind]||[]){
    const id=idOf(source.id||randomUUID());const item={...source,id};if(kind==='tasks'&&item.class_id&&!old.classes?.some(c=>c.id===item.class_id))item.class_id=legacyClassId;
    if(kind==='transactions'&&Number(item.amount)<=0)continue;
    if(kind==='servers'&&item.mode==='agent')item.mode='manual'; // agent credentials never exported
    await putRecord(c,kind,id,item,req.session.user_id);imported++;
    if(kind==='servers'&&source.metrics){const m=validateMetrics(source.metrics);await c.query("UPDATE servers SET metrics=$1,metrics_source='imported',metrics_at=$2 WHERE id=$3",[m,m.at,id]);}
   }
  }
  for(const activity of (old.activities||[]).slice(0,500)){
   await c.query('INSERT INTO activities(id,kind,text,at,user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[
    idOf(activity.id||randomUUID()),val(activity.kind,40)||'system',val(activity.text,500),activity.at||new Date(),req.session.user_id
   ]);
  }
  if(old.version>=3){
   for(const r of (old.exchange_rates||[])){
    if(!r.code||!Number(r.price_toman))continue;
    await c.query(`INSERT INTO exchange_rates(code,price_toman,source,quoted_at) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET price_toman=EXCLUDED.price_toman,source=EXCLUDED.source,quoted_at=EXCLUDED.quoted_at`,[r.code,r.price_toman,'بازیابی',r.quoted_at||new Date()]);
   }
   for(const h of (old.rate_history||[]).slice(0,10000))if(h.code&&Number(h.price_toman)>0){await c.query('INSERT INTO rate_history(code,price_toman,source,at) VALUES($1,$2,$3,$4)',[h.code,h.price_toman,h.source||'بازیابی',h.at||new Date()]);}
  }
  await logActivity(c,'ورود '+imported+' مورد از فایل پشتیبان','system',req.session.user_id);
 });
 res.json({ok:true,imported});
}));
const installedRevision=/^[a-f0-9]{40}$/.test(process.env.DASHBOARD_REVISION||'')?process.env.DASHBOARD_REVISION:null;
let dispatching=false;
let dispatchAcceptedAt=0;
// Browser-triggered updates use GitHub Actions. No Docker socket or SSH key is exposed to the web server.
app.get('/api/admin/updates',wrap(async(req,res)=>{
 requireAdmin(req);
 const record=(await query("SELECT config,encrypted_key FROM provider_settings WHERE name='github_updates'")).rows[0];
 const cfg=record?.config||{};
 res.json({repo:cfg.repo||'',branch:'main',configured:Boolean(record?.encrypted_key),workflow:'deploy.yml'});
}));
app.put('/api/admin/updates',wrap(async(req,res)=>{
 requireAdmin(req);
 const repo=validateGithubRepo(req.body?.repo);
 const token=req.body?.token?val(req.body.token,256,true):null;
 if(token&&!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token))fail('فرمت توکن GitHub نامعتبر است');
 await query(`INSERT INTO provider_settings(name,config,encrypted_key) VALUES('github_updates',$1,$2)
 ON CONFLICT(name) DO UPDATE SET config=$1,encrypted_key=CASE WHEN $3::boolean THEN NULL WHEN $2::text IS NOT NULL THEN $2 ELSE provider_settings.encrypted_key END,updated_at=now()`,[{repo},token?encrypt(token):null,req.body?.clearToken===true]);
 res.json({ok:true});
}));
app.get('/api/admin/updates/version',wrap(async(req,res)=>{requireAdmin(req);res.json({installedRevision})}));
app.get('/api/admin/updates/status',wrap(async(req,res)=>{
 requireAdmin(req);
 const record=(await query("SELECT config,encrypted_key FROM provider_settings WHERE name='github_updates'")).rows[0];
 if(!record?.config?.repo||!record.encrypted_key)return res.json({configured:false,installedRevision});
 try{
  const status=await githubStatus(record.config.repo,decrypt(record.encrypted_key),installedRevision);
  res.json({...status,configured:true,dispatchPending:Date.now()-dispatchAcceptedAt<60_000});
 }catch{
  res.status(502).json({error:'بررسی نسخه در GitHub انجام نشد. اتصال سرور و مجوزهای Actions و Contents توکن را بررسی کنید.'});
 }
}));
app.post('/api/admin/updates/dispatch',wrap(async(req,res)=>{
 requireAdmin(req);
 if(dispatching||Date.now()-dispatchAcceptedAt<60_000)fail('درخواست به‌روزرسانی قبلاً ثبت شده است',409);
 dispatching=true;
 try{
  const keys=[bucket('github-update',req.session.user_id)];
  await throttle(keys,3);
  const record=(await query("SELECT config,encrypted_key FROM provider_settings WHERE name='github_updates'")).rows[0];
  if(!record?.config?.repo||!record.encrypted_key)fail('توکن و مخزن GitHub در تنظیمات ثبت نشده‌اند',400);
  const token=decrypt(record.encrypted_key);
  let status;
  try{status=await githubStatus(record.config.repo,token,installedRevision)}
  catch{return res.status(502).json({error:'بررسی نسخه در GitHub انجام نشد. تنظیمات انتشار را بررسی کنید.'})}
  if(!status.available)fail('نسخه جدیدی برای نصب شناسایی نشد',409);
  if(status.latest&&status.latest.status!=='completed')fail('انتشار دیگری در حال اجرا است',409);
  await recordFailure(keys);
  try{await githubDispatch(record.config.repo,token)}
  catch{return res.status(502).json({error:'درخواست انتشار پذیرفته نشد. مجوز Actions: Write و گردش‌کار انتشار را بررسی کنید.'})}
  dispatchAcceptedAt=Date.now();
  res.json({ok:true});
 }finally{dispatching=false}
}));
app.use('/api',(req,res)=>res.status(404).json({error:'مسیر API پیدا نشد'}));
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
app.use(express.static(dist,{index:false,maxAge:'1h',setHeaders:(res,file)=>{if(file.endsWith('.html')||file.endsWith('sw.js'))res.setHeader('Cache-Control','no-cache')}}));
app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
app.use((err,req,res,next)=>responseError(res,err));
async function start(){if(!encryptionReady())throw Error('DATA_ENCRYPTION_KEY باید ۶۴ رقم HEX باشد');if(String(process.env.SESSION_SECRET||'').length<32)throw Error('SESSION_SECRET باید حداقل ۳۲ نویسه باشد');await migrate();const port=Number(process.env.PORT||4173),host=process.env.HOST||'0.0.0.0';app.listen(port,host,()=>console.log(`Personal Management Dashboard React + PostgreSQL on ${host}:${port}`));setTimeout(()=>refreshRates(false).catch(e=>console.error('initial rates update failed:',e.message)),3000).unref();setInterval(()=>refreshRates(false).catch(e=>console.error('rate update failed:',e.message)),5*60*1000).unref();setInterval(()=>Promise.all([query('DELETE FROM sessions WHERE expires_at<now()'),query('DELETE FROM auth_attempts WHERE window_end<now()')]).catch(()=>{}),3600000).unref()}
if(process.env.NODE_ENV!=='test')start().catch(e=>{console.error('Startup failure:',e.code||e.name||'Invalid configuration');process.exit(1)});
export {app,TYPES,putRecord};
