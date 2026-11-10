import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeToman,valueToman} from '../server/currency-math.js';
process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);
const {passwordOK,hashPassword,encrypt,decrypt,safeUrl,moneyNumber,secureEqual,normalizeAdminUsername,validAdminPassword,safeString}=await import('../server/security.js');
test('ریال به تومان تبدیل می‌شود',()=>{assert.equal(normalizeToman(980000,'RIAL'),98000);assert.equal(normalizeToman('98000','TOMAN'),98000);assert.throws(()=>normalizeToman(-2,'RIAL'));assert.throws(()=>normalizeToman(100,'USD'));});
test('ارزش دارایی فقط برحسب تومان است',()=>{assert.equal(valueToman(2.5,98000),245000);assert.equal(valueToman(0,98000),0);assert.throws(()=>valueToman(-3,100))});
test('رمز مدیر با scrypt بررسی می‌شود',async()=>{const hash=await hashPassword('verylongsecretpassword');assert.match(hash,/^scrypt-v2\$/);assert.equal(await passwordOK('verylongsecretpassword',hash),true);assert.equal(await passwordOK('bad',hash),false)});
test('کلید API رمزگذاری قابل بازیابی دارد',()=>{const secret='navasan-private-key';const sealed=encrypt(secret);assert.ok(!sealed.includes(secret));assert.equal(decrypt(sealed),secret);assert.notEqual(sealed,encrypt(secret))});
test('آدرس سرویس باید HTTPS باشد',()=>{assert.equal(safeUrl('https://example.org/path'),'https://example.org/path');assert.throws(()=>safeUrl('http://example.org'));assert.throws(()=>safeUrl('https://user:password@example.org'))});
test('مقادیر مالی نامعتبر رد می‌شوند',()=>{assert.equal(moneyNumber('250000'),250000);assert.throws(()=>moneyNumber(-5));assert.throws(()=>moneyNumber('NaN'))});

test('کد راه‌اندازی با مقایسه زمان‌ثابت بررسی می‌شود',()=>{assert.equal(secureEqual('a'.repeat(64),'a'.repeat(64)),true);assert.equal(secureEqual('a'.repeat(64),'b'.repeat(64)),false);assert.equal(secureEqual('a','aa'),false);assert.equal(secureEqual('',''),false)});
test('نام کاربری اولیه نرمال و بررسی می‌شود',()=>{assert.equal(normalizeAdminUsername('MyAdmin'),'myadmin');assert.equal(normalizeAdminUsername('admin_01'),'admin_01');assert.equal(normalizeAdminUsername('a'),null);assert.equal(normalizeAdminUsername('1admin'),null);assert.equal(normalizeAdminUsername('نام فارسی'),null)});
test('قواعد رمز مدیر در اولین راه‌اندازی اعمال می‌شوند',()=>{assert.equal(validAdminPassword('T3st!A-Complex-Pass'),true);assert.equal(validAdminPassword('short'),false);assert.equal(validAdminPassword(' good-password'),false);assert.equal(validAdminPassword('p'.repeat(257)),false)});

const {isPublicIP,agentAllowedHost,validateMetrics,safeDocHost}=await import('../server/outbound.js');
test('سازگاری اعتبارسنجی هش قدیمی و مهاجرت',async()=>{
 const {scryptSync}=await import('node:crypto');const salt='1'.repeat(32),old=`${salt}:${scryptSync('old-safepassword',salt,64).toString('hex')}`;
 assert.equal(await passwordOK('old-safepassword',old),true);
 assert.equal(await passwordOK('wrong-password',old),false);
 assert.equal(await passwordOK('whatever','broken-hash'),false);
});
test('اعتبارسنجی متن سرور از قطع بی‌صدا و نوع نامعتبر جلوگیری می‌کند',()=>{
 assert.equal(safeString('  سالم  ',20),'سالم');
 assert.throws(()=>safeString('x'.repeat(21),20));
 assert.throws(()=>safeString({a:1}));
 assert.throws(()=>safeString('bad\u0000text'));
 assert.throws(()=>moneyNumber(''));assert.throws(()=>moneyNumber(true));
});
test('آدرس عامل فقط روی میزبان تأییدشده مجاز است',()=>{
 assert.equal(agentAllowedHost('https://monitor.example.com','monitor.example.com').hostname,'monitor.example.com');
 assert.throws(()=>agentAllowedHost('https://monitor.example.com','another.example.com'));
 assert.throws(()=>agentAllowedHost('https://localhost',''));
 assert.throws(()=>agentAllowedHost('https://monitor.example.com/internal','monitor.example.com'));
 assert.throws(()=>agentAllowedHost('http://monitor.example.com','monitor.example.com'));
});
test('IP خصوصی، لوپ‌بک، آدرس متادیتا و رزرو شده مسدود می‌شوند',()=>{
 for(const ip of ['127.0.0.1','10.10.10.10','192.168.0.9','172.16.2.3','169.254.169.254','::1','fd00::4','::ffff:127.0.0.1'])assert.equal(isPublicIP(ip),false,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(isPublicIP(ip),true,ip);
});
test('پایش منابع اطلاعات بیرونی را اعتبارسنجی و محدود می‌کند',()=>{
 const m={cpu:{usagePercent:32,cores:4},memory:{used:100,total:200},disk:{used:50,total:120,path:'/'}};
 assert.equal(validateMetrics(m).cpu.usagePercent,32);
 assert.throws(()=>validateMetrics({...m,cpu:{usagePercent:200,cores:4}}));
 assert.throws(()=>validateMetrics({...m,memory:{used:300,total:200}}));
 assert.throws(()=>validateMetrics({cpu:{},memory:{},disk:{}}));
});
test('بررسی لینک به دامنه‌های مستندات محدود است',()=>{
 assert.equal(safeDocHost('top10.owasp.org'),true);
 assert.equal(safeDocHost('owasp.org.attacker.com'),false);
 assert.equal(safeDocHost('127.0.0.1'),false);
});
