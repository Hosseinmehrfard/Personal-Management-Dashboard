import test from 'node:test';
import assert from 'node:assert/strict';
import {persianParts,toIsoJalali,formatJalali,daysInMonth,changeMonth,weekPosition,todayInTehran} from '../src/jalali.js';
import {ownerClause,requireOwnedTable,canManageGlobal,canAccessRow,currencyVisible} from '../server/tenancy.js';
import {validateGithubRepo,githubStatus} from '../server/updates.js';

test('Jalali date roundtrip for common dates and Gregorian New Year',()=>{
 const dates=['2020-03-20','2021-03-21','2024-03-20','2026-11-11','2027-03-20'];
 for(const iso of dates){const p=persianParts(iso);assert.equal(toIsoJalali(p.year,p.month,p.day),iso)}
 assert.deepEqual(persianParts('2026-11-11'),{year:1405,month:8,day:20});
 assert.equal(formatJalali('2026-11-11'),'۱۴۰۵/۰۸/۲۰');
});
test('Jalali leap Esfand and invalid calendar dates',()=>{
 assert.equal(daysInMonth(1399,12),30);assert.equal(daysInMonth(1400,12),29);
 assert.equal(toIsoJalali(1400,12,30),null);
 assert.equal(toIsoJalali(1405,7,31),null);
 assert.equal(toIsoJalali(1405,1,31),'2026-04-20');
});
test('Persian calendar navigation uses twelve-month wrap',()=>{
 assert.deepEqual(changeMonth(1405,12,1),{year:1406,month:1});
 assert.deepEqual(changeMonth(1405,1,-1),{year:1404,month:12});
 assert.ok(weekPosition('2026-11-11')>=0&&weekPosition('2026-11-11')<=6);
});
test('Tenant-scoped query helpers enforce owning workspace',()=>{
 assert.deepEqual(ownerClause('tasks','user-001'),{sql:'user_id=$1',args:['user-001']});
 assert.equal(ownerClause('classes','u-2',3).sql,'user_id=$3');
 assert.throws(()=>requireOwnedTable('currencies'));
 assert.throws(()=>ownerClause('users','x'));
 assert.equal(canAccessRow({user_id:'user-a'},'user-b'),false);
 assert.equal(canAccessRow({user_id:'user-a'},'user-a'),true);
 assert.equal(canManageGlobal('user'),false);assert.equal(canManageGlobal('admin'),true);
});
test('Currency visibility is per account and defaults to visible',()=>{
 assert.equal(currencyVisible(undefined),true);assert.equal(currencyVisible(null),true);
 assert.equal(currencyVisible(false),false);
});
test('GitHub dispatch target is limited to a path-form repository',()=>{
 assert.equal(validateGithubRepo('Hosseinmehrfard/Personal-Management-Dashboard'),'Hosseinmehrfard/Personal-Management-Dashboard');
 for(const bad of ['https://github.com/a/b','x/y/../z','x/..','x/y?token=x','x//y','x/y\nZ','',null])assert.throws(()=>validateGithubRepo(bad));
});


test('calendar day rolls over at Tehran midnight',()=>{
 assert.equal(todayInTehran(new Date('2026-03-20T20:29:59Z')),'2026-03-20');
 assert.equal(todayInTehran(new Date('2026-03-20T20:30:00Z')),'2026-03-21');
});

test('update availability uses the installed revision and the current main ref',async t=>{
 const previous='a'.repeat(40),latest='b'.repeat(40);
 t.mock.method(globalThis,'fetch',async url=>{
  if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:latest}});
  assert.match(url,/deploy\.yml\/runs\?branch=main&per_page=1$/);
  return Response.json({workflow_runs:[{id:5,head_sha:previous,status:'completed',conclusion:'success'}]});
 });
 assert.equal((await githubStatus('owner/repo','test',previous)).available,true);
 assert.equal((await githubStatus('owner/repo','test',latest)).available,false);
 assert.equal((await githubStatus('owner/repo','test',null)).available,false);
});
