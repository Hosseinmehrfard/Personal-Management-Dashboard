import pg from 'pg';
import { randomUUID } from 'node:crypto';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:10000,statement_timeout:15000,idle_in_transaction_session_timeout:15000});
export const query=(sql,args=[])=>pool.query(sql,args);
export const tx=async fn=>{const client=await pool.connect();try{await client.query('BEGIN');const v=await fn(client);await client.query('COMMIT');return v}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}};
export const TOPICS=[
 ['A01','کنترل دسترسی شکسته','Broken Access Control','A01_2025-Broken_Access_Control'],
 ['A02','پیکربندی نادرست امنیتی','Security Misconfiguration','A02_2025-Security_Misconfiguration'],
 ['A03','نقص‌های زنجیره تأمین نرم‌افزار','Software Supply Chain Failures','A03_2025-Software_Supply_Chain_Failures'],
 ['A04','نقص‌های رمزنگاری','Cryptographic Failures','A04_2025-Cryptographic_Failures'],
 ['A05','تزریق','Injection','A05_2025-Injection'],
 ['A06','طراحی ناامن','Insecure Design','A06_2025-Insecure_Design'],
 ['A07','نقص‌های احراز هویت','Authentication Failures','A07_2025-Authentication_Failures'],
 ['A08','نقص‌های یکپارچگی نرم‌افزار یا داده','Software or Data Integrity Failures','A08_2025-Software_or_Data_Integrity_Failures'],
 ['A09','نقص‌های ثبت رویداد و هشدار امنیتی','Security Logging and Alerting Failures','A09_2025-Security_Logging_and_Alerting_Failures'],
 ['A10','مدیریت نادرست شرایط استثنایی','Mishandling of Exceptional Conditions','A10_2025-Mishandling_of_Exceptional_Conditions']
];
export const DEFAULT_CURRENCIES=[
 ['TOMAN','تومان','تومان','تومان',null,1],['USD','دلار آمریکا','$','دلار','usd_sell',null],
 ['EUR','یورو','€','یورو','eur',null],['USDT','تتر','₮','تتر','usdt',null],
 ['GOLD18','طلای ۱۸ عیار','Au','گرم','18ayar',null],['GOLD24','طلای ۲۴ عیار','Au','گرم',null,null],
 ['GBP','پوند انگلیس','£','پوند','gbp',null],['AED','درهم امارات','د.إ','درهم','aed',null],
 ['TRY','لیر ترکیه','₺','لیر','try',null],['CAD','دلار کانادا','C$','دلار','cad',null],
 ['AFN','افغانی','؋','افغانی','afn',null],['CNY','یوان چین','¥','یوان','cny',null],
 ['BTC','بیت‌کوین','₿','بیت‌کوین','btc',null],['ETH','اتریوم','Ξ','اتریوم','eth',null]
];
export async function migrate(){
 await query(`CREATE TABLE IF NOT EXISTS schema_migrations(version integer primary key, applied_at timestamptz NOT NULL DEFAULT now())`);
 await tx(async c=>{
  await c.query(`CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'admin' CHECK(role IN ('admin')), created_at timestamptz DEFAULT now())`);
  await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin'`);
  await c.query(`CREATE TABLE IF NOT EXISTS auth_attempts(bucket text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_end timestamptz NOT NULL)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_auth_attempts_window ON auth_attempts(window_end)`);
  await c.query(`CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS tasks(id text PRIMARY KEY,title text NOT NULL,category text NOT NULL DEFAULT 'work',status text NOT NULL DEFAULT 'todo',priority text NOT NULL DEFAULT 'medium',due_date date,notes text NOT NULL DEFAULT '',chapter_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS servers(id text PRIMARY KEY,name text NOT NULL,host text NOT NULL DEFAULT '',environment text NOT NULL DEFAULT 'production',mode text NOT NULL DEFAULT 'manual',notes text NOT NULL DEFAULT '',metrics jsonb,metrics_source text,metrics_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS transactions(id text PRIMARY KEY,type text NOT NULL CHECK(type IN ('income','expense','installment')),amount numeric(22,2) NOT NULL CHECK(amount>0),date date NOT NULL,category text NOT NULL DEFAULT 'عمومی',description text NOT NULL,installment_id text,created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS installments(id text PRIMARY KEY,title text NOT NULL,total numeric(22,2) NOT NULL CHECK(total>=0),paid numeric(22,2) NOT NULL DEFAULT 0 CHECK(paid>=0),monthly numeric(22,2) NOT NULL DEFAULT 0 CHECK(monthly>=0),due_date date,notes text NOT NULL DEFAULT '',created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS currencies(code text PRIMARY KEY,name text NOT NULL,symbol text NOT NULL,unit text NOT NULL,navasan_code text,manual_toman numeric(24,4),is_default boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now(),CHECK(manual_toman IS NULL OR manual_toman>0))`);
  await c.query(`CREATE TABLE IF NOT EXISTS holdings(id text PRIMARY KEY,asset text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE ON DELETE RESTRICT,quantity numeric(28,8) NOT NULL CHECK(quantity>=0),note text NOT NULL DEFAULT '',created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS chapters(id text PRIMARY KEY,code text NOT NULL,title text NOT NULL,en text NOT NULL DEFAULT '',description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'todo',verified boolean NOT NULL DEFAULT false,notes text NOT NULL DEFAULT '',created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS topics(id text PRIMARY KEY,chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,title text NOT NULL,status text NOT NULL DEFAULT 'todo',notes text NOT NULL DEFAULT '',verified boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS resources(id text PRIMARY KEY,chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,title text NOT NULL,url text NOT NULL,status text NOT NULL DEFAULT 'pending',notes text NOT NULL DEFAULT '',checked_at timestamptz,created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS activities(id text PRIMARY KEY,kind text NOT NULL DEFAULT 'system',text text NOT NULL,at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS provider_settings(name text PRIMARY KEY,config jsonb NOT NULL DEFAULT '{}'::jsonb,encrypted_key text,updated_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS exchange_rates(code text PRIMARY KEY REFERENCES currencies(code) ON DELETE CASCADE,price_toman numeric(24,4) NOT NULL CHECK(price_toman>0),source text NOT NULL,quoted_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS rate_history(id bigserial PRIMARY KEY,code text NOT NULL,price_toman numeric(24,4) NOT NULL,source text NOT NULL,at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS agents(server_id text PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,url text NOT NULL,encrypted_token text NOT NULL,created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status,due_date)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_resources_chapter ON resources(chapter_id)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_rate_history_at ON rate_history(at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_activities_at ON activities(at DESC)`);
  await c.query(`INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING`);
  const hardened=await c.query('INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING RETURNING version');
  if(hardened.rowCount)await c.query('DELETE FROM sessions');
  for(const [code,name,symbol,unit,navasan,price] of DEFAULT_CURRENCIES)await c.query(`INSERT INTO currencies(code,name,symbol,unit,navasan_code,manual_toman,is_default) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(code) DO NOTHING`,[code,name,symbol,unit,navasan,price]);
  for(const [code,title,en,slug] of TOPICS){await c.query(`INSERT INTO chapters(id,code,title,en) VALUES($1,$1,$2,$3) ON CONFLICT DO NOTHING`,[code,title,en]);await c.query(`INSERT INTO resources(id,chapter_id,title,url,status,checked_at) VALUES($1,$2,$3,$4,'pending',NULL) ON CONFLICT DO NOTHING`,['official-'+code,code,'راهنمای رسمی OWASP Top 10:2025','https://top10.owasp.org/2025/'+slug+'/']);}
  await c.query(`INSERT INTO provider_settings(name,config) VALUES('navasan','{"unit":"RIAL","refreshHours":8}'::jsonb) ON CONFLICT DO NOTHING`);
  // No built-in administrator: the first account is created explicitly via /api/setup.
  // Existing users in an upgraded database are never changed or overwritten.
 });
}
