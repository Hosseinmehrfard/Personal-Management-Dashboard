// Persian calendar calculations use the built-in ICU calendar; database dates stay ISO/Gregorian.
const parser=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
export const monthNames=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export const weekdays=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
export function persianParts(iso){
 if(!iso||!/^(\d{4})-(\d{2})-(\d{2})/.test(String(iso)))return null;
 const dt=new Date(String(iso).slice(0,10)+'T12:00:00Z');if(!Number.isFinite(+dt))return null;
 const parts=Object.fromEntries(parser.formatToParts(dt).filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,Number(x.value)]));
 return {year:parts.year,month:parts.month,day:parts.day};
}
export function startOfPersianYear(year){
 if(!Number.isInteger(year)||year<1200||year>1600)return null;
 for(let d=17;d<=24;d++){
  const time=Date.UTC(year+621,2,d);const p=persianParts(new Date(time).toISOString().slice(0,10));
  if(p?.year===year&&p.month===1&&p.day===1)return time;
 }
 return null;
}
export function toIsoJalali(year,month,day){
 year=Number(year);month=Number(month);day=Number(day);
 if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||month<1||month>12||day<1||day>31)return null;
 const base=startOfPersianYear(year);if(base===null)return null;
 const offset=(month<=6?(month-1)*31:186+(month-7)*30)+day-1;
 const iso=new Date(base+offset*86400000).toISOString().slice(0,10);
 const p=persianParts(iso);
 return p?.year===year&&p.month===month&&p.day===day?iso:null;
}
export function daysInMonth(year,month){if(month<1||month>12)return 0;return month<7?31:month<12?30:toIsoJalali(year,12,30)?30:29}
export const weekPosition=iso=>(new Date(iso+'T12:00:00Z').getUTCDay()+1)%7;
export function changeMonth(year,month,delta){const m=(year*12+month-1)+delta;return {year:Math.floor(m/12),month:((m%12)+12)%12+1}}
export function formatJalali(iso){const p=persianParts(iso);return p?`${p.year}/${String(p.month).padStart(2,'0')}/${String(p.day).padStart(2,'0')}`.replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]):'انتخاب تاریخ شمسی'}

const tehranDate=new Intl.DateTimeFormat('en-CA',{calendar:'gregory',timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'});
export function todayInTehran(date=new Date()){
 const fields=Object.fromEntries(tehranDate.formatToParts(date).map(({type,value})=>[type,value]));
 return `${fields.year}-${fields.month}-${fields.day}`;
}
