// Validate a complete, per-account ordering. Never trust client indices or SQL fragments.
export function validateCurrencyOrder(codes, available){
 if(!Array.isArray(codes)||!Array.isArray(available)||available.length>300||codes.length!==available.length)throw Object.assign(new Error('فهرست اولویت ارزها کامل نیست'),{status:400});
 const seen=new Set();
 for(const code of codes){
  if(typeof code!=='string'||!/^[A-Z0-9_]{1,12}$/.test(code)||seen.has(code))throw Object.assign(new Error('فهرست ارزها تکراری یا نامعتبر است'),{status:400});
  seen.add(code);
 }
 if(available.some(code=>!seen.has(code)))throw Object.assign(new Error('نماد ارز نامعتبر است'),{status:400});
 return codes;
}
