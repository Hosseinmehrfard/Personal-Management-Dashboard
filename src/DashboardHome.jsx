import React,{useEffect,useMemo,useState} from 'react';
import {Wallet,TrendingUp,TrendingDown,ArrowLeft,ArrowRightLeft,Plus,CalendarDays,CheckCircle2,AlertTriangle,Clock3,ChevronLeft,ChevronRight,SlidersHorizontal,Check,RotateCcw,Landmark,PiggyBank,Users,Receipt,Target,ListTodo,Server,RefreshCw,CircleDollarSign,HandCoins,Coins,CheckCheck,ArrowUp,ArrowDown,Bell,ChartNoAxesCombined,ChartPie,ArrowUpRight,ArrowDownLeft,CreditCard,Sparkles,CalendarClock,MoreHorizontal} from 'lucide-react';
import {changeMonth,daysInMonth,holidayName,monthNames,persianParts,toIsoJalali,todayInTehran,weekPosition} from './jalali.js';
import './dashboard.css';
import {formatMoney as uiMoney,formatShortMoney as uiShort,formatCents as uiCents,currencyUnit,fromToman,currentUI,canConvert,rateStatusText} from './uiPreferences.js';

const fa=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0});
const precise=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const value=n=>Number.isFinite(Number(n))?Number(n):0;
const money=n=>uiMoney(n);
const short=n=>uiShort(n);
const dt=d=>String(d||'').slice(0,10);
const jalaliDate=d=>{if(!d)return 'بدون تاریخ';const date=new Date(dt(d)+'T00:00:00Z');return Number.isNaN(+date)?'بدون تاریخ':new Intl.DateTimeFormat(currentUI().language==='en'?'en-US-u-ca-persian':'fa-IR-u-ca-persian',{month:'short',day:'numeric',timeZone:'UTC'}).format(date)};
const agoTime=date=>{if(!date)return 'نامشخص';const ms=Date.parse(date);if(!Number.isFinite(ms))return 'نامشخص';const mins=Math.floor((Date.now()-ms)/60000);return mins<0?'زمان آینده':mins<60?'کمتر از یک ساعت پیش':mins<1440?`${fa.format(Math.floor(mins/60))} ساعت پیش`:`${fa.format(Math.floor(mins/1440))} روز پیش`};
const percentage=(amount,target)=>target>0?Math.min(100,Math.max(0,(amount/target)*100)):0;
const fmtCents=c=>uiCents(c);
const toCents=x=>{const raw=String(x??'0');const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);if(!match)return 0n;const cents=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0').slice(0,2));return match[1]? -cents:cents};
const knownIcons=new Set(['USD','EUR','GBP','USDT','BTC','ETH','GOLD18','GOLD24','AED','TRY','CNY','CAD','AFN']);
const widgets=[
 ['hero','موجودی و روند مالی'],['accounts','حساب‌های بانکی'],['actions','اقدام‌های سریع'],['stats','خلاصه مالی'],['charts','نمودارهای ماهانه'],['goals','اهداف و بودجه'],['health','سلامت بودجه'],['alerts','سررسیدهای مالی'],['calendar','تقویم فشرده'],['tasks','کارهای پیش‌رو'],['servers','وضعیت سرورها']
];
const defaults={rates:true,order:widgets.map(w=>w[0]),visible:Object.fromEntries(widgets.map(w=>[w[0],true]))};
function readPrefs(user){try{const raw=JSON.parse(localStorage.getItem(`pmd:dashboard:ui:v1:${user}`)||'{}');const prior=['hero','actions','stats','charts','accounts','goals','alerts','calendar','tasks','servers'];const stored=Array.isArray(raw.order)?raw.order.filter(x=>defaults.order.includes(x)):[];const customized=stored.length>0&&stored.join('|')!==prior.join('|');const base=customized?stored:defaults.order;const order=[...new Set(['hero',...base.filter(x=>x!=='hero'),...defaults.order])];return {rates:raw.rates!==false,order,visible:{...defaults.visible,...Object.fromEntries(Object.entries(raw.visible||{}).filter(([k])=>defaults.order.includes(k)).map(([k,v])=>[k,!!v]))}}}catch{return structuredClone(defaults)}}
function usePrefs(username){const [p,setP]=useState(()=>readPrefs(username));useEffect(()=>setP(readPrefs(username)),[username]);const save=next=>setP(old=>{const result=typeof next==='function'?next(old):next;try{localStorage.setItem(`pmd:dashboard:ui:v1:${username}`,JSON.stringify(result))}catch{}return result});return [p,save]}
function CurrencyArt({currency}){const code=currency.code;return knownIcons.has(code)?<img className="dash-currency-art" src={`/currency-icons/${code}.svg`} alt={`نماد ${currency.name}`} loading="lazy"/>:<span className="dash-currency-fallback" aria-hidden="true">{currency.symbol||'¤'}</span>}
function quoteDiff(code,price,history){const rows=(history||[]).filter(h=>h.code===code);const current=rows.find(h=>Number(h.rn)===1),last=rows.find(h=>Number(h.rn)===2);if(!current||!last)return null;const old=value(last.price_toman),now=value(current.price_toman);if(!old||Math.abs(now-value(price))>.011)return null;return (now-old)/old*100}
function PriceStrip({data,rateBy,busy,isOnline,role,refreshPrices,go,visible}){const selected=(data.currencies||[]).filter(c=>c.is_visible!==false&&c.code!=='TOMAN');return <section className="dash-market" aria-label="نرخ ارزها و دارایی‌ها"><div className="dash-section-title"><div><span className="dash-overline">رصد بازار</span><h2>نرخ ارزها و دارایی‌ها</h2></div><div className="dash-title-actions"><button className="dash-text-button" onClick={()=>go('currencies')}>مدیریت ارزها <ArrowLeft size={15}/></button>{role==='admin'&&<button className="dash-icon-btn" aria-label="به‌روزرسانی نرخ ارزها" title="به‌روزرسانی نرخ ارزها" onClick={refreshPrices} disabled={!isOnline||busy}><RefreshCw size={17}/></button>}</div></div>{selected.length?<div className="dash-market-scroller" tabIndex={0} aria-label="نرخ ارزها، پیمایش افقی">{selected.map(c=>{const r=rateBy[c.code],price=r?.price,diff=price!=null?quoteDiff(c.code,price,data.priceHistory):null;return <article className="dash-rate-card" key={c.code}><div className="dash-rate-heading"><CurrencyArt currency={c}/><div className="dash-rate-label"><strong>{c.name}</strong><small dir="ltr">{c.code}</small></div></div><div className="dash-rate-price">{price!=null?money(price):'—'}</div><div className="dash-rate-foot">{diff===null?<span className="dash-quiet">{price!=null?'تغییر نامشخص':'نرخ موجود نیست'}</span>:<span className={diff>0?'dash-up':diff<0?'dash-down':'dash-quiet'}>{diff>0?'+' : ''}{precise.format(diff)}٪ <span>نسبت به نرخ قبلی</span></span>}<span title={r?.updatedAt?new Date(r.updatedAt).toLocaleString('fa-IR'):'بدون نرخ ثبت‌شده'} className="dash-rate-age">{r?.updatedAt?agoTime(r.updatedAt):'—'}</span></div></article>})}</div>:<div className="dash-empty-market">ارزی برای نمایش انتخاب نشده است. <button onClick={()=>go('currencies')}>انتخاب ارزها</button></div>}<p className="dash-market-note">قیمت‌ها از نرخ ثبت‌شده سامانه خوانده می‌شوند؛ تغییر درصدی، مقایسه با ثبت قبلی است و لزوماً تغییر روزانه نیست.</p></section>}
function SumCard({label,amount,icon:Icon,note,tone='neutral',moneyValue=true}){return <div className={`dash-sum dash-sum-${tone}`}><div className="dash-sum-top"><span>{label}</span><span className="dash-sum-icon"><Icon size={19}/></span></div><strong dir="auto">{moneyValue?short(value(amount)):amount}</strong>{moneyValue&&<small>{currencyUnit()}</small>}{note&&<p>{note}</p>}</div>}
function QuickActions({create,openFinance}){const actions=[['ثبت هزینه',TrendingDown,()=>create('transactions',null,{type:'expense'})],['ثبت درآمد',TrendingUp,()=>create('transactions',null,{type:'income'})],['انتقال وجه',ArrowRightLeft,()=>openFinance('account_transfers',true)],['بدهی / طلب',HandCoins,()=>openFinance('debt',true)],['چک جدید',Receipt,()=>openFinance('finance_checks',true)],['ثبت کار',ListTodo,()=>create('tasks')]];return <div className="dash-quick-actions">{actions.map(([label,Icon,click],i)=><button key={label} onClick={click} className={`dash-action ${i===0?'dash-action-primary':''}`}><span><Icon size={19}/></span>{label}</button>)}</div>}
function IncomeBars({monthly,month}){const rows=Array.from({length:6},(_,i)=>{const at=changeMonth(month.year,month.month,i-5),key=`${at.year}-${String(at.month).padStart(2,'0')}`,list=monthly.get(key)||[];return {key,label:monthNames[at.month-1],income:list.filter(t=>t.type==='income').reduce((s,t)=>s+value(t.amount),0),expense:list.filter(t=>t.type!=='income').reduce((s,t)=>s+value(t.amount),0)}});const max=Math.max(1,...rows.map(x=>Math.max(x.income,x.expense)));return <div className="dash-chart"><div className="dash-chart-legend"><span><i className="income"/>درآمد</span><span><i className="expense"/>هزینه و قسط</span></div><div className="dash-bars" role="img" aria-label="مقایسه درآمد و هزینه شش ماه اخیر">{rows.map(x=><div className="dash-bars-group" key={x.key}><div className="dash-bars-stack"><div className="dash-bar income" style={{height:`${x.income/max*100}%`}} title={`درآمد ${x.label}: ${money(x.income)}`}/><div className="dash-bar expense" style={{height:`${x.expense/max*100}%`}} title={`هزینه ${x.label}: ${money(x.expense)}`}/></div><small>{x.label}</small></div>)}</div>{!rows.some(x=>x.income||x.expense)&&<p className="dash-muted">برای نمایش روند، تراکنش مالی ثبت کنید.</p>}</div>}
function Categories({monthRows}){const rows=monthRows.filter(t=>t.type!=='income'),sum=rows.reduce((s,t)=>s+value(t.amount),0);const buckets=Object.entries(rows.reduce((m,t)=>{const key=t.category||'سایر';m[key]=(m[key]||0)+value(t.amount);return m},{})).sort((a,b)=>b[1]-a[1]);const visible=buckets.slice(0,4),other=buckets.slice(4).reduce((s,[,v])=>s+v,0),parts=other?[...visible,['سایر دسته‌ها',other]]:visible;const colors=['#1c9689','#f0ab75','#7c91dd','#ad8bc6','#cad6e4'];let start=0;const stops=parts.map(([label,x],i)=>{const end=start+x/sum*100,str=`${colors[i]} ${start}% ${end}%`;start=end;return str});return <div className="dash-categories">{sum>0?<><div className="dash-donut" style={{background:`conic-gradient(${stops.join(',')})`}} role="img" aria-label={`کل هزینه‌ها ${money(sum)}`}><span><small>کل هزینه‌ها</small><strong>{short(sum)}</strong><small>{currencyUnit()}</small></span></div><div className="dash-cat-legend">{parts.map(([label,total],i)=><div key={label}><span><i style={{background:colors[i]}}/>{label}</span><b>{fa.format(Math.round(total/sum*100))}٪</b></div>)}</div></>:<div className="dash-no-data">هنوز هزینه‌ای برای این ماه ثبت نشده است.</div>}</div>}
function Accounts({data,openFinance}){
 const transactions=data.transactions||[],transfers=data.account_transfers||[];
 const accounts=(data.bank_accounts||[]).map(a=>{
  let cents=toCents(a.balance);
  for(const t of transactions)if(t.account_id===a.id)cents+=t.type==='income'?toCents(t.amount):-toCents(t.amount);
  for(const t of transfers){if(t.from_account_id===a.id)cents-=toCents(t.amount);if(t.to_account_id===a.id)cents+=toCents(t.amount)}
  const history=transactions.filter(t=>t.account_id===a.id).slice().sort((x,y)=>dt(x.date).localeCompare(dt(y.date))).slice(-7);
  const values=history.reduce((list,t)=>{list.push((list.at(-1)||0)+(t.type==='income'?value(t.amount):-value(t.amount)));return list},[0]);
  return {...a,current:cents,values};
 });
 return <div className="dash-bank-block">
  {accounts.length?<div className="dash-bank-cards">{accounts.slice(0,2).map((a,i)=>{
   const digits=String(a.card_number||'').replace(/\D/g,'').slice(-4);
   return <div className={`dash-visual-account dash-visual-account-${i}`} key={a.id}>
    <div className="dash-visual-account-top"><span>{a.bank_name||a.bank||'حساب بانکی'}</span><Landmark size={21}/></div>
    <div className="dash-visual-account-title">{a.title||'حساب شخصی'}</div>
    <strong dir="auto">{fmtCents(a.current)}</strong>
    <div className="dash-visual-account-bottom"><span>{digits?`•••• ${digits}`:'حساب ثبت‌شده'}</span><MiniSpark values={a.values}/></div>
   </div>;
  })}</div>:<div className="dash-bank-empty"><CreditCard size={31}/><strong>هنوز حسابی اضافه نشده</strong><small>حساب بانکی را ثبت کنید تا مانده آن در این قسمت نمایش داده شود.</small></div>}
  <div className="dash-bank-actions">
   <button onClick={()=>openFinance('bank_accounts')}><Landmark size={17}/><span>حساب‌ها</span></button>
   <button onClick={()=>openFinance('account_transfers',true)}><ArrowRightLeft size={17}/><span>انتقال</span></button>
   <button onClick={()=>openFinance('finance_checks')}><Receipt size={17}/><span>چک‌ها</span></button>
  </div>
 </div>
}
function MiniSpark({values}){
 const arr=values.length>1?values:[0,0];const lo=Math.min(...arr),hi=Math.max(...arr);const pts=arr.map((v,i)=>`${3+(i/(arr.length-1))*79},${24-((v-lo)/(hi-lo||1))*18}`).join(' ');
 return <svg viewBox="0 0 86 28" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Goals({data,portfolio,noRate,openFinance}){const today=todayInTehran(),budgets=(data.finance_budgets||[]).filter(b=>dt(b.end_date)>=today).sort((a,b)=>dt(a.end_date).localeCompare(dt(b.end_date)));const transactions=data.transactions||[];return <>{budgets.length?<div className="dash-goals">{budgets.slice(0,3).map(b=>{const from=dt(b.start_date),to=dt(b.end_date);const base=transactions.filter(t=>dt(t.date)>=from&&dt(t.date)<=to);let attained=0,valid=true;if(b.kind==='savings'){attained=portfolio;valid=!noRate}else{attained=base.filter(t=>b.kind==='income'?(t.type==='income'&&(!b.category||t.category===b.category)):(t.type!=='income'&&(!b.category||t.category===b.category))).reduce((s,t)=>s+value(t.amount),0)}const ratio=valid?percentage(attained,value(b.target)):0;return <div className="dash-goal" key={b.id}><div className="dash-goal-heading"><div><strong>{b.title}</strong><small>{b.kind==='expense'?'بودجه هزینه':b.kind==='income'?'هدف درآمد':'هدف پس‌انداز'} · تا {jalaliDate(b.end_date)}</small></div><b>{valid?fa.format(Math.round(ratio))+'٪':'—'}</b></div><div className="dash-progress"><span className={b.kind==='expense'&&attained>value(b.target)?'over':''} style={{width:ratio+'%'}}/></div><small>{valid?`${money(attained)} از ${money(b.target)}`:'ارزش دارایی‌ها به‌دلیل نبود نرخ کامل نیست'}</small></div>})}</div>:<p className="dash-no-data">بودجه یا هدف فعالی ثبت نشده است.</p>}<button className="dash-sub-link" onClick={()=>openFinance('finance_budgets')}>همه اهداف <ArrowLeft size={15}/></button></>}
function eventsOf(data){return [
 ...(data.tasks||[]).filter(x=>x.due_date&&x.status!=='done').map(x=>({id:'t'+x.id,date:dt(x.due_date),title:x.title,kind:'کار'})),
 ...(data.finance_checks||[]).filter(x=>x.status==='pending').map(x=>({id:'c'+x.id,date:dt(x.due_date),title:x.title,kind:'چک'})),
 ...(data.personal_balances||[]).filter(x=>x.due_date&&toCents(x.total)>toCents(x.settled)).map(x=>({id:'d'+x.id,date:dt(x.due_date),title:x.title,kind:x.direction==='debt'?'بدهی':'طلب'})),
 ...(data.installments||[]).filter(x=>x.due_date&&value(x.total)>value(x.paid)).map(x=>({id:'i'+x.id,date:dt(x.due_date),title:x.title,kind:'قسط'})),
 ...(data.finance_budgets||[]).filter(x=>x.end_date).map(x=>({id:'g'+x.id,date:dt(x.end_date),title:x.title,kind:'هدف'}))
]}
function CompactCalendar({data,go}){const today=todayInTehran(),now=persianParts(today);const [current,setCurrent]=useState({year:now.year,month:now.month});const [selected,setSelected]=useState(today);const events=useMemo(()=>eventsOf(data),[data]);const start=toIsoJalali(current.year,current.month,1);const first=start?Date.parse(start+'T00:00:00Z'):0;const offset=start?weekPosition(start):0;const days=daysInMonth(current.year,current.month);const eventCounts=new Map();for(const e of events)eventCounts.set(e.date,(eventCounts.get(e.date)||0)+1);function move(v){const next=changeMonth(current.year,current.month,v);setCurrent(next);setSelected(toIsoJalali(next.year,next.month,1))}return <div className="dash-mini-calendar"><div className="dash-mini-head"><strong>{monthNames[current.month-1]} {fa.format(current.year)}</strong><div><button aria-label="ماه قبل" onClick={()=>move(-1)}><ChevronRight size={18}/></button><button aria-label="ماه بعد" onClick={()=>move(1)}><ChevronLeft size={18}/></button></div></div><div className="dash-mini-grid">{['ش','ی','د','س','چ','پ','ج'].map(w=><span className="dash-weekday" key={w}>{w}</span>)}{Array.from({length:offset},(_,i)=><span className="dash-mini-blank" key={'b'+i}/>)}{Array.from({length:days},(_,i)=>{const day=i+1,iso=new Date(first+(day-1)*86400000).toISOString().slice(0,10);const holiday=holidayName(current.year,current.month,day);return <button key={iso} aria-label={`روز ${fa.format(day)}${eventCounts.has(iso)?'، دارای رویداد':''}`} aria-pressed={iso===selected} className={`${iso===today?'today':''} ${iso===selected?'picked':''} ${holiday?'holiday':''}`} onClick={()=>setSelected(iso)}><span>{fa.format(day)}</span>{eventCounts.has(iso)&&<i aria-hidden="true"/>}</button>})}</div><div className="dash-calendar-foot"><div className="dash-calendar-day"><b>{jalaliDate(selected)}</b><small>{holidayName(persianParts(selected)?.year,persianParts(selected)?.month,persianParts(selected)?.day)||'برنامه‌های روز'}</small></div>{events.filter(e=>e.date===selected).slice(0,2).map(e=><div key={e.id} className="dash-calendar-event"><span>{e.kind}</span>{e.title}</div>)}{!events.some(e=>e.date===selected)&&<small>رویداد ثبت‌شده‌ای برای این روز نیست.</small>}<button className="dash-sub-link" onClick={()=>go('calendar')}>تقویم کامل <ArrowLeft size={15}/></button></div></div>}
function Alerts({data,openFinance,go}){
 const now=todayInTehran(),until=new Date(Date.parse(now+'T00:00:00Z')+30*86400000).toISOString().slice(0,10);
 const entries=[];
 for(const c of data.finance_checks||[])if(c.status==='pending'&&c.due_date&&dt(c.due_date)<=until)entries.push({id:'c'+c.id,date:dt(c.due_date),title:c.title||'چک',type:'چک',amount:c.amount,where:'finance_checks',icon:Receipt});
 for(const b of data.personal_balances||[])if(b.due_date&&b.direction==='debt'&&toCents(b.total)>toCents(b.settled)&&dt(b.due_date)<=until)entries.push({id:'b'+b.id,date:dt(b.due_date),title:b.title||'بدهی شخصی',type:'بدهی',amount:Number(toCents(b.total)-toCents(b.settled))/100,where:'debt',icon:HandCoins});
 for(const l of data.installments||[])if(l.due_date&&value(l.total)>value(l.paid)&&dt(l.due_date)<=until)entries.push({id:'i'+l.id,date:dt(l.due_date),title:l.title||'قسط',type:'قسط',amount:value(l.total)-value(l.paid),where:'installments',icon:CalendarClock});
 entries.sort((a,b)=>a.date.localeCompare(b.date));
 return <>{entries.length?<div className="dash-upcoming-list">{entries.slice(0,4).map(x=>{const Icon=x.icon;return <button className="dash-upcoming-row" key={x.id} onClick={()=>openFinance(x.where)}><span className="dash-upcoming-icon"><Icon size={19}/></span><span className="dash-grow"><strong>{x.title}</strong><small>{x.date<now?'گذشته از موعد':jalaliDate(x.date)} · {x.type}</small></span><span className="dash-upcoming-value">{x.amount!=null?short(x.amount):'—'}<small>{x.amount!=null?currencyUnit():''}</small></span></button>})}</div>:<div className="dash-all-clear"><CheckCircle2 size={22}/><div><strong>سررسید نزدیکی ثبت نشده</strong><small>چک‌ها، بدهی‌ها و اقساط ۳۰ روز آینده بررسی شدند.</small></div></div>}{entries.length>4&&<button className="dash-sub-link" onClick={()=>go('calendar')}>{fa.format(entries.length-4)} سررسید دیگر <ArrowLeft size={15}/></button>}</>
}
function Tasks({data,go,complete}){const items=(data.tasks||[]).filter(t=>t.status!=='done').sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,4);return <>{items.length?<div className="dash-tasks">{items.map(t=><div className="dash-task" key={t.id}><button title="علامت‌گذاری به‌عنوان تکمیل‌شده" aria-label={`تکمیل ${t.title}`} onClick={()=>complete(t)}><Check size={16}/></button><div><strong>{t.title}</strong><small>{t.due_date?jalaliDate(t.due_date):'بدون سررسید'}</small></div></div>)}</div>:<p className="dash-no-data">کار بازی ثبت نشده است.</p>}<button className="dash-sub-link" onClick={()=>go('tasks')}>مدیریت کارها <ArrowLeft size={15}/></button></>}
function Servers({data,go}){const servers=data.servers||[];return <><div className="dash-server-list">{servers.slice(0,4).map(s=><div key={s.id}><span className={s.metrics?'dash-led active':'dash-led'}/><div><strong>{s.name}</strong><small>{s.metrics?'داده پایش موجود است':'داده پایش در دسترس نیست'}</small></div>{s.metrics&&<span>{fa.format(value(s.metrics.cpu?.usagePercent))}٪ CPU</span>}</div>)}{!servers.length&&<p className="dash-no-data">سروری ثبت نشده است.</p>}</div><button className="dash-sub-link" onClick={()=>go('servers')}>مدیریت سرورها <ArrowLeft size={15}/></button></>}
function DashPanel({title,icon:Icon,children,action}){return <section className="dash-panel"><header><span className="dash-panel-icon"><Icon size={18}/></span><h2>{title}</h2>{action&&<div className="dash-panel-action">{action}</div>}</header><div className="dash-panel-body">{children}</div></section>}
function HeroOverview({bankTotal,income,expenses,data,openFinance}){
 const now=persianParts(todayInTehran());
 const months=Array.from({length:6},(_,i)=>{
  const at=changeMonth(now.year,now.month,i-5);
  const entries=(data.transactions||[]).filter(t=>{const part=persianParts(dt(t.date));return part&&part.year===at.year&&part.month===at.month});
  return {label:monthNames[at.month-1],income:entries.filter(t=>t.type==='income').reduce((sum,t)=>sum+value(t.amount),0),expense:entries.filter(t=>t.type!=='income').reduce((sum,t)=>sum+value(t.amount),0)};
 });
 const hasHistory=months.some(m=>m.income||m.expense);
 const ceiling=Math.max(1,...months.map(m=>Math.max(m.income,m.expense)));
 const points=kind=>months.map((r,i)=>`${24+i*119},${177-r[kind]/ceiling*130}`).join(' ');
 const incomePoints=points('income'),expensePoints=points('expense');
 const balanceNote=income-expenses;
 return <section className="dash-hero" aria-label="خلاصه دارایی و نمودارهای مالی">
  <div className="dash-hero-main">
   <div className="dash-hero-top"><span className="dash-hero-kicker"><span className="dash-hero-dot"/> نمای وضعیت مالی</span><span className="dash-hero-time"><CalendarClock size={14}/> شش ماه اخیر</span></div>
   <p className="dash-hero-balance-label">موجودی قابل استفاده</p>
   <div className="dash-hero-balance" dir="auto">{fmtCents(bankTotal)}</div>
   <div className="dash-hero-footline"><span className={balanceNote>=0?'dash-hero-positive':'dash-hero-negative'}>{balanceNote>=0?<ArrowUpRight size={14}/>:<ArrowDownLeft size={14}/>} {money(Math.abs(balanceNote))}</span><span>خالص درآمد و هزینه این ماه</span></div>
   <button onClick={()=>openFinance('transactions',true)} className="dash-hero-new"><Plus size={16}/> ثبت تراکنش</button>
  </div>
  <div className="dash-hero-chart">
   <div className="dash-hero-chart-head"><strong>جریان مالی ماهانه</strong><div className="dash-hero-legend"><span><i className="income"/>درآمد</span><span><i className="expense"/>هزینه</span></div></div>
   <div className="dash-hero-graph">
    <svg viewBox="0 0 650 213" preserveAspectRatio="none" role="img" aria-label="روند درآمد و هزینه شش ماه گذشته">
     <defs><linearGradient id="balanceChartFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d8990" stopOpacity=".19"/><stop offset="1" stopColor="#0d8990" stopOpacity="0"/></linearGradient></defs>
     {[47,90,133,177].map(y=><line key={y} x1="0" y1={y} x2="650" y2={y} stroke="currentColor" opacity=".12" strokeDasharray="4 7"/>)}
     {hasHistory&&<><polygon points={`24,199 ${incomePoints} 619,199`} fill="url(#balanceChartFade)"/><polyline points={incomePoints} stroke="#078b93" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/><polyline points={expensePoints} stroke="#edb2a6" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>{months.map((row,i)=><circle key={i} cx={24+i*119} cy={177-row.income/ceiling*130} r="4.5" fill="#0b8c95" stroke="var(--ui-card)" strokeWidth="2"><title>{row.label}: درآمد {money(row.income)}، هزینه {money(row.expense)}</title></circle>)}</>}
    </svg>
    <div className="dash-hero-months">{months.map((m,i)=><span key={i}>{m.label}</span>)}</div>
    {!hasHistory&&<div className="dash-hero-empty">برای نمایش نمودار، درآمد یا هزینه ثبت کنید.</div>}
   </div>
  </div>
 </section>
}
function FinancialHealth({data,openFinance}){
 const today=todayInTehran();const budgets=(data.finance_budgets||[]).filter(b=>b.kind==='expense'&&dt(b.start_date)<=today&&dt(b.end_date)>=today);
 const selected=budgets.slice().sort((a,b)=>dt(a.end_date).localeCompare(dt(b.end_date)))[0];
 const limit=selected?value(selected.target):0;
 const spending=selected?(data.transactions||[]).filter(t=>t.type!=='income'&&dt(t.date)>=dt(selected.start_date)&&dt(t.date)<=dt(selected.end_date)&&(!selected.category||t.category===selected.category)).reduce((n,t)=>n+value(t.amount),0):0;
 const percent=limit>0?Math.round(spending/limit*100):0;
 return <div className="dash-health">
  <div className="dash-health-gauge" style={{'--health-value':`${Math.min(100,percent)}%`,'--health-color':percent>100?'#e28b77':percent>=85?'#e5a566':'#13a68f'}} aria-label={limit?`بودجه مصرف شده: ${percent} درصد`:'بودجه‌ای تعریف نشده'}>
   <div><strong>{limit?`${fa.format(percent)}٪`:'—'}</strong><small>{limit?'بودجه مصرف‌شده':'بدون بودجه'}</small></div>
  </div>
  <div className="dash-health-metrics"><div><span>{selected?.title||'سقف بودجه فعال'}</span><strong>{limit?money(limit):'—'}</strong></div><div><span>مصرف ثبت‌شده</span><strong>{limit?money(spending):'—'}</strong></div></div>
  <button className="dash-sub-link" onClick={()=>openFinance('finance_budgets')}>{limit?'جزئیات بودجه':'تعریف بودجه'} <ArrowLeft size={15}/></button>
 </div>
}
function PrefsModal({prefs,setPrefs,close}){const turn=(id,enabled)=>setPrefs(p=>({...p,visible:{...p.visible,[id]:enabled}}));const move=(id,delta)=>setPrefs(p=>{const list=[...p.order],i=list.indexOf(id),j=i+delta;if(j<0||j>=list.length)return p;[list[i],list[j]]=[list[j],list[i]];return {...p,order:list}});return <div className="dash-pref-mask" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="dash-pref-panel" role="dialog" aria-modal="true" aria-label="شخصی‌سازی نمای کلی"><header><div><span className="dash-overline">چیدمان دلخواه</span><h2>شخصی‌سازی نمای کلی</h2></div><button className="dash-icon-btn" aria-label="بستن" onClick={close}><Check size={19}/></button></header><p>بخش‌های دلخواه را روشن یا خاموش کنید و ترتیب آن‌ها را تغییر دهید. تغییرات در همین مرورگر و برای این حساب ذخیره می‌شوند.</p><label className="dash-pref-rate"><input type="checkbox" checked={prefs.rates} onChange={e=>setPrefs(p=>({...p,rates:e.target.checked}))}/>نمایش نرخ ارزها در بالای صفحه</label><div className="dash-pref-items">{prefs.order.map((id,i)=><div className="dash-pref-item" key={id}><label><input type="checkbox" checked={prefs.visible[id]} onChange={e=>turn(id,e.target.checked)}/>{widgets.find(w=>w[0]===id)?.[1]}</label><div><button title="انتقال به بالا" aria-label={`بالا بردن ${id}`} onClick={()=>move(id,-1)} disabled={i===0}><ArrowUp size={16}/></button><button title="انتقال به پایین" aria-label={`پایین بردن ${id}`} onClick={()=>move(id,1)} disabled={i===prefs.order.length-1}><ArrowDown size={16}/></button></div></div>)}</div><footer><button className="button" onClick={()=>setPrefs(structuredClone(defaults))}><RotateCcw size={16}/> بازگردانی پیش‌فرض</button><button className="primary" onClick={close}><Check size={16}/> پایان</button></footer></section></div>}
export function DashboardHome({username,data,rateBy,isOnline,role,busy,refreshPrices,go,openFinance,create,completeTask,income,expenses,portfolio,noRate,pricedHoldings,bankTotal,remaining,debtTotal,receivableTotal,currentMonth}){
 const [prefs,setPrefs]=usePrefs(username),[editPrefs,setEditPrefs]=useState(false);
 const monthly=useMemo(()=>{const map=new Map();for(const t of data.transactions||[]){const p=persianParts(dt(t.date));if(!p)continue;const key=`${p.year}-${String(p.month).padStart(2,'0')}`;if(!map.has(key))map.set(key,[]);map.get(key).push(t)}return map},[data.transactions]);
 const monthRows=monthly.get(`${currentMonth.year}-${String(currentMonth.month).padStart(2,'0')}`)||[];
 const taskCount=(data.tasks||[]).filter(t=>t.status!=='done').length;
 const components={
  hero:<HeroOverview {...{bankTotal,portfolio,income,expenses,noRate,data,go,openFinance}}/>,
  actions:<QuickActions create={create} openFinance={openFinance}/>,
  alerts:<DashPanel title="پرداخت‌های پیش‌رو" icon={CalendarClock}><Alerts data={data} openFinance={openFinance} go={go}/></DashPanel>,
  stats:<div className="dash-summary-grid"><SumCard label="موجودی حساب‌ها" amount={fmtCents(bankTotal)} moneyValue={false} icon={Landmark} tone="blue"/><SumCard label="ارزش پس‌انداز" amount={noRate&&!pricedHoldings?'—':short(portfolio)} moneyValue={false} icon={PiggyBank} tone="mint" note={noRate?`${fa.format(noRate)} دارایی بدون نرخ معتبر`:'بر اساس نرخ‌های موجود'}/><SumCard label="درآمد این ماه" amount={income} icon={TrendingUp} tone="mint"/><SumCard label="هزینه این ماه" amount={expenses} icon={TrendingDown} tone="orange"/><SumCard label="خالص این ماه" amount={income-expenses} icon={CircleDollarSign}/><SumCard label="بدهی شخصی" amount={fmtCents(debtTotal)} moneyValue={false} icon={HandCoins}/><SumCard label="طلب شخصی" amount={fmtCents(receivableTotal)} moneyValue={false} icon={Wallet}/><SumCard label="اقساط باقیمانده" amount={remaining} icon={CalendarDays}/></div>,
  charts:<div className="dash-charts-grid"><DashPanel title="درآمد و هزینه؛ شش ماه اخیر" icon={ChartNoAxesCombined} action={<button className="dash-text-button" onClick={()=>openFinance('report')}>گزارش کامل <ArrowLeft size={15}/></button>}><IncomeBars monthly={monthly} month={currentMonth}/></DashPanel><DashPanel title="ترکیب هزینه‌های این ماه" icon={ChartPie}><Categories monthRows={monthRows}/></DashPanel></div>,
  accounts:<DashPanel title="حساب‌های بانکی" icon={Landmark}><Accounts data={data} openFinance={openFinance}/></DashPanel>,
  goals:<DashPanel title="هدف‌های مالی" icon={Target}><Goals data={data} portfolio={portfolio} noRate={noRate} openFinance={openFinance}/></DashPanel>,
  health:<DashPanel title="وضعیت بودجه" icon={ChartPie}><FinancialHealth data={data} openFinance={openFinance}/></DashPanel>,
  calendar:<DashPanel title="تقویم شمسی" icon={CalendarDays}><CompactCalendar data={data} go={go}/></DashPanel>,
  tasks:<DashPanel title={`کارهای پیش‌رو · ${fa.format(taskCount)}`} icon={ListTodo}><Tasks data={data} complete={completeTask} go={go}/></DashPanel>,
  servers:<DashPanel title="وضعیت سرورها" icon={Server}><Servers data={data} go={go}/></DashPanel>
 };
 return <div className="dashboard-home">
  <div className="dash-intro"><div><span className="dash-overline">PERSONAL WORKSPACE</span><h2>داشبورد من</h2><p>وضعیت مالی، حساب‌ها و برنامه‌ها در یک نگاه</p></div><div className="dash-intro-tools"><nav className="dash-view-nav" aria-label="بخش‌های اصلی"><button className="active" aria-current="page">نمای کلی</button><button onClick={()=>go('finance')}>حسابداری</button><button onClick={()=>openFinance('report')}>گزارش‌ها</button><button onClick={()=>go('calendar')}>تقویم مالی</button></nav><button className="dash-customize" onClick={()=>setEditPrefs(true)} title="شخصی‌سازی نمای کلی" aria-label="شخصی‌سازی نمای کلی"><SlidersHorizontal size={17}/> <span>شخصی‌سازی</span></button></div></div>
  {!canConvert()&&<div className="dash-fx-warning"><AlertTriangle size={17}/><span>{rateStatusText()} ({currentUI().currency})</span><button onClick={()=>go('currencies')}>مدیریت ارزها</button></div>}{prefs.rates&&<PriceStrip {...{data,rateBy,busy,isOnline,role,refreshPrices,go}}/>}
  <div className="dash-modules">{prefs.order.filter(id=>prefs.visible[id]).map(id=><div className={`dash-module dash-module-${id}`} key={id}>{components[id]}</div>)}</div>
  {editPrefs&&<PrefsModal prefs={prefs} setPrefs={setPrefs} close={()=>setEditPrefs(false)}/>}
 </div>
}
