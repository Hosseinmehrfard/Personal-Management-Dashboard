import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCurrencyOrder} from '../server/currency-order.js';
const known=['TOMAN','USD','EUR','USDT','BTC','GOLD18'];
test('allows a valid complete order including hidden currencies',()=>{
 assert.deepEqual(validateCurrencyOrder(['USD','BTC','EUR','GOLD18','USDT','TOMAN'],known),['USD','BTC','EUR','GOLD18','USDT','TOMAN']);
});
test('rejects an incomplete order',()=>assert.throws(()=>validateCurrencyOrder(['USD','EUR'],known)));
test('rejects duplicate symbols',()=>assert.throws(()=>validateCurrencyOrder(['USD','USD','EUR','USDT','BTC','GOLD18'],known)));
test('rejects injected values and malformed symbols',()=>assert.throws(()=>validateCurrencyOrder(['USD','BTC','EUR','GOLD18','USDT','TOMAN;DROP TABLE currencies'],known)));
test('rejects unknown but well-formed symbols',()=>assert.throws(()=>validateCurrencyOrder(['USD','BTC','EUR','GOLD18','USDT','FAKE'],known)));
test('rejects non-array and mixed-type values',()=>{assert.throws(()=>validateCurrencyOrder(null,known));assert.throws(()=>validateCurrencyOrder([1,'USD','EUR','USDT','BTC','GOLD18'],known))});
test('enforces a bounded size',()=>assert.throws(()=>validateCurrencyOrder([],Array.from({length:301},(_,i)=>'C'+i))));
test('does not mutate supplied order',()=>{const order=['BTC','USDT','EUR','USD','GOLD18','TOMAN'];const copy=[...order];validateCurrencyOrder(order,known);assert.deepEqual(order,copy)});
