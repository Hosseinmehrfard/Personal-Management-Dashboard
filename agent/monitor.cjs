'use strict';
// Read-only Linux agent. Keep behind a TLS reverse proxy and firewall.
const http=require('node:http'),os=require('node:os'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {timingSafeEqual}=require('node:crypto');
const TOKEN=process.env.AGENT_TOKEN||'';
if(TOKEN.length<32){console.error('AGENT_TOKEN باید حداقل ۳۲ کاراکتر تصادفی داشته باشد');process.exit(1);}
function cpuSnapshot(){const cpus=os.cpus();return cpus.reduce((a,c)=>{const t=c.times;a.total+=Object.values(t).reduce((x,y)=>x+y,0);a.idle+=t.idle;return a;},{total:0,idle:0});}
function disk(){const target=process.env.AGENT_DISK_PATH||'/';const raw=execFileSync('df',['-kP',target],{encoding:'utf8',timeout:1500,maxBuffer:16384}).trim().split('\n');const f=raw.at(-1).trim().split(/\s+/);return {total:+f[1]*1024,used:+f[2]*1024,free:+f[3]*1024,path:target};}
function availableMemory(){try{const match=fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)\s+kB/m);if(match)return +match[1]*1024;}catch{}return os.freemem();}
function compareToken(h){const supplied=Buffer.from((h||'').replace(/^Bearer\s+/i,''));const expected=Buffer.from(TOKEN);return supplied.length===expected.length && timingSafeEqual(supplied,expected);}
const PORT=Number(process.env.AGENT_PORT||4271),HOST=process.env.AGENT_HOST||'127.0.0.1';
http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.url!=='/metrics'||req.method!=='GET'){res.statusCode=404;return res.end('{}');}
 if(!compareToken(req.headers.authorization)){res.statusCode=401;return res.end('{"error":"unauthorized"}');}
 try{const s=cpuSnapshot();await new Promise(resolve=>setTimeout(resolve,350));const e=cpuSnapshot();const cpu=Math.max(0,Math.min(100,100*(1-(e.idle-s.idle)/Math.max(1,e.total-s.total))));
 const total=os.totalmem(),available=availableMemory(),d=disk();
 res.end(JSON.stringify({at:new Date().toISOString(),host:os.hostname(),uptimeSeconds:os.uptime(),cpu:{usagePercent:+cpu.toFixed(1),cores:os.cpus().length,load1:os.loadavg()[0]},memory:{total,used:Math.max(0,total-available),free:available},disk:d}));
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:'metrics_unavailable'}));}
}).listen(PORT,HOST,()=>console.log(`Read-only agent on ${HOST}:${PORT}`));
