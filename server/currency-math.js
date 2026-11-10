// Every value returned to the UI and stored in exchange_rates is TOMAN per unit.
export function normalizeToman(raw,unit='RIAL'){
 const value=Number(raw);
 if(!Number.isFinite(value)||value<=0)throw Error('نرخ نامعتبر است');
 if(!['RIAL','TOMAN'].includes(unit))throw Error('واحد نرخ نامعتبر است');
 return unit==='RIAL'?value/10:value;
}
export function valueToman(quantity,price){const q=Number(quantity),p=Number(price);if(!Number.isFinite(q)||!Number.isFinite(p)||q<0||p<0)throw Error('مقدار یا نرخ نامعتبر است');return q*p}
