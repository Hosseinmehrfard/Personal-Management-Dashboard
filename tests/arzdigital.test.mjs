import test from 'node:test';
import assert from 'node:assert/strict';
import {validateArzdigitalEndpoint,validateArzdigitalConfig,parseArzdigitalRates} from '../server/arzdigital.js';
const cfg={enabled:true,endpoint:'https://api.arzdigital.com/prices',rootPath:'data',priceField:'price',codeField:'symbol',unit:'TOMAN',refreshHours:8,authStyle:'bearer'};
test('only HTTPS official ArzDigital API hosts and no URL secrets',()=>{
 assert.equal(validateArzdigitalEndpoint(cfg.endpoint),cfg.endpoint);
 for(const url of ['https://api.arzdigital.com.evil.test/prices','http://api.arzdigital.com/prices','https://localhost/','https://127.0.0.1/a','https://api.arzdigital.com/a?api_key=SECRET','https://user:pass@api.arzdigital.com/a','https://arzdigital.com/a'])assert.throws(()=>validateArzdigitalEndpoint(url));
});
test('config rejects invalid unit, intervals and JSON paths',()=>{
 assert.deepEqual(validateArzdigitalConfig(cfg).enabled,true);
 assert.throws(()=>validateArzdigitalConfig({...cfg,unit:'USD'}));
 assert.throws(()=>validateArzdigitalConfig({...cfg,refreshHours:0}));
 assert.throws(()=>validateArzdigitalConfig({...cfg,rootPath:'__proto__.x'}),/./); // schema refuses unsafe paths via explicit validation later
 assert.throws(()=>validateArzdigitalConfig({...cfg,enabled:true,endpoint:''}));
});
test('map-based JSON with TOMAN rates',()=>{
 const data={data:{USD:{price:100000},USDT:{price:100200}}};
 assert.deepEqual(parseArzdigitalRates(data,cfg,[{code:'USD'},{code:'USDT'},{code:'EUR'}]),[{code:'USD',price:100000},{code:'USDT',price:100200}]);
});
test('array response, currency alias, IRR to TOMAN conversion',()=>{
 const config={...cfg,rootPath:'result.quotes',codeField:'ticker',priceField:'values.last',unit:'RIAL'};
 const rows={result:{quotes:[{ticker:'XBT',values:{last:1200000000}},{ticker:'ETH',values:{last:300000000}}]}};
 assert.deepEqual(parseArzdigitalRates(rows,config,[{code:'BTC',arzdigital_code:'XBT'},{code:'ETH'}]),[{code:'BTC',price:120000000},{code:'ETH',price:30000000}]);
});
test('invalid or missing rate data fails closed, TOMAN is never overwritten',()=>{
 assert.throws(()=>parseArzdigitalRates({data:{USD:{price:'bad'}}},cfg,[{code:'USD'}]));
 assert.throws(()=>parseArzdigitalRates({wrong:{}},cfg,[{code:'USD'}]));
 assert.deepEqual(parseArzdigitalRates({data:{TOMAN:{price:0.8},USD:{price:50000}}},cfg,[{code:'TOMAN'},{code:'USD'}]),[{code:'USD',price:50000}]);
});
