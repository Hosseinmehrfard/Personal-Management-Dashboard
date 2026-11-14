import pg from 'pg';
import { randomUUID } from 'node:crypto';
// PostgreSQL DATE has no timezone. Keep its ISO date intact for Jalali conversion.
pg.types.setTypeParser(1082,value=>value);
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
  await c.query(`ALTER TABLE currencies ADD COLUMN IF NOT EXISTS arzdigital_code text`);
  await c.query(`ALTER TABLE currencies ADD COLUMN IF NOT EXISTS nerkhara_id text`);
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
  // New installations start with an empty class catalogue. Existing OWASP data is preserved below.
  await c.query(`INSERT INTO provider_settings(name,config) VALUES('navasan','{"unit":"RIAL","refreshHours":8}'::jsonb) ON CONFLICT DO NOTHING`);
  await c.query(`INSERT INTO provider_settings(name,config) VALUES('arzdigital','{"enabled":false,"endpoint":"","unit":"TOMAN","refreshHours":8,"rootPath":"data","priceField":"price","codeField":"symbol","authStyle":"bearer"}'::jsonb) ON CONFLICT DO NOTHING`);
  await c.query('INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING');
  await c.query(`INSERT INTO provider_settings(name,config) VALUES('rate_source','{"selected":"nerkhara","refreshMinutes":15}'::jsonb) ON CONFLICT DO NOTHING`);
  await c.query('INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING');
  // v6: additive migration; existing user records retain their original ownership.
  await c.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await c.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('admin','user'))`);
  await c.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'`);
  await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`);
  await c.query(`CREATE TABLE IF NOT EXISTS classes(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,title text NOT NULL,description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'todo',notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`);
  for(const table of ['tasks','servers','transactions','installments','holdings','chapters','topics','resources','activities']){
   await c.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id) ON DELETE RESTRICT`);
   await c.query(`UPDATE "${table}" SET user_id=(SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1) WHERE user_id IS NULL AND EXISTS(SELECT 1 FROM users WHERE role='admin')`);
   await c.query(`CREATE INDEX IF NOT EXISTS "idx_${table}_owner" ON "${table}"(user_id)`);
  }
  await c.query(`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS class_id text REFERENCES classes(id) ON DELETE CASCADE`);
  await c.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS class_id text REFERENCES classes(id) ON DELETE SET NULL`);
  await c.query(`CREATE TABLE IF NOT EXISTS user_currency_preferences(user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,code text NOT NULL REFERENCES currencies(code) ON DELETE CASCADE,visible boolean NOT NULL DEFAULT true,PRIMARY KEY(user_id,code))`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_chapters_class ON chapters(class_id)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_tasks_class ON tasks(class_id)`);
  await c.query(`INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING`);
  await c.query(`CREATE TABLE IF NOT EXISTS personal_balances(
   id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
   direction text NOT NULL CHECK(direction IN ('debt','receivable')),
   title text NOT NULL, total numeric(22,2) NOT NULL CHECK(total>0),
   settled numeric(22,2) NOT NULL DEFAULT 0 CHECK(settled>=0 AND settled<=total),
   due_date date, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await c.query(`CREATE TABLE IF NOT EXISTS bank_accounts(
   id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
   title text NOT NULL, bank text NOT NULL, balance numeric(22,2) NOT NULL,
   notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  for(const table of ['personal_balances','bank_accounts']){
   await c.query(`CREATE INDEX IF NOT EXISTS "idx_${table}_owner" ON "${table}"(user_id)`);
  }
  await c.query('INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING');
  // v6.3 finance additions are additive. Existing balances and transaction rows retain their meaning.
  await c.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_number text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS card_number text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS iban text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT ''`);
  await c.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#64748b'`);
  await c.query(`CREATE TABLE IF NOT EXISTS finance_contacts(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,name text NOT NULL,phone text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`ALTER TABLE personal_balances ADD COLUMN IF NOT EXISTS contact_id text REFERENCES finance_contacts(id) ON DELETE SET NULL`);
  await c.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id text REFERENCES bank_accounts(id) ON DELETE RESTRICT`);
  await c.query(`CREATE TABLE IF NOT EXISTS account_transfers(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,from_account_id text NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,to_account_id text NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,amount numeric(22,2) NOT NULL CHECK(amount>0),date date NOT NULL,notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),CHECK(from_account_id<>to_account_id))`);
  await c.query(`CREATE TABLE IF NOT EXISTS finance_checks(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,direction text NOT NULL CHECK(direction IN ('incoming','outgoing')),title text NOT NULL,check_number text NOT NULL DEFAULT '',bank text NOT NULL DEFAULT '',amount numeric(22,2) NOT NULL CHECK(amount>0),due_date date NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cleared','bounced','cancelled')),contact_id text REFERENCES finance_contacts(id) ON DELETE SET NULL,notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS finance_budgets(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,kind text NOT NULL CHECK(kind IN ('expense','income','savings')),title text NOT NULL,category text NOT NULL DEFAULT '',target numeric(22,2) NOT NULL CHECK(target>0),start_date date NOT NULL,end_date date NOT NULL,notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),CHECK(end_date>=start_date))`);
  await c.query(`CREATE TABLE IF NOT EXISTS personal_payments(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,balance_id text NOT NULL REFERENCES personal_balances(id) ON DELETE CASCADE,amount numeric(22,2) NOT NULL CHECK(amount>0),date date NOT NULL,notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS shared_groups(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,title text NOT NULL,description text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS shared_members(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,group_id text NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS shared_expenses(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,group_id text NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,title text NOT NULL,payer_id text NOT NULL REFERENCES shared_members(id) ON DELETE RESTRICT,amount numeric(22,2) NOT NULL CHECK(amount>0),date date NOT NULL,notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())`);
  await c.query(`CREATE TABLE IF NOT EXISTS shared_shares(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,expense_id text NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,member_id text NOT NULL REFERENCES shared_members(id) ON DELETE RESTRICT,amount numeric(22,2) NOT NULL CHECK(amount>=0),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(expense_id,member_id))`);
  await c.query(`CREATE TABLE IF NOT EXISTS shared_settlements(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,group_id text NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,from_member_id text NOT NULL REFERENCES shared_members(id) ON DELETE RESTRICT,to_member_id text NOT NULL REFERENCES shared_members(id) ON DELETE RESTRICT,amount numeric(22,2) NOT NULL CHECK(amount>0),date date NOT NULL,notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),CHECK(from_member_id<>to_member_id))`);
  for(const table of ['finance_contacts','account_transfers','finance_checks','finance_budgets','personal_payments','shared_groups','shared_members','shared_expenses','shared_shares','shared_settlements']){
   await c.query(`CREATE INDEX IF NOT EXISTS "idx_${table}_owner" ON "${table}"(user_id)`);
  }
  for(const [index,table,column] of [['tx_account','transactions','account_id'],['balance_contact','personal_balances','contact_id'],['checks_due','finance_checks','due_date'],['budget_date','finance_budgets','start_date'],['member_group','shared_members','group_id'],['expense_group','shared_expenses','group_id'],['share_expense','shared_shares','expense_id'],['settlement_group','shared_settlements','group_id']]){
   await c.query(`CREATE INDEX IF NOT EXISTS "idx_${index}" ON "${table}"("${column}")`);
  }
  await c.query('INSERT INTO schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING');

  const initialOwner=(await c.query(`SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1`)).rows[0]?.id;
  if(initialOwner)await claimLegacy(c,initialOwner);
  // Enforce non-null ownership whenever all historic records have been assigned.
  for(const table of ['tasks','servers','transactions','installments','holdings','chapters','topics','resources','activities']){
   const missing=await c.query(`SELECT 1 FROM "${table}" WHERE user_id IS NULL LIMIT 1`);
   if(!missing.rowCount)await c.query(`ALTER TABLE "${table}" ALTER COLUMN user_id SET NOT NULL`);
  }
  // No built-in administrator: the first account is created explicitly via /api/setup.
  // Existing users in an upgraded database are never changed or overwritten.
 });
}

// Invoked during initial-admin creation too (for databases installed before v6 setup).
export async function claimLegacy(c,userId){
 for(const table of ['tasks','servers','transactions','installments','holdings','chapters','topics','resources','activities']){
  await c.query(`UPDATE "${table}" SET user_id=$1 WHERE user_id IS NULL`,[userId]);
 }
 const legacy=(await c.query('SELECT 1 FROM chapters WHERE user_id=$1 AND class_id IS NULL LIMIT 1',[userId])).rowCount;
 if(legacy){
  const id='legacy-owasp-'+userId;
  await c.query(`INSERT INTO classes(id,user_id,title,description) VALUES($1,$2,'OWASP Top 10:2025','داده‌های کلاس OWASP از نسخه پیشین منتقل شده‌اند') ON CONFLICT DO NOTHING`,[id,userId]);
  await c.query('UPDATE chapters SET class_id=$1 WHERE user_id=$2 AND class_id IS NULL',[id,userId]);
  await c.query(`UPDATE tasks SET class_id=$1 WHERE user_id=$2 AND category='owasp' AND class_id IS NULL`,[id,userId]);
 }
}
