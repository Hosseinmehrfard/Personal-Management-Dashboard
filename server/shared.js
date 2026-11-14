// Shared-expense ledger. All writes are tenant-scoped and transactionally atomic.
const cents=value=>{
 const s=String(value);
 if(!/^\d{1,18}(?:\.\d{1,2})?$/.test(s))throw Error('مبلغ نامعتبر است');
 const [whole,fraction='']=s.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
};
const decimal=value=>(value/100n).toString()+'.'+String(value%100n).padStart(2,'0');
export function allocateShares(total,ids,weights=null){
 const amount=cents(total);
 if(!ids.length||ids.length>60||new Set(ids).size!==ids.length)throw Error('اعضای تقسیم‌بندی نامعتبرند');
 const w=weights??ids.map(()=>1);
 if(w.length!==ids.length||w.some(x=>!Number.isSafeInteger(Number(x))||Number(x)<=0||Number(x)>1000000))throw Error('وزن سهم نامعتبر است');
 const sum=w.reduce((a,b)=>a+BigInt(Number(b)),0n);
 let distributed=0n;
 return ids.map((id,i)=>{
  const share=i===ids.length-1?amount-distributed:(amount*BigInt(Number(w[i])))/sum;
  distributed+=share;
  return {member_id:id,amount:decimal(share)};
 });
}
export function settlementPlan(members,expenses,shares,settlements){
 const balances=new Map(members.map(m=>[m.id,0n]));
 for(const e of expenses)if(balances.has(e.payer_id))balances.set(e.payer_id,balances.get(e.payer_id)+cents(e.amount));
 for(const s of shares)if(balances.has(s.member_id))balances.set(s.member_id,balances.get(s.member_id)-cents(s.amount));
 for(const s of settlements){
  if(balances.has(s.from_member_id))balances.set(s.from_member_id,balances.get(s.from_member_id)+cents(s.amount));
  if(balances.has(s.to_member_id))balances.set(s.to_member_id,balances.get(s.to_member_id)-cents(s.amount));
 }
 const owes=[...balances].filter(([,n])=>n<0n).map(([id,n])=>({id,amount:-n}));
 const earns=[...balances].filter(([,n])=>n>0n).map(([id,n])=>({id,amount:n}));
 const plan=[];let i=0,j=0;
 while(i<owes.length&&j<earns.length){
  const amt=owes[i].amount<earns[j].amount?owes[i].amount:earns[j].amount;
  if(amt>0n)plan.push({from_member_id:owes[i].id,to_member_id:earns[j].id,amount:decimal(amt)});
  owes[i].amount-=amt;earns[j].amount-=amt;
  if(owes[i].amount===0n)i++;if(earns[j].amount===0n)j++;
 }
 return {balances:[...balances].map(([id,n])=>({id,amount:(n<0n?'-':'')+decimal(n<0n?-n:n)})),plan};
}
export function registerSharedRoutes(app,{wrap,fail,tx,query,randomUUID,logActivity,idOf,val,dateOf,ledgerAmount,amountInCents}){
 const owner=req=>req.session.user_id;
 const group=async(c,id,user)=>{
  const r=await c.query('SELECT id FROM shared_groups WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,user]);
  if(!r.rowCount)fail('گروه همخرج پیدا نشد',404);
 };
 const member=async(c,id,groupId,user)=>{
  const r=await c.query('SELECT id FROM shared_members WHERE id=$1 AND group_id=$2 AND user_id=$3',[id,groupId,user]);
  if(!r.rowCount)fail('عضو این گروه پیدا نشد',404);
 };
 app.post('/api/shared/groups',wrap(async(req,res)=>{
  const title=val(req.body?.title,160,true),description=val(req.body?.description,1000),id=randomUUID();
  await query('INSERT INTO shared_groups(id,user_id,title,description) VALUES($1,$2,$3,$4)',[id,owner(req),title,description]);
  res.status(201).json({id,title,description});
 }));
 app.put('/api/shared/groups/:id',wrap(async(req,res)=>{
  const id=idOf(req.params.id),title=val(req.body?.title,160,true),description=val(req.body?.description,1000);
  const r=await query('UPDATE shared_groups SET title=$1,description=$2 WHERE id=$3 AND user_id=$4 RETURNING *',[title,description,id,owner(req)]);
  if(!r.rowCount)fail('گروه پیدا نشد',404);res.json(r.rows[0]);
 }));
 app.delete('/api/shared/groups/:id',wrap(async(req,res)=>{
  const id=idOf(req.params.id),user=owner(req);
  await tx(async c=>{
   await group(c,id,user);
   await c.query('DELETE FROM shared_shares WHERE user_id=$1 AND expense_id IN(SELECT id FROM shared_expenses WHERE group_id=$2 AND user_id=$1)',[user,id]);
   await c.query('DELETE FROM shared_settlements WHERE group_id=$1 AND user_id=$2',[id,user]);
   await c.query('DELETE FROM shared_expenses WHERE group_id=$1 AND user_id=$2',[id,user]);
   await c.query('DELETE FROM shared_members WHERE group_id=$1 AND user_id=$2',[id,user]);
   await c.query('DELETE FROM shared_groups WHERE id=$1 AND user_id=$2',[id,user]);
  });res.json({ok:true});
 }));
 app.post('/api/shared/groups/:id/members',wrap(async(req,res)=>{
  const groupId=idOf(req.params.id),name=val(req.body?.name,120,true),user=owner(req),id=randomUUID();
  await tx(async c=>{
   await group(c,groupId,user);
   const count=await c.query('SELECT count(*)::integer AS n FROM shared_members WHERE group_id=$1 AND user_id=$2',[groupId,user]);
   if(count.rows[0].n>=60)fail('حداکثر ۶۰ عضو مجاز است');
   await c.query('INSERT INTO shared_members(id,user_id,group_id,name) VALUES($1,$2,$3,$4)',[id,user,groupId,name]);
  });res.status(201).json({id,name,group_id:groupId});
 }));
 app.delete('/api/shared/members/:id',wrap(async(req,res)=>{
  const id=idOf(req.params.id),user=owner(req);
  const r=await query('DELETE FROM shared_members WHERE id=$1 AND user_id=$2 RETURNING id',[id,user]);
  if(!r.rowCount)fail('عضو قابل حذف نیست',404);res.json({ok:true});
 }));
 app.post('/api/shared/groups/:id/expenses',wrap(async(req,res)=>{
  const groupId=idOf(req.params.id),user=owner(req),title=val(req.body?.title,180,true),payer=idOf(req.body?.payer_id),amount=ledgerAmount(req.body?.amount),date=dateOf(req.body?.date)||fail('تاریخ ضروری است'),notes=val(req.body?.notes,1000),expenseId=randomUUID();
  if(amountInCents(amount)<=0n)fail('مبلغ هزینه باید مثبت باشد');
  const memberIds=req.body?.member_ids;
  if(!Array.isArray(memberIds)||memberIds.length===0||memberIds.length>60)fail('اعضای تقسیم هزینه را انتخاب کنید');
  const ids=memberIds.map(idOf),weights=req.body?.weights??null;
  const portions=allocateShares(amount,ids,weights);
  await tx(async c=>{
   await group(c,groupId,user);await member(c,payer,groupId,user);
   for(const id of ids)await member(c,id,groupId,user);
   await c.query('INSERT INTO shared_expenses(id,user_id,group_id,title,payer_id,amount,date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[expenseId,user,groupId,title,payer,amount,date,notes]);
   for(const s of portions)await c.query('INSERT INTO shared_shares(id,user_id,expense_id,member_id,amount) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user,expenseId,s.member_id,s.amount]);
   await logActivity(c,'هزینه همخرج '+title,'finance',user);
  });res.status(201).json({id:expenseId});
 }));
 app.delete('/api/shared/expenses/:id',wrap(async(req,res)=>{
  const id=idOf(req.params.id),user=owner(req);
  await tx(async c=>{
   const r=await c.query('DELETE FROM shared_expenses WHERE id=$1 AND user_id=$2 RETURNING id',[id,user]);
   if(!r.rowCount)fail('هزینه پیدا نشد',404);
  });res.json({ok:true});
 }));
 app.post('/api/shared/groups/:id/settlements',wrap(async(req,res)=>{
  const groupId=idOf(req.params.id),user=owner(req),from=idOf(req.body?.from_member_id),to=idOf(req.body?.to_member_id),amount=ledgerAmount(req.body?.amount),date=dateOf(req.body?.date)||fail('تاریخ ضروری است'),notes=val(req.body?.notes,1000),id=randomUUID();
  if(from===to||amountInCents(amount)<=0n)fail('اطلاعات تسویه نامعتبر است');
  await tx(async c=>{
   await group(c,groupId,user);await member(c,from,groupId,user);await member(c,to,groupId,user);
   const [members,expenses,shares,paid]=await Promise.all([
    c.query('SELECT id FROM shared_members WHERE group_id=$1 AND user_id=$2',[groupId,user]),
    c.query('SELECT id,payer_id,amount FROM shared_expenses WHERE group_id=$1 AND user_id=$2',[groupId,user]),
    c.query('SELECT s.member_id,s.amount FROM shared_shares s JOIN shared_expenses e ON e.id=s.expense_id WHERE e.group_id=$1 AND s.user_id=$2',[groupId,user]),
    c.query('SELECT from_member_id,to_member_id,amount FROM shared_settlements WHERE group_id=$1 AND user_id=$2',[groupId,user])
   ]);
   const current=settlementPlan(members.rows,expenses.rows,shares.rows,paid.rows);
   const fromBalance=current.balances.find(x=>x.id===from)?.amount;
   const toBalance=current.balances.find(x=>x.id===to)?.amount;
   if(!fromBalance||!toBalance||!fromBalance.startsWith('-')||toBalance.startsWith('-')||amountInCents(amount)>amountInCents(fromBalance.slice(1))||amountInCents(amount)>amountInCents(toBalance))fail('مبلغ تسویه بیش از طلب یا بدهی فعلی اعضا است');
   await c.query('INSERT INTO shared_settlements(id,user_id,group_id,from_member_id,to_member_id,amount,date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,user,groupId,from,to,amount,date,notes]);
   await logActivity(c,'ثبت تسویه همخرج','finance',user);
  });res.status(201).json({id});
 }));
 app.delete('/api/shared/settlements/:id',wrap(async(req,res)=>{
  const r=await query('DELETE FROM shared_settlements WHERE id=$1 AND user_id=$2 RETURNING id',[idOf(req.params.id),owner(req)]);
  if(!r.rowCount)fail('تسویه پیدا نشد',404);res.json({ok:true});
 }));
 app.post('/api/personal_balances/:id/settle',wrap(async(req,res)=>{
  const id=idOf(req.params.id),user=owner(req),amount=ledgerAmount(req.body?.amount),date=dateOf(req.body?.date)||fail('تاریخ ضروری است'),notes=val(req.body?.notes,1000),paymentId=randomUUID();
  if(amountInCents(amount)<=0n)fail('مبلغ تسویه باید مثبت باشد');
  await tx(async c=>{
   const bal=(await c.query('SELECT total,settled FROM personal_balances WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,user])).rows[0];
   if(!bal)fail('بدهی یا طلب پیدا نشد',404);
   if(amountInCents(amount)>amountInCents(bal.total)-amountInCents(bal.settled))fail('مبلغ بیشتر از مانده است');
   await c.query('UPDATE personal_balances SET settled=settled+$1 WHERE id=$2 AND user_id=$3',[amount,id,user]);
   await c.query('INSERT INTO personal_payments(id,user_id,balance_id,amount,date,notes) VALUES($1,$2,$3,$4,$5,$6)',[paymentId,user,id,amount,date,notes]);
   await logActivity(c,'ثبت تسویه بدهی یا طلب به مبلغ '+amount,'finance',user);
  });res.status(201).json({id:paymentId});
 }));
}
