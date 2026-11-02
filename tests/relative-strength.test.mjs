import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {compareStrength,latestStrength,COMPARISON_VERSION} from '../integrations/relative-strength.mjs';

const dates=[];
for(let t=Date.UTC(2026,5,1);dates.length<65;t+=86400000){const d=new Date(t);if(d.getUTCDay()%6)dates.push(d.toISOString().slice(0,10))}
function fixture(){
 const raw={},rows=[];
 for(const [i,code] of ['AA','BB','CC','DD','EE','FF','GG','HH'].entries()){
  const side=i<4?1:-1;let price=100;
  const prices=dates.map((date,j)=>{price*=Math.exp(side*.01+.012*Math.sin(j*(i+1)*.83)+.003*Math.cos(j*1.37+i));return{date,open:price,high:price+1,low:price-1,close:price}});
  raw[code+'2611']=prices;rows.push({code,name:code,main_contract:code+'2611',ok:true,market_current:true,data_date:dates.at(-1),previous_day_date:dates.at(-2),sector:'能源化工',modes:{'week-day':'未纳入'},latest_bar:{close:price},day_ma10:100+side,previous_day_ma10:100,day_low:80+side,previous_day_low:80,day_high:120+side,previous_day_high:120,volume:20001,open_interest:20001});
 }
 return {scan:{data_date:dates.at(-1),rule_version:'unchanged',rows},raw};
}
function rename(f,index,code){const r=f.scan.rows[index],old=r.main_contract;r.code=r.name=code;r.main_contract=code+'2611';f.raw[r.main_contract]=f.raw[old];delete f.raw[old]}
const run=f=>compareStrength(f.scan,f.raw);
function samePrices(f,a,b){const ra=f.scan.rows[a],rb=f.scan.rows[b];f.raw[rb.main_contract]=structuredClone(f.raw[ra.main_contract]);rb.latest_bar.close=ra.latest_bar.close}

