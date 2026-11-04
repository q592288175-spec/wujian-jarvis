import test from 'node:test';
import assert from 'node:assert/strict';
import {feeRefreshDue,preferredFeeRows} from '../integrations/fee-refresh.mjs';
import {feeAmount} from '../integrations/market-panorama.mjs';
import {createPanorama} from '../integrations/market-panorama.mjs';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('费用每日按北京时间检查；成功当天不重复，失败小时重试',()=>{
 const at=new Date('2026-11-03T17:00:00Z');
 assert.equal(feeRefreshDue(null,at),true);
 assert.equal(feeRefreshDue({status:'ok',checkedAt:'2026-11-03T23:59:59+08:00'},at),true);
 assert.equal(feeRefreshDue({status:'ok',checkedAt:'2026-11-04T00:00:00+08:00'},at),false);
 assert.equal(feeRefreshDue({status:'failed',checkedAt:'2026-11-04T00:59:00+08:00'},at),false);
 assert.equal(feeRefreshDue({status:'failed',checkedAt:'2026-11-04T00:00:00+08:00'},at),true);
});
test('交易星球优先、每个具体合约只有一条，备用不冒充新来源',()=>{
 const old={key:'FU2701',kind:'fee',source:'OpenCTP'},primary={key:'FU2701',kind:'fee-jiaoyixingqiu',source:'交易星球'},other={key:'FU2705',kind:'fee',source:'OpenCTP'};
 assert.deepEqual(preferredFeeRows([old,primary,other]),[primary,other]);
 assert.deepEqual(preferredFeeRows([primary,old,other]),[primary,other]);
});
test('手续费按原始费率计算，平今为零保留，缺少点值不造金额',()=>{
 const row={'手续费标准-开仓-万分之':.5,'手续费标准-平今-万分之':0,'手续费标准-平昨-元':3};
 assert.equal(feeAmount(row,'开仓',4774,10),2.387);
 assert.equal(feeAmount(row,'平今',4774,10),0);
 assert.equal(feeAmount(row,'平昨',4774,10),3);
 assert.equal(feeAmount(row,'开仓',4774,null),null);
});
test('费用快照接入真实来源字段、主力合约保持不变，历史不借用未来采集',async()=>{
 const dir=resolve('output/fee-tests');await mkdir(dir,{recursive:true});const root=await mkdtemp(join(dir,'read-'));
 await mkdir(join(root,'data'));await writeFile(join(root,'data/contract-specs.json'),JSON.stringify({products:{FU:{pointValue:10,tickSize:1}}}));
 const app=createPanorama({root,folder:join(root,'panorama'),getFire:async()=>({rows:[{code:'FU',name:'燃料油',exchange:'SHFE',main_contract:'FU2701'}]})});
 let db;try{
  await app.init();db=new DatabaseSync(join(root,'panorama/market.sqlite'));
  for(const day of ['2026-11-03','2026-11-04'])db.prepare('INSERT INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('FU','FU0','1d',day,day,4700,4800,4600,4774,50000,50000,'fixture',1);
  const save=(kind,day,row)=>db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run(kind,'FU2701',day,JSON.stringify(row),kind==='fee'?'OpenCTP':'交易星球',day);
  save('fee','2026-11-03',{'合约代码':'FU2701','费用来源类型':'OpenCTP账户参考','1手开仓费用':9,'现价':4774});
  save('fee-jiaoyixingqiu','2026-11-04',{'合约代码':'FU2701','现价':4774,'手续费标准-开仓-万分之':.5,'手续费标准-平今-万分之':0,'手续费标准-平昨-元':3,'手续费更新时间':'2026-11-03 22:59:49'});
  const current=(await app.snapshot('2026-11-04')).products[0];assert.equal(current.contract,'FU2701');assert.equal(current.fees.length,1);assert.equal(current.fees[0].source,'交易星球');assert.equal(current.fees[0].open,2.387);assert.equal(current.fees[0].today,0);
  const history=(await app.snapshot('2026-11-03')).products[0];assert.equal(history.fees[0].source,'OpenCTP');assert.equal(history.fees[0].open,9);
 }finally{db?.close();app.stop()}
});
