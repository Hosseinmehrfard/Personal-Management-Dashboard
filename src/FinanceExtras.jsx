import React,{useMemo,useState} from 'react';
import {Plus,Pencil,Trash2,Users,ReceiptText,WalletCards,Landmark,Printer,ArrowLeftRight,CheckCircle2} from 'lucide-react';
import {JalaliDateInput} from './ExtraPages.jsx';
import {todayInTehran,persianParts,monthNames} from './jalali.js';
import {settlementPlan} from '../server/shared.js';

const fmt=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const money=x=>fmt.format(Number(x)||0)+' تومان';
const date=x=>{if(!x)return '—';const p=persianParts(x);return p?`${String(p.year).replace(/\d/g,x=>'۰۱۲۳۴۵۶۷۸۹'[x])}/${fmt.format(p.month)}/${fmt.format(p.day)}`:'—'};
const types={incoming:'دریافتی',outgoing:'پرداختی',pending:'در انتظار',cleared:'وصول‌شده',bounced:'برگشتی',cancelled:'باطل‌شده',expense:'بودجه هزینه',income:'هدف درآمد',savings:'هدف پس‌انداز'};
const RowActions=({row,kind,edit,del})=><span className="row-actions"><button title="ویرایش" onClick={()=>edit(kind,row)}><Pencil size={15}/></button><button title="حذف" className="danger" onClick={()=>del(kind,row)}><Trash2 size={15}/></button></span>;
const Blank=({children})=><p className="helper-text">{children}</p>;
export function ContactsPanel({data,add,edit,del}){
 const [search,setSearch]=useState('');
 const rows=data.finance_contacts.filter(x=>(x.name+' '+x.phone).includes(search));
 return <section className="panel"><div className="panel-head"><h2>اشخاص و طرف‌حساب‌ها</h2><button className="primary small" onClick={()=>add('finance_contacts')}><Plus size={15}/> افزودن شخص</button></div>
  <div className="toolbar"><input placeholder="جست‌وجوی نام یا شماره تماس" value={search} onChange={e=>setSearch(e.target.value)}/></div>
  {rows.map(x=>{const balances=data.personal_balances.filter(y=>y.contact_id===x.id);const debt=balances.filter(y=>y.direction==='debt').reduce((s,y)=>s+Number(y.total)-Number(y.settled),0);const owed=balances.filter(y=>y.direction==='receivable').reduce((s,y)=>s+Number(y.total)-Number(y.settled),0);return <div className="line-item extra-row" key={x.id}><Users size={20}/><div className="grow"><strong>{x.name}</strong><small dir="auto">{x.phone||'بدون شماره'}{x.notes?' · '+x.notes:''}</small><small>بدهی: {money(debt)} · طلب: {money(owed)}</small></div><RowActions row={x} kind="finance_contacts" edit={edit} del={del}/></div>})}
  {!rows.length&&<Blank>طرف‌حسابی پیدا نشد.</Blank>}
 </section>;
}
export function ChecksPanel({data,add,edit,del}){
 const [filter,setFilter]=useState('all');
 const rows=data.finance_checks.filter(x=>filter==='all'||x.status===filter).slice().sort((a,b)=>a.due_date.localeCompare(b.due_date));
 const outstanding=data.finance_checks.filter(x=>x.status==='pending');
 return <section className="panel"><div className="panel-head"><h2>مدیریت چک‌ها</h2><button className="primary small" onClick={()=>add('finance_checks')}><Plus size={15}/> ثبت چک</button></div>
  <div className="stats-grid compact"><div className="extra-stat"><small>چک‌های در انتظار وصول</small><strong>{fmt.format(outstanding.length)}</strong></div><div className="extra-stat"><small>جمع چک‌های دریافتی باز</small><strong>{money(outstanding.filter(x=>x.direction==='incoming').reduce((s,x)=>s+Number(x.amount),0))}</strong></div><div className="extra-stat"><small>جمع چک‌های پرداختی باز</small><strong>{money(outstanding.filter(x=>x.direction==='outgoing').reduce((s,x)=>s+Number(x.amount),0))}</strong></div></div>
  <div className="toolbar"><select aria-label="وضعیت چک" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">همه وضعیت‌ها</option>{['pending','cleared','bounced','cancelled'].map(k=><option value={k} key={k}>{types[k]}</option>)}</select></div>
  {rows.map(x=>{const contact=data.finance_contacts.find(c=>c.id===x.contact_id);return <div className="line-item extra-row" key={x.id}><ReceiptText size={20}/><div className="grow"><strong>{x.title} · {money(x.amount)}</strong><small>{types[x.direction]} · {types[x.status]} · سررسید {date(x.due_date)}{x.status==='pending'&&x.due_date<todayInTehran()?' · معوق':''}</small><small>{x.bank}{x.check_number?' · شماره '+x.check_number:''}{contact?' · '+contact.name:''}</small></div><RowActions row={x} kind="finance_checks" edit={edit} del={del}/></div>})}
  {!rows.length&&<Blank>چکی با این وضعیت وجود ندارد.</Blank>}
  <Blank>تغییر وضعیت چک از «ویرایش» انجام می‌شود. وصول چک خودکار به‌عنوان تراکنش بانکی ثبت نمی‌شود.</Blank>
 </section>;
}
export function BudgetsPanel({data,add,edit,del,portfolio}){
 const [filter,setFilter]=useState('all');
 return <section className="panel"><div className="panel-head"><h2>بودجه و اهداف مالی</h2><button className="primary small" onClick={()=>add('finance_budgets')}><Plus size={15}/> هدف جدید</button></div>
  <div className="toolbar"><select aria-label="نوع بودجه" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">همه اهداف</option>{['expense','income','savings'].map(x=><option key={x} value={x}>{types[x]}</option>)}</select></div>
  <div className="budget-cards">{data.finance_budgets.filter(b=>filter==='all'||filter===b.kind).map(b=>{
   const tx=data.transactions.filter(t=>t.date>=b.start_date&&t.date<=b.end_date&&(b.kind==='income'?t.type==='income':t.type!=='income')&&(!b.category||b.category===t.category));
   const actual=b.kind==='savings'?portfolio:tx.reduce((s,t)=>s+Number(t.amount),0);
   const percentage=Math.max(0,Math.min(100,100*actual/Number(b.target)));
   return <article className="budget-card" key={b.id}><div className="line-item"><div className="grow"><strong>{b.title}</strong><small>{types[b.kind]}{b.category?' · '+b.category:''} · {date(b.start_date)} تا {date(b.end_date)}</small></div><RowActions row={b} kind="finance_budgets" edit={edit} del={del}/></div><div className="line-item"><span>{b.kind==='expense'?'مصرف':'پیشرفت'}: {money(actual)}</span><strong>هدف: {money(b.target)}</strong></div><div className="progress"><span style={{width:percentage+'%',background:b.kind==='expense'&&actual>Number(b.target)?'#ef4444':undefined}}/></div><small>{fmt.format(100*actual/Number(b.target))}٪ · {b.kind==='expense'?'مانده سقف: '+money(Math.max(0,Number(b.target)-actual)):'باقی تا هدف: '+money(Math.max(0,Number(b.target)-actual))}</small>{b.kind==='savings'&&<small>پیشرفت بر پایه ارزش فعلی دارایی‌های دارای نرخ است، نه تاریخچه پس‌انداز.</small>}{b.notes&&<p>{b.notes}</p>}</article>;
  })}</div>
  {!data.finance_budgets.length&&<Blank>برای هر دسته هزینه، درآمد یا پس‌انداز هدف و بازه زمانی مشخص کنید.</Blank>}
 </section>;
}
export function TransfersPanel({data,add,edit,del}){
 const names=Object.fromEntries(data.bank_accounts.map(x=>[x.id,x.title]));
 return <section className="panel"><div className="panel-head"><h2>انتقال بین حساب‌ها</h2><button className="primary small" disabled={data.bank_accounts.length<2} onClick={()=>add('account_transfers')}><Plus size={15}/> انتقال جدید</button></div>
  {data.bank_accounts.length<2&&<Blank>ابتدا دست‌کم دو حساب بانکی تعریف کنید.</Blank>}
  {data.account_transfers.map(x=><div key={x.id} className="line-item extra-row"><ArrowLeftRight size={20}/><div className="grow"><strong>{money(x.amount)}</strong><small>{names[x.from_account_id]||'حساب حذف‌شده'} ← {names[x.to_account_id]||'حساب حذف‌شده'} · {date(x.date)}</small><small>{x.notes}</small></div><RowActions row={x} kind="account_transfers" edit={edit} del={del}/></div>)}
  {!data.account_transfers.length&&<Blank>انتقالی ثبت نشده است. انتقال بین حساب‌ها درآمد یا هزینه محسوب نمی‌شود.</Blank>}
 </section>;
}
function saveTextFile(text,filename,type='text/csv;charset=utf-8'){
 const u=URL.createObjectURL(new Blob(['\uFEFF'+text],{type}));const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
export function SharedPanel({data,mutate,delConfirm,notify}){
 const [selected,setSelected]=useState(''),[groupForm,setGroupForm]=useState({title:'',description:''}),[memberName,setMemberName]=useState('');
 const [expense,setExpense]=useState({title:'',payer_id:'',amount:'',date:todayInTehran(),notes:''});
 const [included,setIncluded]=useState({}),[weights,setWeights]=useState({}),[weighted,setWeighted]=useState(false);
 const [settle,setSettle]=useState({from_member_id:'',to_member_id:'',amount:'',date:todayInTehran(),notes:''});
 const current=data.shared_groups.find(g=>g.id===selected)||data.shared_groups[0];
 const chooseGroup=id=>{setSelected(id);setExpense({title:'',payer_id:'',amount:'',date:todayInTehran(),notes:''});setSettle({from_member_id:'',to_member_id:'',amount:'',date:todayInTehran(),notes:''});setIncluded({});setWeights({})};
 const groupId=current?.id;
 const members=data.shared_members.filter(m=>m.group_id===groupId);
 const exps=data.shared_expenses.filter(e=>e.group_id===groupId);
 const expensesSet=new Set(exps.map(e=>e.id));
 const shares=data.shared_shares.filter(x=>expensesSet.has(x.expense_id));
 const settlements=data.shared_settlements.filter(s=>s.group_id===groupId);
 const summaries=useMemo(()=>settlementPlan(members,exps,shares,settlements),[data,groupId]);
 const names=Object.fromEntries(members.map(m=>[m.id,m.name]));
 const handle=async(event,fn)=>{event.preventDefault();try{await fn()}catch(err){notify(err.message||'اطلاعات نامعتبر است')}};
 const createGroup=()=>mutate('POST','/shared/groups',groupForm,'گروه ایجاد شد').then(()=>setGroupForm({title:'',description:''}));
 const createMember=()=>mutate('POST',`/shared/groups/${groupId}/members`,{name:memberName},'عضو اضافه شد').then(()=>setMemberName(''));
 const createExpense=()=>{
  const ids=members.filter(m=>included[m.id]!==false).map(m=>m.id);
  if(!ids.length)throw Error('حداقل یک نفر را برای تقسیم هزینه انتخاب کنید');
  return mutate('POST',`/shared/groups/${groupId}/expenses`,{...expense,payer_id:expense.payer_id||members[0]?.id,member_ids:ids,weights:weighted?ids.map(id=>Number(weights[id]||1)):null},'هزینه مشترک ثبت شد').then(()=>setExpense({title:'',payer_id:'',amount:'',date:todayInTehran(),notes:''}));
 };
 const createSettle=()=>mutate('POST',`/shared/groups/${groupId}/settlements`,settle,'تسویه ثبت شد').then(()=>setSettle({from_member_id:'',to_member_id:'',amount:'',date:todayInTehran(),notes:''}));
 const exportReport=()=>{
  const escape=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
  const rows=[['نوع','شرح','شخص/پرداخت‌کننده','مبلغ تومان','تاریخ'],...exps.map(x=>['هزینه',x.title,names[x.payer_id],x.amount,x.date]),...settlements.map(x=>['تسویه',names[x.from_member_id]+' به '+names[x.to_member_id],'',x.amount,x.date]),...summaries.plan.map(x=>['تسویه پیشنهادی',names[x.from_member_id]+' به '+names[x.to_member_id],'',x.amount,''])];
  saveTextFile(rows.map(r=>r.map(escape).join(',')).join('\r\n'),'hamkharj-'+current.title+'.csv');
 };
 return <div className="shared-page">
  <section className="panel"><div className="panel-head"><h2><Users size={19}/> گروه‌های همخرج</h2></div><form className="extra-inline" onSubmit={e=>handle(e,createGroup)}><label>نام گروه<input required value={groupForm.title} onChange={e=>setGroupForm({...groupForm,title:e.target.value})} placeholder="مثلاً سفر یا خانه"/></label><label>توضیح<input value={groupForm.description} onChange={e=>setGroupForm({...groupForm,description:e.target.value})}/></label><button className="primary small"><Plus size={15}/> ایجاد گروه</button></form>
   <div className="tabs finance-tabs">{data.shared_groups.map(g=><button key={g.id} className={g.id===groupId?'selected':''} onClick={()=>chooseGroup(g.id)}>{g.title}</button>)}</div>
   {!data.shared_groups.length&&<Blank>گروهی ثبت نشده است.</Blank>}
  </section>
  {current&&<>
   <section className="panel"><div className="panel-head"><h2>اعضا · {current.title}</h2><button className="button small danger" onClick={()=>delConfirm('DELETE',`/shared/groups/${groupId}`,'همه اعضا، مخارج و تسویه‌های این گروه حذف شوند؟')}>حذف گروه</button></div><form className="extra-inline" onSubmit={e=>handle(e,createMember)}><label>نام عضو<input required value={memberName} onChange={e=>setMemberName(e.target.value)} placeholder="نام شرکت‌کننده"/></label><button className="primary small"><Plus size={15}/> افزودن عضو</button></form><div className="member-list">{members.map(m=><span className="member-pill" key={m.id}>{m.name} <button title="حذف عضو بدون سابقه" onClick={()=>delConfirm('DELETE',`/shared/members/${m.id}`,'این عضو حذف شود؟')}>×</button></span>)}</div></section>
   <section className="panel"><div className="panel-head"><h2>ثبت هزینه مشترک</h2></div><form className="extra-form" onSubmit={e=>handle(e,createExpense)}><label>شرح هزینه<input required value={expense.title} onChange={e=>setExpense({...expense,title:e.target.value})} placeholder="مثلاً بلیت یا رستوران"/></label><label>پرداخت‌کننده<select required value={expense.payer_id||members[0]?.id||''} onChange={e=>setExpense({...expense,payer_id:e.target.value})}>{members.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label>مبلغ (تومان)<input type="number" required min="0.01" step="0.01" value={expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})}/></label><label>تاریخ شمسی<JalaliDateInput required value={expense.date} onChange={v=>setExpense({...expense,date:v})}/></label><label className="wide">یادداشت<input value={expense.notes} onChange={e=>setExpense({...expense,notes:e.target.value})}/></label><div className="wide"><label className="inline-checkbox"><input type="checkbox" checked={weighted} onChange={e=>setWeighted(e.target.checked)}/> تقسیم به نسبت وزن (در حالت عادی سهم‌ها مساوی‌اند)</label><div className="member-list">{members.map(m=><label className="member-share" key={m.id}><input type="checkbox" checked={included[m.id]!==false} onChange={e=>setIncluded({...included,[m.id]:e.target.checked})}/>{m.name}{weighted&&included[m.id]!==false&&<input aria-label={'وزن '+m.name} type="number" min="1" max="1000000" step="1" value={weights[m.id]||1} onChange={e=>setWeights({...weights,[m.id]:e.target.value})}/>}</label>)}</div></div><button className="primary small" disabled={!members.length}><Plus size={15}/> ثبت و تقسیم هزینه</button></form>
    <div className="extra-ledger">{exps.map(x=><div className="line-item extra-row" key={x.id}><ReceiptText size={18}/><div className="grow"><strong>{x.title} · {money(x.amount)}</strong><small>پرداخت: {names[x.payer_id]} · {date(x.date)}</small><small>{shares.filter(s=>s.expense_id===x.id).map(s=>names[s.member_id]+': '+money(s.amount)).join(' | ')}</small></div><button className="icon-button danger" title="حذف هزینه" onClick={()=>delConfirm('DELETE',`/shared/expenses/${x.id}`,'این هزینه حذف شود؟')}><Trash2 size={15}/></button></div>)}{!exps.length&&<Blank>هنوز هزینه‌ای ثبت نشده است.</Blank>}</div>
   </section>
   <section className="panel shared-print"><div className="panel-head"><h2>تراز اعضا و تسویه</h2><div className="panel-buttons"><button className="button small" onClick={exportReport}>خروجی CSV</button><button className="button small" onClick={()=>window.print()}><Printer size={15}/> چاپ / ذخیره PDF</button></div></div>
    {summaries.balances.map(x=><div key={x.id} className="line-item"><strong>{names[x.id]}</strong><span className={Number(x.amount)>0?'good':Number(x.amount)<0?'danger':''}>{Number(x.amount)>0?'طلبکار: ':Number(x.amount)<0?'بدهکار: ':'تسویه: '}{money(Math.abs(Number(x.amount)))}</span></div>)}
    <h3>تسویه‌های پیشنهادی</h3>{summaries.plan.map((x,i)=><div className="line-item" key={i}><ArrowLeftRight size={16}/><span className="grow">{names[x.from_member_id]} به {names[x.to_member_id]}</span><strong>{money(x.amount)}</strong><button className="button small" onClick={()=>setSettle({...settle,from_member_id:x.from_member_id,to_member_id:x.to_member_id,amount:x.amount})}>انتخاب</button></div>)}{!summaries.plan.length&&<Blank>حساب اعضا تسویه است یا هنوز هزینه‌ای ثبت نشده است.</Blank>}
    <h3>ثبت تسویه واقعی</h3><form className="extra-form" onSubmit={e=>handle(e,createSettle)}><label>پرداخت‌کننده<select required value={settle.from_member_id} onChange={e=>setSettle({...settle,from_member_id:e.target.value})}><option value="">انتخاب</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>دریافت‌کننده<select required value={settle.to_member_id} onChange={e=>setSettle({...settle,to_member_id:e.target.value})}><option value="">انتخاب</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>مبلغ<input type="number" required step="0.01" min="0.01" value={settle.amount} onChange={e=>setSettle({...settle,amount:e.target.value})}/></label><label>تاریخ شمسی<JalaliDateInput required value={settle.date} onChange={v=>setSettle({...settle,date:v})}/></label><button className="primary small" disabled={members.length<2}><CheckCircle2 size={15}/> ثبت تسویه</button></form>
    {settlements.map(x=><div className="line-item extra-row" key={x.id}><span className="grow">{names[x.from_member_id]} ← {names[x.to_member_id]} · {date(x.date)}</span><strong>{money(x.amount)}</strong><button className="icon-button danger" title="حذف تسویه" onClick={()=>delConfirm('DELETE',`/shared/settlements/${x.id}`,'این تسویه حذف شود؟')}><Trash2 size={15}/></button></div>)}
   </section>
  </>}
 </div>;
}
