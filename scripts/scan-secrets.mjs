// Fast local guard for obvious secrets in the committed working tree.
// NOT a substitute for scanning the entire Git history with gitleaks.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const ignored=new Set(['.git','node_modules','dist','.cache','coverage','backups']);
const extensions=new Set(['.js','.mjs','.cjs','.jsx','.json','.yaml','.yml','.sh','.md','.html','.css','.webmanifest','.example','.txt']);
const rules=[
 ['private_key',/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
 ['cloud_access_key',/\bAKIA[0-9A-Z]{16}\b/],
 ['github_token',/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{25,})\b/],
 ['literal_secret',/\b(?:api[_-]?key|secret|password|setup_token|access_token|private[_-]?key)\s*[:=]\s*['"](?!(?:REPLACE|EXAMPLE|YOUR|PLACEHOLDER))[A-Za-z0-9_\-./+=]{24,}['"]/i]
];
const failures=[];
function visit(dir){for(const name of readdirSync(dir)){
 if(ignored.has(name)||name.startsWith('.env')&&name!=='.env.example')continue;
 const full=path.join(dir,name),st=statSync(full);
 if(st.isDirectory()){visit(full);continue;}
 if(st.size>2_000_000||!(extensions.has(path.extname(name))||name==='Dockerfile'||name==='Caddyfile'||name==='.gitignore'))continue;
 const contents=readFileSync(full,'utf8');
 for(const [type,pattern] of rules)if(pattern.test(contents))failures.push({type,file:path.relative(root,full)});
}}
visit(root);
if(failures.length){for(const f of failures)console.error(`${f.type}: ${f.file}`);process.exitCode=1;}
else console.log('Workspace secret scan: no known-format credentials found. Git history was NOT scanned.');
