// Deployment requests go to GitHub Actions, not to a shell, Docker socket or git subprocess.
// The GitHub workflow runs with separately configured, least-privilege deployment credentials.
export function validateGithubRepo(value){
 if(typeof value!=='string'||value.length>150||!/(?:^[a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/.test(value)||value.includes('..'))throw Object.assign(new Error('نام مخزن باید owner/repository باشد'),{status:400});
 return value;
}
const base='https://api.github.com';
async function githubRequest(path,token,method='GET'){
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),9000);
 try{
  const response=await fetch(base+path,{method,signal:ctrl.signal,redirect:'error',body:method==='POST'?JSON.stringify({ref:'main'}):undefined,headers:{'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'personal-management-dashboard',...(method==='POST'?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':'Bearer '+token}:{})}});
  if(!response.ok){
   if(response.status===401||response.status===403)throw Object.assign(new Error('توکن GitHub فاقد مجوز Actions است یا محدود شده است'),{status:502});
   if(response.status===404)throw Object.assign(new Error('مخزن یا workflow انتشار در GitHub پیدا نشد'),{status:502});
   throw Object.assign(new Error('GitHub API پاسخ معتبر نداد'),{status:502});
  }
  if(method==='POST')return {ok:true};
  const raw=await response.text();if(raw.length>180000)throw Error('پاسخ GitHub بیش از حد بزرگ است');
  return JSON.parse(raw);
 }finally{clearTimeout(timeout)}
}
export async function githubDispatch(repo,token){
 validateGithubRepo(repo);if(!token)throw Object.assign(new Error('توکن GitHub تنظیم نشده است'),{status:400});
 await githubRequest(`/repos/${repo}/actions/workflows/deploy.yml/dispatches`,token,'POST');return {ok:true};
}
export async function githubStatus(repo,token){
 validateGithubRepo(repo);
 const workflow=await githubRequest(`/repos/${repo}/actions/workflows/deploy.yml/runs?per_page=1`,token);
 const run=workflow.workflow_runs?.[0];
 return {repo,workflow:'deploy.yml',latest:run?{id:run.id,status:run.status,conclusion:run.conclusion,created_at:run.created_at,html_url:`https://github.com/${repo}/actions/runs/${Number(run.id)}`,head_sha:run.head_sha}:null};
}
