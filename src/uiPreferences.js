// Presentation only. Every amount in the database and every provider rate is in TOMAN.
// Currency conversion never changes the persisted financial ledger.
export const UI_CURRENCIES = Object.freeze({TOMAN:{fa:'تومان',en:'Toman'},RIAL:{fa:'ریال',en:'Rial'},USD:{fa:'دلار آمریکا',en:'USD'},USDT:{fa:'تتر',en:'USDT'},EUR:{fa:'یورو',en:'EUR'}});
export const DEFAULT_UI = Object.freeze({language:'fa',theme:'light',currency:'TOMAN'});
let active={...DEFAULT_UI,rates:{}};
export function currentUI(){return active;}
export function updateUI(value){active={...active,...value};if(typeof document!=='undefined'){
 document.documentElement.lang=active.language==='en'?'en':'fa';
 document.documentElement.dir=active.language==='en'?'ltr':'rtl';
 document.documentElement.dataset.theme=active.theme==='dark'?'dark':'light';
 document.documentElement.dataset.currency=active.currency;
 }}
export function preferenceValid(p){return p&&['fa','en'].includes(p.language)&&['light','dark'].includes(p.theme)&&Object.hasOwn(UI_CURRENCIES,p.currency);}
export function currencyUnit(){return UI_CURRENCIES[active.currency]?.[active.language]||UI_CURRENCIES.TOMAN.fa;}
export function currencyRate(){switch(active.currency){case 'TOMAN':return 1;case 'RIAL':return 10;default:{const rate=Number(active.rates[active.currency]?.price);return Number.isFinite(rate)&&rate>0?1/rate:null}}}
export function canConvert(){return currencyRate()!==null;}
export function fromToman(amount){const rate=currencyRate();if(rate===null)return null;const n=Number(amount);return Number.isFinite(n)?Number((n*rate).toFixed(8)):null;}
export function toToman(amount){const rate=currencyRate();if(rate===null)return null;const n=Number(amount);return Number.isFinite(n)?Math.round(n/rate*100)/100:null;}
export function plainMoneyInput(toman){const v=fromToman(toman);return v===null?'':String(Number(v.toFixed(active.currency==='TOMAN'||active.currency==='RIAL'?2:6)));}
const localized=(v,max=2,min=0)=>new Intl.NumberFormat(active.language==='en'?'en-US':'fa-IR',{maximumFractionDigits:max,minimumFractionDigits:min}).format(v);
export function formatMoney(toman,{compact=false,hideUnit=false}={}){const v=fromToman(toman);if(v===null)return '—';let n=localized(v,active.currency==='TOMAN'||active.currency==='RIAL'?2:4);if(compact&&Math.abs(v)>=1000){const x=Math.abs(v),d=x>=1e9?1e9:x>=1e6?1e6:1000;const unit=x>=1e9?active.language==='en'?'B':'میلیارد':x>=1e6?active.language==='en'?'M':'میلیون':active.language==='en'?'K':'هزار';n=localized(v/d,1)+` ${unit}`;}return n+(hideUnit?'':` ${currencyUnit()}`)}
export const formatShortMoney=amount=>formatMoney(amount,{compact:true,hideUnit:true});
export function formatCents(amount){const n=typeof amount==='bigint'?Number(amount)/100:Number(amount)/100;return formatMoney(n)}
export function rateStatusText(){return active.language==='en'?'A valid exchange rate is required to display this currency.':'برای نمایش این واحد، نرخ تبدیل معتبر لازم است.';}