test('日K池独立于周日池，每方向3个，同板块可入选且输入不修改',()=>{
 const f=fixture(),before=JSON.stringify(f),d=run(f);
 assert.equal(d.version,COMPARISON_VERSION);assert.equal(d.selectionPolicy.sourceMode,'day-trend');
 assert.equal(d.selectedLongs.length,3);assert.equal(d.selectedShorts.length,3);assert.equal(d.pairs.length,3);
 assert.equal(new Set(d.slots.flatMap(s=>[s.long.code,s.short.code])).size,6);
 assert.ok(new Set(d.selectedLongs.map(r=>r.sector)).size<3);
 assert.equal(JSON.stringify(f),before);assert.equal(d.relationships.length,15);
 assert.ok(d.selectedLongs.every(r=>r.trendConfirmed));assert.ok(d.selectedShorts.every(r=>r.trendConfirmed));
});
test('收益按同合约共同交易日，20日效率和波动均可复算',()=>{
 const f=fixture(),d=run(f),a=d.longs.find(x=>x.code==='AA'),bars=f.raw.AA2611;
 assert.equal(a.return3,bars.at(-1).close/bars.at(-4).close-1);
 assert.equal(a.return5,bars.at(-1).close/bars.at(-6).close-1);
 assert.equal(a.return20,bars.at(-1).close/bars.at(-21).close-1);
 const rs=bars.slice(-20).map((b,i)=>Math.log(b.close/bars.at(-21+i).close));
 assert.ok(Math.abs(a.efficiency20-rs.reduce((s,v)=>s+v,0)/rs.reduce((s,v)=>s+Math.abs(v),0))<1e-12);
 const avg=rs.reduce((s,v)=>s+v,0)/20;
 assert.ok(Math.abs(a.volatility20-Math.sqrt(rs.reduce((s,v)=>s+(v-avg)**2,0)/20))<1e-12);
 assert.ok(a.adverse20>=0);assert.ok(a.comparisonScore>=0&&a.comparisonScore<=1);assert.equal(a.winProbability,undefined);
});
test('国债各期限只留一个，原油燃油链只留一个，不依赖错写的板块',()=>{
 const f=fixture();['T','TF','TS','TL','SC','FU','LU','PG'].forEach((c,i)=>rename(f,i,c));
 const d=run(f);assert.equal(d.selectedLongs.length,1);assert.equal(d.selectedShorts.length,1);
 assert.equal(d.selectionSkipped.filter(x=>x.reason.includes('仅保留龙头')).length,6);
 assert.deepEqual(d.missing,{long:2,short:2});
});
test('跨板块也剔除同向高度相关品种，替补到3个',()=>{
 const f=fixture();samePrices(f,0,1);f.scan.rows[1].sector='农产品';
 const d=run(f),selected=d.selectedLongs.map(x=>x.code);
 assert.equal(selected.length,3);assert.ok(!(selected.includes('AA')&&selected.includes('BB')));
 const skip=d.selectionSkipped.find(x=>x.reason.includes('高度同向相关'));
 assert.ok(skip);assert.ok(skip.correlations.short.value>=.8);
});
test('单侧不足不隐藏另一侧候选，空位仍保留三个',()=>{
 const f=fixture();['T','TF','TS','TL'].forEach((c,i)=>rename(f,i,c));const d=run(f);
 assert.equal(d.selectedLongs.length,1);assert.equal(d.selectedShorts.length,3);assert.equal(d.slots.length,3);
 assert.equal(d.slots.filter(s=>s.short).length,3);assert.equal(d.pairs.length,1);assert.equal(d.status,'partial');
});
test('近5/20日逆向者可查，但不冒充持续龙头',()=>{
 const f=fixture();const r=f.scan.rows[7];r.day_ma10=101;r.day_low=81;
 const d=run(f),item=d.longs.find(x=>x.code==='HH');assert.equal(item.trendConfirmed,false);
 assert.ok(!d.selectedLongs.some(x=>x.code==='HH'));assert.match(d.selectionSkipped.find(x=>x.code==='HH').reason,/未同时/);
});
test('陈旧、收盘不一致、20日缺口、原日K未通过不以其他模式补位',()=>{
 const f=fixture();f.scan.rows[0].day_low=79;f.scan.rows[0].modes['week-day']='多头观察';
 f.scan.rows[1].data_date=dates.at(-2);f.raw.CC2611.splice(-12,1);f.scan.rows[3].latest_bar.close++;
 const d=run(f);assert.equal(d.selectedLongs.length,0);assert.equal(d.selectedShorts.length,3);
 assert.equal(d.excluded.length,2);assert.equal(d.missing.long,3);
});
test('严格1万手、MA10走平、日K高低点持平不纳入',()=>{
 for(const patch of [{volume:10000},{open_interest:10000},{day_ma10:100},{day_low:80}]){
  const f=fixture();Object.assign(f.scan.rows[0],patch);assert.ok(!run(f).longs.some(x=>x.code==='AA'));
 }
});
test('时间戳和未排序日线正常解析，未来数据忽略，重复日期失败',()=>{
 const f=fixture(),first=run(f);f.raw.AA2611=f.raw.AA2611.map(b=>({...b,date:b.date+'T00:00:00.000'})).reverse();
 assert.equal(run(f).inputHash,first.inputHash);
 f.raw.AA2611.push({date:'2099-01-01',open:999,high:999,low:999,close:999});assert.equal(run(f).inputHash,first.inputHash);
 f.raw.AA2611.push(f.raw.AA2611[0]);assert.match(run(f).excluded.find(x=>x.code==='AA').reason,/日期重复/);
});
test('数据、规则和风险分类变化产生新快照',()=>{
 const f=fixture(),first=run(f);f.raw.AA2611[2].close+=.5;assert.notEqual(run(f).inputHash,first.inputHash);
 const again=run(f);f.scan.rule_version='new';assert.notEqual(run(f).inputHash,again.inputHash);
 const third=run(f);rename(f,0,'T');assert.notEqual(run(f).inputHash,third.inputHash);
});
test('多空相关符号保留，不伪称已风险中性',()=>{
 const d=run(fixture());assert.ok(d.relationships.some(r=>r.a.side!==r.b.side));
 for(const r of d.relationships){if(r.value!==null)assert.equal(r.directionalValue,r.value*(r.a.side===r.b.side?1:-1))}
 assert.match(d.boundary,/不等于风险中性/);assert.match(d.method,/未经收益回测/);
});
test('价格同比例放大不改变排名',()=>{
 const f=fixture(),before=run(f);for(const b of f.raw.AA2611)for(const k of ['open','high','low','close'])b[k]*=10;f.scan.rows[0].latest_bar.close*=10;
 const after=run(f);assert.deepEqual(after.selectedLongs.map(r=>r.code),before.selectedLongs.map(r=>r.code));
 assert.ok(Math.abs(after.longs.find(r=>r.code==='AA').efficiency20-before.longs.find(r=>r.code==='AA').efficiency20)<1e-12);
});
test('长期高相关不能被近期暂时脱钩掩盖',()=>{
 const f=fixture();
 for(const index of [0,1]){
  let price=100;
  f.raw[f.scan.rows[index].main_contract]=dates.map((date,j)=>{
   const shock=j<45?.07*Math.sin(j*1.3):.002*Math.sin(j*(index+1)*.83);
   price*=Math.exp(.004+shock);return{date,open:price,high:price+1,low:price-1,close:price};
  });f.scan.rows[index].latest_bar.close=price;
 }
 const d=run(f),skip=d.selectionSkipped.find(x=>['AA','BB'].includes(x.code)&&x.correlations?.long.value>=.8);
 assert.ok(skip);assert.ok(skip.correlations.short.value<.8);assert.match(skip.reason,/高度同向/);
});
test('常量收益相关性未知不按零相关处理；空池保持空位',()=>{
 const f=fixture();for(const row of f.scan.rows){let p=100;f.raw[row.main_contract]=dates.map(date=>{p*=row.day_ma10>100?2:.5;return{date,open:p,high:p*1.01,low:p*.99,close:p}});row.latest_bar.close=p}
 const d=run(f);assert.equal(d.selectedLongs.length,1);assert.equal(d.selectedShorts.length,1);
 assert.ok(d.selectionSkipped.some(x=>x.reason.includes('相关性数据不足')));
 const empty=compareStrength({data_date:dates.at(-1),rows:[]},{});assert.equal(empty.slots.length,3);assert.equal(empty.pairs.length,0);assert.deepEqual(empty.missing,{long:3,short:3});
});
test('同方向重复品种只计一次，多头收盘回撤按峰值分母计算',()=>{
 const f=fixture();f.scan.rows.push(structuredClone(f.scan.rows[0]));const d=run(f);
 assert.equal(d.longs.filter(r=>r.code==='AA').length,1);assert.ok(d.excluded.some(r=>r.reason.includes('重复')));
 let peak=0,max=0;for(const b of f.raw.AA2611.slice(-21)){peak=Math.max(peak,b.close);max=Math.max(max,1-b.close/peak)}
 assert.ok(Math.abs(d.longs.find(r=>r.code==='AA').adverse20-max)<1e-12);
});
test('重启读取同版本快照，旧快照保留，新数据另存',async()=>{
 const f=fixture();await mkdir(resolve('.runtime/tests'),{recursive:true});const root=await mkdtemp(resolve('.runtime/tests/strength-'));
 await mkdir(resolve(root,'.runtime/fire-scan/contract-bars'),{recursive:true});
 for(const [contract,bars] of Object.entries(f.raw))await writeFile(resolve(root,'.runtime/fire-scan/contract-bars',contract+'.json'),JSON.stringify(bars));
 const first=await latestStrength(f.scan,{root}),second=await latestStrength(f.scan,{root});assert.deepEqual(second,JSON.parse(JSON.stringify(first)));
 const folder=resolve(root,'.runtime/relative-strength'),old=(await readdir(folder))[0],oldContent=await readFile(resolve(folder,old),'utf8');
 f.scan.rule_version='new';await latestStrength(f.scan,{root});assert.equal((await readdir(folder)).length,2);assert.equal(await readFile(resolve(folder,old),'utf8'),oldContent);
});
