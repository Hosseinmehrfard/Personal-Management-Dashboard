import React,{useEffect,useState} from 'react';
import {Plus,Pencil,Trash2,Users,ShieldCheck,CalendarDays,ChevronRight,ChevronLeft,RefreshCw,BookOpen,Link2,ListTodo,Check,Eye,EyeOff,Save,KeyRound,CloudDownload,ExternalLink,Coins,ArrowLeft} from 'lucide-react';
import {formatMoney as uiMoney} from './uiPreferences.js';
import {persianParts,toIsoJalali,daysInMonth,weekPosition,changeMonth,monthNames,weekdays,formatJalali,todayInTehran,holidayName,hasAnnualHolidays} from './jalali.js';

const format=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const formatYear=new Intl.NumberFormat('fa-IR',{useGrouping:false});
const formatMoney=n=>uiMoney(n);
function Box({title,aside,children}){return <section className="panel"><div className="panel-head"><h2>{title}</h2>{aside}</div>{children}</section>}
function Notice({children}){return <p className="helper-text">{children}</p>}
export function JalaliCalendarGrid({year,month,selected,onSelect,items=[]}){
 const start=toIsoJalali(year,month,1),last=daysInMonth(year,month);
 if(!start)return <p>ماه شمسی نامعتبر است</p>;
 const today=todayInTehran(),leading=weekPosition(start);
 const cells=[...Array(leading).fill(null),...Array.from({length:last},(_,i)=>i+1)];
 const eventsByDate=new Map();
 for(const item of items)eventsByDate.set(item.date,(eventsByDate.get(item.date)||0)+1);
 const startTime=Date.parse(start+'T00:00:00Z');
 return <div className="jalali-grid">{weekdays.map(d=><div className="jalali-week" key={d}>{d}</div>)}{cells.map((d,i)=>{
  if(!d)return <button type="button" className="jalali-day" key={i} disabled/>;
  const iso=new Date(startTime+(d-1)*86400000).toISOString().slice(0,10);
  const events=eventsByDate.get(iso)||0,holiday=holidayName(year,month,d),friday=i%7===6;
  return <button type="button" key={i}
   className={['jalali-day',iso===selected&&'picked',iso===today&&'today',(holiday||friday)&&'holiday'].filter(Boolean).join(' ')}
   aria-pressed={iso===selected} title={holiday||(friday?'تعطیلی جمعه':undefined)} onClick={()=>onSelect?.(iso)}>
   <span>{format.format(d)}</span>{holiday&&<span className="jalali-holiday">{holiday}</span>}
   {events>0&&<span className="jalali-events">{format.format(events)} رویداد</span>}
  </button>})}</div>;
}
export function JalaliDateInput({value,onChange,required}){
 const initial=persianParts(value)||persianParts(todayInTehran());
 const [shown,setShown]=useState(false),[month,setMonth]=useState({year:initial.year,month:initial.month});
 useEffect(()=>{if(value){const p=persianParts(value);if(p)setMonth({year:p.year,month:p.month})}},[value]);
 const move=n=>setMonth(old=>changeMonth(old.year,old.month,n));
 return <div className="jalali-input"><button type="button" className="jalali-trigger" onClick={()=>setShown(x=>!x)}><CalendarDays size={16}/>{formatJalali(value)}</button><input type="hidden" value={value||''} readOnly/>{shown&&<div className="jalali-popup"><div className="jalali-head"><button type="button" onClick={()=>move(-1)} aria-label="ماه قبل"><ChevronRight size={18}/></button><strong>{monthNames[month.month-1]} {formatYear.format(month.year)}</strong><button type="button" onClick={()=>move(1)} aria-label="ماه بعد"><ChevronLeft size={18}/></button></div><JalaliCalendarGrid {...month} selected={value} onSelect={iso=>{onChange(iso);setShown(false)}}/><div className="jalali-pop-actions"><button type="button" className="button small" onClick={()=>{onChange(todayInTehran());setShown(false)}}>امروز</button><button type="button" className="button small" onClick={()=>{onChange('');setShown(false)}}>پاک‌کردن</button><button type="button" className="button small" onClick={()=>setShown(false)}>بستن</button></div></div>}</div>;
}
export function CalendarPage({data,onTask}){
 const today=todayInTehran(),now=persianParts(today);
 const [month,setMonth]=useState({year:now.year,month:now.month});
 const [day,setDay]=useState(today);
 const events=[
  ...data.tasks.filter(x=>x.due_date).map(x=>({date:String(x.due_date).slice(0,10),name:x.title,kind:'وظیفه',id:'task-'+x.id})),
  ...data.installments.filter(x=>x.due_date).map(x=>({date:String(x.due_date).slice(0,10),name:x.title,kind:'موعد قسط',id:'installment-'+x.id})),
  ...data.personal_balances.filter(x=>x.due_date&&x.total!==x.settled).map(x=>({
   date:String(x.due_date).slice(0,10),name:x.title,kind:x.direction==='debt'?'سررسید بدهی':'سررسید طلب',id:'balance-'+x.id
  })),
  ...(data.transactions||[]).map(x=>({date:String(x.date).slice(0,10),name:x.description+' · '+formatMoney(x.amount),kind:x.type==='income'?'درآمد':x.type==='expense'?'هزینه':'پرداخت قسط',id:'tx-'+x.id})),
  ...(data.finance_checks||[]).filter(x=>x.status==='pending').map(x=>({date:String(x.due_date).slice(0,10),name:x.title+' · '+formatMoney(x.amount),kind:x.direction==='incoming'?'موعد چک دریافتی':'موعد چک پرداختی',id:'check-'+x.id})),
  ...(data.finance_budgets||[]).map(x=>({date:String(x.end_date).slice(0,10),name:x.title,kind:'پایان بازه هدف مالی',id:'budget-'+x.id})),
  ...(data.account_transfers||[]).map(x=>({date:String(x.date).slice(0,10),name:formatMoney(x.amount),kind:'انتقال بین حساب‌ها',id:'transfer-'+x.id}))
 ];
 const move=delta=>{
  const next=changeMonth(month.year,month.month,delta);
  const first=toIsoJalali(next.year,next.month,1);
  if(first){setMonth(next);setDay(first)}
 };
 const chosen=persianParts(day);
 const holiday=holidayName(chosen.year,chosen.month,chosen.day)||(weekPosition(day)===6?'تعطیلی جمعه':'');
 const selectedEvents=events.filter(x=>x.date===day);
 return <div className="calendar-page">
  <Box title="تقویم شمسی و برنامه‌ها" aside={<div className="jalali-head">
   <button className="icon-button" aria-label="ماه قبل" onClick={()=>move(-1)}><ChevronRight size={18}/></button>
   <strong>{monthNames[month.month-1]} {formatYear.format(month.year)}</strong>
   <button className="icon-button" aria-label="ماه بعد" onClick={()=>move(1)}><ChevronLeft size={18}/></button>
  </div>}>
   <JalaliCalendarGrid {...month} selected={day} onSelect={setDay} items={events}/>
   <Notice>{hasAnnualHolidays(month.year)?'جمعه‌ها و تعطیلات رسمی به رنگ قرمز نمایش داده می‌شوند.':'برای این سال، جمعه‌ها و تعطیلات با تاریخ ثابت نمایش داده می‌شوند.'}</Notice>
  </Box>
  <Box title={'برنامه‌های '+formatJalali(day)}>
   {holiday&&<div className="line-item danger"><strong>{holiday}</strong><small>تعطیل</small></div>}
   {selectedEvents.map(e=><div className="line-item" key={e.id}><CalendarDays size={17}/><div className="grow"><strong>{e.name}</strong><small>{e.kind}</small></div></div>)}
   {!selectedEvents.length&&!holiday&&<div className="empty">رویدادی در این روز ثبت نشده است.</div>}
   <button className="primary small" onClick={()=>onTask(day)}><Plus size={16}/> افزودن کار با این موعد</button>
  </Box>
 </div>;
}
export function CurrencyPage({data,onEdit,onRemove,onToggle,canEdit,busy,onRefresh,online}){
 const [search,setSearch]=useState('');const rates=Object.fromEntries(data.rates.map(x=>[x.code,x]));
 const rows=data.currencies.filter(c=>(c.name+' '+c.code).toLowerCase().includes(search.toLowerCase()));
 return <Box title="ارزها و دارایی‌های نمایشی" aside={canEdit&&<button className="button small" disabled={busy||!online} onClick={onRefresh}><RefreshCw size={15}/> به‌روزرسانی نرخ‌ها</button>}><div className="currency-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی ارز و نماد"/><Notice>انتخاب نمایش برای هر کاربر مستقل است. غیرفعال‌کردن ارز، دارایی ثبت‌شده را حذف نمی‌کند. تومان همیشه فعال است.</Notice></div><div className="currency-list">{rows.map(c=><div className="currency-item" key={c.code}><span className="currency-icon">{c.symbol}</span><div className="grow"><strong>{c.name}</strong><small>{c.code} · {c.unit} · {rates[c.code]?.price?formatMoney(rates[c.code].price):'نرخ ثبت نشده'}</small></div><label className="currency-visible"><input type="checkbox" checked={c.is_visible!==false} disabled={busy||c.code==='TOMAN'} onChange={e=>onToggle(c.code,e.target.checked)}/><span>نمایش</span></label>{canEdit&&<><button className="icon-button" title="ویرایش" onClick={()=>onEdit(c)}><Pencil size={16}/></button>{!c.is_default&&<button className="icon-button danger" title="حذف" onClick={()=>onRemove(c)}><Trash2 size={16}/></button>}</>}</div>)}</div></Box>;
}
export function ClassesPage({data,onAdd,onEdit,onRemove,onChapter,onTopic,onResource,onTask,onCheck,search,setSearch}){
 const [chosen,setChosen]=useState(null),[expanded,setExpanded]=useState('');
 const selected=data.classes.find(x=>x.id===chosen)||null;
 if(!selected)return <><Box title="کلاس‌های من" aside={<button className="primary small" onClick={()=>onAdd('classes')}><Plus size={16}/> افزودن کلاس</button>}><div className="class-grid">{data.classes.map(c=>{const ch=data.chapters.filter(x=>x.class_id===c.id),done=ch.filter(x=>x.status==='done').length;return <button key={c.id} className="class-tile" onClick={()=>{setChosen(c.id);setExpanded('')}}><span className="class-tile-icon"><BookOpen size={23}/></span><strong>{c.title}</strong><small>{c.description||'توضیحی ثبت نشده است'}</small><span className="class-progress">{format.format(ch.length)} فصل · {format.format(done)} تکمیل‌شده</span></button>})}</div>{!data.classes.length&&<div className="empty">کلاسی ثبت نشده است. کلاس‌های آموزشی دلخواه خود را ایجاد کنید.</div>}</Box></>;
 const chapters=data.chapters.filter(c=>c.class_id===selected.id&&((c.title+' '+c.code+' '+c.notes).toLowerCase().includes(search.toLowerCase())));
 const classTasks=data.tasks.filter(t=>t.class_id===selected.id);
 return <div className="classes-page"><div className="class-actions"><button className="button small" onClick={()=>setChosen(null)}><ArrowLeft size={16}/> همه کلاس‌ها</button><h2>{selected.title}</h2><button className="button small" onClick={()=>onEdit('classes',selected)}><Pencil size={16}/> ویرایش کلاس</button><button className="button small danger" onClick={()=>{onRemove('classes',selected);setChosen(null)}}><Trash2 size={16}/> حذف کلاس</button></div>{selected.description&&<Notice>{selected.description}</Notice>}
 <Box title="فصل‌ها، مباحث و منابع" aside={<button className="primary small" onClick={()=>onChapter(selected.id)}><Plus size={16}/> فصل جدید</button>}><div className="currency-toolbar"><input placeholder="جست‌وجوی فصل" value={search} onChange={e=>setSearch(e.target.value)}/></div>{chapters.map(ch=>{const open=expanded===ch.id,topics=data.topics.filter(x=>x.chapter_id===ch.id),resources=data.resources.filter(x=>x.chapter_id===ch.id);return <div className="chapter" key={ch.id}><button className="chapter-top" onClick={()=>setExpanded(open?'':ch.id)}><span className="chapter-code">{ch.code}</span><div className="grow"><strong>{ch.title}</strong><small>{ch.status==='done'?'تکمیل شده':'در دست اقدام'}</small></div><ChevronLeft size={17}/></button>{open&&<div className="chapter-body"><div className="chapter-actions"><button className="button small" onClick={()=>onEdit('chapters',ch)}>ویرایش فصل</button><button className="button small" onClick={()=>onTopic(ch.id)}><Plus size={14}/> مبحث</button><button className="button small" onClick={()=>onResource(ch.id)}><Plus size={14}/> منبع</button><button className="button small" onClick={()=>onTask(selected.id,ch.id)}><Plus size={14}/> کار</button><button className="icon-button danger" onClick={()=>onRemove('chapters',ch)}><Trash2 size={15}/></button></div>{ch.notes&&<p className="notes-box">{ch.notes}</p>}<h3>مباحث</h3>{topics.map(t=><div className="resource" key={t.id}><BookOpen size={16}/><div className="grow"><strong>{t.title}</strong><small>{t.notes}</small></div><button className="icon-button" onClick={()=>onEdit('topics',t)}><Pencil size={15}/></button><button className="icon-button danger" onClick={()=>onRemove('topics',t)}><Trash2 size={15}/></button></div>)}<h3>منابع قابل راستی‌آزمایی</h3>{resources.map(r=><div className="resource" key={r.id}><Link2 size={16}/><div className="grow"><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} <ExternalLink size={12}/></a><small>{r.status==='verified'?'تأیید شده':'نیازمند بررسی'} · {r.notes}</small></div><button className="button xs" onClick={()=>onCheck(r)}>بررسی</button><button className="icon-button" onClick={()=>onEdit('resources',r)}><Pencil size={15}/></button><button className="icon-button danger" onClick={()=>onRemove('resources',r)}><Trash2 size={15}/></button></div>)}</div>}</div>})}{!chapters.length&&<div className="empty">هنوز فصلی در این کلاس وجود ندارد.</div>}</Box>
 <Box title="کارهای این کلاس" aside={<button className="primary small" onClick={()=>onTask(selected.id,null)}><Plus size={16}/> کار جدید</button>}>{classTasks.map(t=><div key={t.id} className="line-item"><ListTodo size={18}/><div className="grow"><strong>{t.title}</strong><small>{t.status==='done'?'انجام‌شده':'باز'} · {t.due_date?formatJalali(t.due_date):'بدون موعد'}</small></div><button className="icon-button" onClick={()=>onEdit('tasks',t)}><Pencil size={16}/></button><button className="icon-button danger" onClick={()=>onRemove('tasks',t)}><Trash2 size={16}/></button></div>)}{!classTasks.length&&<div className="empty">کاری برای این کلاس ثبت نشده است.</div>}</Box></div>;
}
export function UsersPage({api,request,notify}){
 const [users,setUsers]=useState([]),[name,setName]=useState(''),[pass,setPass]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>api('/admin/users').then(setUsers).catch(e=>notify(e.message));useEffect(()=>{load()},[]);
 async function add(e){e.preventDefault();if(pass!==confirm)return notify('تکرار رمز مطابقت ندارد');setBusy(true);try{await request('POST','/admin/users',{username:name,password:pass,confirm});setName('');setPass('');setConfirm('');await load();notify('کاربر اضافه شد')}catch(e){notify(e.message)}finally{setBusy(false)}}
 async function change(u,active){if(!window.confirm('وضعیت حساب این کاربر تغییر کند؟'))return;setBusy(true);try{await request('PUT','/admin/users/'+encodeURIComponent(u.id),{active});await load();notify('وضعیت حساب تغییر کرد')}catch(e){notify(e.message)}finally{setBusy(false)}}
 async function reset(u){const password=window.prompt('رمز جدید کاربر (حداقل ۱۲ نویسه):');if(!password)return;setBusy(true);try{await request('PUT','/admin/users/'+encodeURIComponent(u.id),{password});notify('رمز کاربر تغییر کرد و نشست‌های قبلی او باطل شدند')}catch(e){notify(e.message)}finally{setBusy(false)}}
 return <><Box title="کاربران و فضای کاری مستقل"><Notice>هر کاربر وظایف، کلاس‌ها، تراکنش‌ها، پس‌انداز و سرورهای خودش را می‌بیند. نرخ‌های عمومی ارز مشترک‌اند؛ انتخاب ارزهای نمایشی برای هر کاربر مستقل است.</Notice><div className="currency-list">{users.map(u=><div className="currency-item" key={u.id}><span className="currency-icon"><Users size={19}/></span><div className="grow"><strong dir="ltr">{u.username}</strong><small>{u.role==='admin'?'مدیر اصلی':'کاربر'} · {u.active?'فعال':'غیرفعال'}</small></div>{u.role!=='admin'&&<><button className="button small" onClick={()=>reset(u)}>بازنشانی رمز</button><button className="button small" disabled={busy} onClick={()=>change(u,!u.active)}>{u.active?'غیرفعال‌کردن':'فعال‌کردن'}</button></>}</div>)}</div></Box><Box title="افزودن کاربر"><form className="new-user-form" onSubmit={add}><label>نام کاربری لاتین<input dir="ltr" value={name} onChange={e=>setName(e.target.value)} required pattern="[A-Za-z][A-Za-z0-9_.-]{2,31}"/></label><label>رمز عبور<input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={pass} onChange={e=>setPass(e.target.value)} required/></label><label>تکرار رمز<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label><button className="primary" disabled={busy}><Plus size={16}/> ساخت حساب کاربر</button></form></Box></>;
}
export function UpdatePage({api,request,notify,panelUpdate}){
 const [config,setConfig]=useState({repo:'',configured:false});
 const [token,setToken]=useState('');
 const [saving,setSaving]=useState(false);
 const {status,error,pending,busy,check,update}=panelUpdate;
 useEffect(()=>{api('/admin/updates').then(setConfig).catch(e=>notify(e.message))},[api,notify]);
 async function save(e){
  e.preventDefault();
  setSaving(true);
  try{
   await request('PUT','/admin/updates',{repo:config.repo,token:token||undefined});
   setToken('');
   setConfig(await api('/admin/updates'));
   await check();
   notify('تنظیمات انتشار ذخیره شد');
  }catch(e){notify(e.message)}finally{setSaving(false)}
 }
 let message='در حال بررسی نسخه…';
 if(error)message=error;
 else if(pending)message='به‌روزرسانی در حال انجام است. پس از نصب، پنل خودکار دوباره باز می‌شود.';
 else if(status?.configured===false)message='راه‌اندازی اولیهٔ انتشار توسط مدیر سرور لازم است.';
 else if(status&&!status.installedRevision)message='شناسهٔ نسخهٔ نصب‌شده ثبت نشده است. راه‌اندازی اولیهٔ نسخه را روی سرور کامل کنید.';
 else if(status?.available)message='نسخهٔ جدید آمادهٔ نصب است.';
 else if(status)message='آخرین نسخه نصب شده است.';
 const latest=status?.latest;
 return <>
  <Box title="به‌روزرسانی برنامه">
   <p role="status">{message}</p>
   <div className="deploy-actions">
    {status?.available&&<button className="primary" disabled={busy||pending} onClick={update}><CloudDownload size={17}/> به‌روزرسانی برنامه</button>}
    <button className="button" onClick={()=>check()}><RefreshCw size={16}/> بررسی نسخه</button>
   </div>
   {latest?.status==='completed'&&latest.conclusion!=='success'&&<p className="form-error">آخرین اجرای انتشار کامل نشد. گزارش انتشار جزئیات خطا را نشان می‌دهد.</p>}
   {latest&&<a href={latest.html_url} target="_blank" rel="noopener noreferrer">گزارش آخرین انتشار <ExternalLink size={13}/></a>}
  </Box>
  <Box title="تنظیمات انتشار">
   <details open={config.configured?undefined:true}>
    <summary>راه‌اندازی یک‌باره توسط مدیر سرور</summary>
    <Notice>مخزن و توکن پس از راه‌اندازی انتشار روی سرور ثبت می‌شوند. مجوز توکن برای همین مخزن باید Actions: Read and write و Contents: Read باشد.</Notice>
    <form className="new-user-form" onSubmit={save}>
     <label>مخزن GitHub<input dir="ltr" value={config.repo} onChange={e=>setConfig({...config,repo:e.target.value})} placeholder="owner/repo" required/></label>
     <label>توکن انتشار<input type="password" value={token} autoComplete="off" placeholder={config.configured?'برای حفظ توکن خالی بگذارید':'github_pat_…'} onChange={e=>setToken(e.target.value)}/></label>
     <button className="button" disabled={saving}><Save size={16}/> ذخیره تنظیمات</button>
    </form>
   </details>
  </Box>
 </>;
}
