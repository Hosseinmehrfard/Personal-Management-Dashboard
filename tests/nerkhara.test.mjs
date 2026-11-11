import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRateSource,validateNerkharaId,parseNerkharaRates,getNerkharaQuotes} from '../server/nerkhara.js';
const NOW=Date.parse('2026-11-11T12:00:00Z');
const mk=(id,price,unit='IRT',extras={})=>({id,price,unit,stale:false,updated_utc:'2026-11-11T11:55:00',...extras});
const payload=items=>({api:'nerkhara/v1',generated_utc:'2026-11-11T12:00:00',items});
const currencies=[{code:'USD'},{code:'EUR'},{code:'USDT'},{code:'GOLD18'},{code:'BTC'},{code:'XAU',nerkhara_id:'xau'}];
const parse=items=>parseNerkharaRates(payload(items),currencies,{now:NOW});
test('IRT values are already toman, never divided by ten',()=>{
 const quotes=parse([mk('usd',258950),mk('eur',298500),mk('gold-18k',25350000)]);
 assert.equal(quotes.find(x=>x.code==='USD').price,258950);
 assert.equal(quotes.find(x=>x.code==='GOLD18').price,25350000);
 assert.equal(quotes.find(x=>x.code==='EUR').unit,'TOMAN');
 assert.equal(quotes[0].quotedAt,'2026-11-11T11:55:00.000Z');
});
test('USD/USDT quotes convert using fresh same-response exchange rate',()=>{
 const quotes=parse([mk('usd',258950),mk('usdt',259500),mk('btc',73000,'USDT'),mk('xau',4100,'USD')]);
 assert.equal(quotes.find(x=>x.code==='BTC').price,73000*259500);
 assert.equal(quotes.find(x=>x.code==='XAU').price,4100*258950);
});
test('price_irt takes precedence over synthetic crypto conversion',()=>{
 const quotes=parse([mk('usd',258950),mk('usdt',259500),mk('btc',73000,'USDT',{price_irt:18_750_000_000})]);
 assert.equal(quotes.find(x=>x.code==='BTC').price,18_750_000_000);
});
test('missing/old/stale bases cannot produce synthetic toman rates',()=>{
 const quotes=parse([mk('usd',258950,'IRT',{stale:true}),mk('usdt',259500,'IRT',{updated_utc:'2026-11-09T00:00:00'}),mk('btc',73000,'USDT'),mk('eur',300000,'IRT',{updated_utc:'2026-11-11T13:00:00'})]);
 assert.deepEqual(quotes,[]);
});
test('bad values and out of range timestamps are rejected',()=>{
 assert.deepEqual(parse([mk('usd','NaN'),mk('eur',-5),mk('btc',Infinity,'USDT')]),[]);
 assert.throws(()=>parseNerkharaRates({api:'wrong',items:[]},currencies,{now:NOW}));
 assert.throws(()=>parseNerkharaRates(payload({}),currencies,{now:NOW}));
});
test('matching custom symbols and IDs; no stray assets',()=>{
 const x=parseNerkharaRates(payload([mk('chf',300100),mk('gold-24k',40000000)]),[{code:'CHF'},{code:'GOLD24'}],{now:NOW});
 assert.deepEqual(x.map(i=>i.code),['CHF','GOLD24']);
});
test('source selection and ID are validated',()=>{
 assert.deepEqual(validateRateSource({selected:'nerkhara',refreshMinutes:15}),{selected:'nerkhara',refreshMinutes:15});
 for(const x of ['local','javascript',''])assert.throws(()=>validateRateSource({selected:x}));
 assert.throws(()=>validateRateSource({selected:'nerkhara',refreshMinutes:5}));
 for(const x of ['../../metadata','https://bad.local/','BTC','a?b','a'.repeat(50)])assert.throws(()=>validateNerkharaId(x));
 assert.equal(validateNerkharaId('coin-emami'),'coin-emami');
});
test('fetch uses fixed official URL and rejects empty/unusable data',async()=>{
 const quoted=await getNerkharaQuotes({currencies:[{code:'USD'}],now:NOW,request:async (url,config)=>{
  assert.equal(url,'https://nerkhara.com/api/v1/latest.json');
  assert.equal(config.publicOnly,true);
  return {status:200,body:JSON.stringify(payload([mk('usd',258950)]))};
 }});
 assert.equal(quoted[0].price,258950);
 await assert.rejects(()=>getNerkharaQuotes({currencies:[{code:'USD'}],now:NOW,request:async()=>({status:429,body:'{}'})}));
});
