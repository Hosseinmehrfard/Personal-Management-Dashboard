import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_UI,UI_CURRENCIES,updateUI,currentUI,fromToman,toToman,formatMoney,currencyUnit,formatCents,canConvert,plainMoneyInput} from '../src/uiPreferences.js';
import {translateText} from '../src/i18n.js';
const reset=()=>updateUI({...DEFAULT_UI,rates:{}});

test('five selectable currencies and default TOMAN remain distinct',()=>{
 reset();assert.deepEqual(Object.keys(UI_CURRENCIES),['TOMAN','RIAL','USD','USDT','EUR']);assert.equal(currencyUnit(),'تومان');
 assert.equal(fromToman(1250),1250);assert.equal(toToman(1250),1250);
});
test('RIAL is exactly ten times TOMAN',()=>{
 reset();updateUI({currency:'RIAL'});
 assert.equal(fromToman(1250),12500);assert.equal(toToman(12500),1250);
 assert.match(formatMoney(1250),/ریال/);
});
test('USD and EUR use distinct quoted TOMAN rates in either direction',()=>{
 reset();updateUI({currency:'USD',language:'en',rates:{USD:{price:100000},EUR:{price:125000},USDT:{price:101000}}});
 assert.equal(fromToman(350000),3.5);assert.equal(toToman(3.5),350000);assert.equal(plainMoneyInput(350000),'3.5');
 assert.equal(formatMoney(350000),'3.5 USD');
 updateUI({currency:'EUR'});assert.equal(fromToman(250000),2);assert.equal(toToman(2),250000);
 updateUI({currency:'USDT'});assert.equal(fromToman(101000),1);
});
test('missing/invalid rate never silently displays original TOMAN amount as foreign currency',()=>{
 reset();updateUI({currency:'USD',rates:{USD:{price:0}}});
 assert.equal(canConvert(),false);assert.equal(fromToman(12345),null);assert.equal(toToman(1),null);assert.equal(formatMoney(12345),'—');
 updateUI({rates:{USD:{price:NaN}}});assert.equal(formatMoney(1),'—');
});
test('high precision monetary input rounds to database cent precision',()=>{
 reset();updateUI({currency:'USD',rates:{USD:{price:97864.33}}});
 assert.equal(toToman('1.237'),121058.18);
 reset();assert.equal(formatCents(123400n).includes('تومان'),true);
});
test('interface copy changes to English but no arbitrary user-entered content is translated',()=>{
 assert.equal(translateText('نمای کلی','en'),'Overview');
 assert.equal(translateText('حسابداری','en'),'Accounting');
 assert.equal(translateText('تراکنش','en'),'Transaction');
 assert.equal(translateText('عنوان اختصاصی من','en'),'عنوان اختصاصی من');
 assert.equal(translateText('نمای کلی','fa'),'نمای کلی');
});
