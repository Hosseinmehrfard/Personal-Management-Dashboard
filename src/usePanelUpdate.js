import {useCallback,useEffect,useRef,useState} from 'react';

export function usePanelUpdate({enabled,api,request,notify}){
 const [status,setStatus]=useState(null);
 const [error,setError]=useState('');
 const [submitted,setSubmitted]=useState(null);
 const [busy,setBusy]=useState(false);
 const revision=useRef(null);
 const sequence=useRef(0);
 const running=status?.latest&&status.latest.status!=='completed';
 const pending=Boolean(submitted||status?.dispatchPending||running);

 const check=useCallback(async signal=>{
  const requestId=++sequence.current;
  try{
   const next=await api('/admin/updates/status',{signal});
   if(signal?.aborted||requestId!==sequence.current)return;
   revision.current??=next.installedRevision;
   if(revision.current&&next.installedRevision&&next.installedRevision!==revision.current){
    window.location.reload();
    return;
   }
   setStatus(next);
   setError('');
   setSubmitted(prev=>{
    if(!prev)return null;
    const newerRun=next.latest&&next.latest.id!==prev.runId;
    return newerRun||Date.now()-prev.at>120_000?null:prev;
   });
  }catch(e){
   if(!signal?.aborted&&requestId===sequence.current)setError(e.message);
  }
 },[api]);

 useEffect(()=>{
  if(!enabled){
   sequence.current++;
   revision.current=null;
   setStatus(null);
   setSubmitted(null);
   setError('');
   return;
  }
  const controller=new AbortController();
  let timer;
  async function poll(){
   await check(controller.signal);
   if(!controller.signal.aborted)timer=setTimeout(poll,pending?8_000:90_000);
  }
  poll();
  return()=>{controller.abort();clearTimeout(timer)};
 },[enabled,pending,check]);

 useEffect(()=>{
  if(!enabled||!pending||!revision.current)return;
  const controller=new AbortController();
  const timer=setInterval(async()=>{
   try{
    const current=await api('/admin/updates/version',{signal:controller.signal});
    if(!controller.signal.aborted&&current.installedRevision&&current.installedRevision!==revision.current)window.location.reload();
   }catch{}
  },4_000);
  return()=>{controller.abort();clearInterval(timer)};
 },[enabled,pending,api]);

 async function update(){
  if(busy||pending||!status?.available)return;
  setBusy(true);
  try{
   await request('POST','/admin/updates/dispatch',{});
   setSubmitted({at:Date.now(),runId:status.latest?.id});
   notify('درخواست به‌روزرسانی ثبت شد');
  }catch(e){notify(e.message)}finally{setBusy(false)}
 }
 return {status,error,pending,busy,check,update};
}
