import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateShares,settlementPlan} from '../server/shared.js';
import {requireOwnedTable} from '../server/tenancy.js';

test('Equal shares distribute exact cents including the last cent',()=>{
 assert.deepEqual(allocateShares('100.00',['a','b','c']).map(x=>x.amount),['33.33','33.33','33.34']);
 assert.deepEqual(allocateShares('0.02',['a','b','c']).map(x=>x.amount),['0.00','0.00','0.02']);
});
test('Weighted shared costs are deterministic and conserved',()=>{
 const amounts=allocateShares('70.01',['a','b','c'],[2,3,2]);
 assert.deepEqual(amounts.map(x=>x.amount),['20.00','30.00','20.01']);
 assert.equal(amounts.reduce((a,x)=>a+Math.round(Number(x.amount)*100),0),7001);
 assert.throws(()=>allocateShares('1',['a','a']));
 assert.throws(()=>allocateShares('1',['a','b'],[1,0]));
});
test('Settlement plan handles expenses, credits and recorded settlements',()=>{
 const ms=[{id:'a'},{id:'b'},{id:'c'}];
 const ex=[{payer_id:'a',amount:'90.00'}];
 const sh=[{member_id:'a',amount:'30.00'},{member_id:'b',amount:'30.00'},{member_id:'c',amount:'30.00'}];
 let r=settlementPlan(ms,ex,sh,[]);
 assert.deepEqual(r.plan,[{from_member_id:'b',to_member_id:'a',amount:'30.00'},{from_member_id:'c',to_member_id:'a',amount:'30.00'}]);
 r=settlementPlan(ms,ex,sh,[{from_member_id:'b',to_member_id:'a',amount:'30.00'}]);
 assert.deepEqual(r.plan,[{from_member_id:'c',to_member_id:'a',amount:'30.00'}]);
});
test('New finance tables are scoped by user',()=>{
 for(const name of ['finance_contacts','finance_checks','finance_budgets','account_transfers','shared_expenses','personal_payments'])assert.equal(requireOwnedTable(name),name);
});
