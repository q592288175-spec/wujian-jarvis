import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fireCandidateQuality,fireStructure,sortFireCandidates,renderFireGroups,renderFireOverview,sortFireUniverse,fireDecisions,fireDisplaySector,fireStrengthTones} from '../dist/fire-display.js';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';

test('三模式多空都按指定板块顺序，强弱不打乱板块',()=>{
 const order=['IF','T','AU','CU','LC','I','FG','SH','C','JD','EC'];
 for(const mode of ['month-week','week-day','month-week-day']){
  const rows=order.toReversed().flatMap((code,i)=>[candidate(code,'空头观察',i+1),candidate(code,'多头观察',i+1)]);
  const displayOrder=['IF','T','AU','CU','LC','FG','I','SH','C','JD','EC'];
  assert.deepEqual(sortFireCandidates(rows,mode).map(r=>r.code),[...displayOrder,...displayOrder]);
 }
});

test('87品种显示分类全覆盖，拆分不改变全局八板块',()=>{
 const config=JSON.parse(readFileSync('../资料包/技能包/wujian-futures-multi-cycle-scan/config/products.json','utf8'));
 for(const row of config.products)assert.notEqual(fireDisplaySector(row).label,'待分类',row.code);
 assert.equal(fireDisplaySector({code:'IF'}).label,'股指');
 assert.equal(fireDisplaySector({main_contract:'TL2612'}).label,'国债');
 assert.equal(fireDisplaySector({code:'SA'}).label,'黑色系');
 assert.equal(fireDisplaySector({code:'JD'}).label,'农副产品');
});

test('多空分别按原技术力度染深中浅色，同分同色且缺数据不冒充弱',()=>{
 for(const mode of ['month-week','week-day','month-week-day']){
  const rows=['多头观察','空头观察'].flatMap(side=>[candidate(side+'强',side,4),candidate(side+'中',side,2),candidate(side+'弱',side,1)]);
  const tones=fireStrengthTones(rows,mode);
  assert.deepEqual(rows.map(r=>tones.get(r)),['strong','medium','weak','strong','medium','weak']);
  const same=[candidate('同一','多头观察',2),candidate('同二','多头观察',2)];
  assert.deepEqual([...fireStrengthTones(same,mode).values()],['medium','medium']);
  assert.equal(fireStrengthTones([{...rows[0],week_ma10:null}],mode).values().next().value,'unknown');
  const reversed=fireStrengthTones(rows.toReversed(),mode);
  for(const row of rows)assert.equal(reversed.get(row),tones.get(row));
 }
});

test('全部品种按专业板块排序，同板块稳定且不改原始数据',()=>{
 const rows=['M','EC','MA','FG','I','LC','CU','AU','IF','T'].map(code=>({code}));
 rows.push({code:'IH'},{code:'unknown'});
 const before=JSON.stringify(rows),sorted=sortFireUniverse(rows);
 assert.deepEqual(sorted.map(row=>row.code),['IF','IH','T','AU','CU','LC','FG','I','MA','M','EC','unknown']);
 assert.equal(JSON.stringify(rows),before);
 assert.equal(sorted.length,rows.length);
});

test('全部品种分别列出四种模式，多空和未纳入不互相覆盖',()=>{
 const row={modes:{'month-week':'空头观察','week-day':'未纳入','month-week-day':'多头观察'}};
 assert.deepEqual(fireDecisions(row,'week-day',true),[
  {cycle:'月周日',status:'多头观察',tone:'long'},
  {cycle:'月周',status:'空头观察',tone:'short'},
  {cycle:'周日',status:'未纳入',tone:'neutral'},
  {cycle:'日K顺势',status:'数据不足',tone:'neutral'}
 ]);
 assert.deepEqual(fireDecisions(row,'week-day'),[{cycle:'周日',status:'未纳入',tone:'neutral'}]);
 assert.ok(fireDecisions({},'month-week',true).every(item=>item.status==='数据不足'));
 assert.equal(fireDecisions({modes:{'month-week':'流动性不合格'}},'month-week')[0].status,'流动性不合格');
});

test('候选分组多头在前空头在后，保留组内顺序与完整列跨度',()=>{
 const rows=[candidate('多一','多头观察',4),candidate('多二','多头观察',1),candidate('空一','空头观察',2)];
 for(const mode of ['month-week','week-day','month-week-day']){
  const count=mode==='month-week-day'?8:7;
  const html=renderFireGroups(rows,mode,count,row=>`<tr><td>${row.code}</td></tr>`);
  const doc=new JSDOM(`<table>${html}</table>`).window.document;
  assert.deepEqual([...doc.querySelectorAll('tbody')].map(x=>x.className),['fire-group fire-long','fire-group fire-short']);
  assert.deepEqual([...doc.querySelectorAll('td')].map(x=>x.textContent),['多一','多二','空一']);
  assert.equal(doc.querySelector('th').colSpan,count);
  assert.match(doc.querySelector('th').textContent,/2 个品种/);
 }
});

test('单边和空候选不产生空分组，候选原数据不变',()=>{
 const row=candidate('空一','空头观察',2),original=JSON.stringify(row);
 const html=renderFireGroups([row],'month-week',7,()=>'<tr><td>空一</td></tr>');
 assert.ok(!html.includes('fire-long'));
 assert.ok(html.includes('fire-short'));
 assert.equal(renderFireGroups([],'month-week',7,()=>''),'');
 assert.equal(JSON.stringify(row),original);
});

function candidate(code,result,strength){
 const delta=result==='空头观察'?-strength:strength;
 return {
  code,
  modes:{'month-week':result,'week-day':result,'month-week-day':result},
  month_ma10:100+delta,previous_month_ma10:100,
  week_ma10:100+delta,previous_week_ma10:100,
  day_ma10:100+delta,previous_day_ma10:100,
  week_low:100+strength,previous_week_low:100,
  week_high:100-strength,previous_week_high:100,
  day_low:100+strength,previous_day_low:100+strength/2,prior_day_low:100,
  day_high:100-strength,previous_day_high:100-strength/2,prior_day_high:100,
  month_break_recent_high:100+strength,month_break_previous_high:100,
  month_break_recent_low:100-strength,month_break_previous_low:100,
  week_break_recent_high:100+strength,week_break_previous_high:100,
  week_break_recent_low:100-strength,week_break_previous_low:100
 };
}

test('火候选先排多头，再排空头，同板块保留配置顺序而非强弱跳动',()=>{
 const rows=[
  candidate('空普通','空头观察',1),
  candidate('多普通','多头观察',1),
  candidate('空最优','空头观察',4),
  candidate('多最优','多头观察',4)
 ];
 for(const mode of ['month-week','week-day','month-week-day']){
  assert.deepEqual(sortFireCandidates(rows,mode).map(row=>row.code),['多普通','多最优','空普通','空最优']);
 }
});

test('火候选质量同分时保持原配置顺序',()=>{
 const first=candidate('先出现','多头观察',2),second=candidate('后出现','多头观察',2);
 assert.equal(fireCandidateQuality(first,'month-week'),fireCandidateQuality(second,'month-week'));
 assert.deepEqual(sortFireCandidates([first,second],'month-week').map(row=>row.code),['先出现','后出现']);
});

test('顶部总览三个模式与明细同序，多空分开编号且不混入未纳入品种',()=>{
 const rows=[candidate('空普通','空头观察',1),candidate('多普通','多头观察',1),candidate('空最优','空头观察',4),candidate('多最优','多头观察',4),candidate('未纳入','未纳入',100)];
 const before=JSON.stringify(rows);
 for(const mode of ['month-week-day','month-week','week-day']){
  const doc=new JSDOM(renderFireOverview(rows,mode,String)).window.document;
  assert.deepEqual([...doc.querySelectorAll('[data-overview-side]')].map(x=>x.dataset.overviewSide),['long','short']);
  assert.deepEqual([...doc.querySelectorAll('[data-fire-detail]')].map(x=>x.dataset.fireDetail),sortFireCandidates(rows.filter(r=>r.modes[mode]!=='未纳入'),mode).map(r=>r.code));
  assert.deepEqual([...doc.querySelectorAll('.fire-rank')].map(x=>x.textContent),['1','2','1','2']);
  assert.ok([...doc.querySelectorAll('h3')].every(x=>x.textContent.includes('2 个品种')));
 }
 assert.equal(JSON.stringify(rows),before);
});

test('顶部总览空状态、单边及名称转义保持完整',()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const row={...candidate('A"<b>','空头观察',2),name:'<img src=x onerror=alert(1)>',main_contract:'A"<script>'};
 const doc=new JSDOM(renderFireOverview([row],'month-week-day',escape)).window.document;
 assert.equal(doc.querySelector('[data-overview-side="long"] p').textContent,'暂无候选');
 assert.equal(doc.querySelector('[data-overview-side="short"] button span').textContent,row.name);
 assert.equal(doc.querySelector('button').dataset.fireDetail,row.code);
 assert.equal(doc.querySelectorAll('img,script').length,0);
 assert.equal(new JSDOM(renderFireOverview([],'week-day',escape)).window.document.querySelectorAll('button').length,0);
});

test('周日强弱色值不使用已删除的周线突破强度',()=>{
 const first=candidate('无突破','多头观察',2),second={...candidate('大突破','多头观察',2),week_break_recent_high:999999};
 assert.equal(fireCandidateQuality(first,'week-day'),fireCandidateQuality(second,'week-day'));
});

test('月周日共振保留周K和日K方向结构，结构未成立仍明确展示',()=>{
 const row={
  modes:{'month-week-day':'多头观察'},month_direction:'上升',week_direction:'上升',day_direction:'上升',
  week_low:105,previous_week_low:100,week_higher_low:true,week_high:130,previous_week_high:125,week_lower_high:false,
  day_low:106,previous_day_low:104,prior_day_low:100,day_higher_low:true,day_high:132,previous_day_high:130,prior_day_high:125,day_lower_high:false
 };
 assert.deepEqual(fireStructure(row,'month-week-day','week').map(item=>item.label),['低点抬高','高点抬高']);
 assert.deepEqual(fireStructure(row,'month-week-day','week').map(item=>item.tone),['long-strong','long-strong']);
 assert.deepEqual(fireStructure(row,'month-week-day','day').map(item=>item.label),['低点抬高','高点抬高']);
 assert.equal(fireStructure({...row,day_low:99,day_higher_low:false},'month-week-day','day')[0].label,'低点未抬高');
 assert.equal(fireStructure({...row,day_low:99,day_higher_low:false},'month-week-day','day')[0].tone,'long-none');
 assert.equal(fireStructure({...row,day_low:99,day_higher_low:false},'month-week-day','day')[1].tone,'long-partial');
 const short={...row,modes:{'month-week-day':'空头观察'},week_high:120,week_lower_high:true};
 assert.deepEqual(fireStructure(short,'month-week-day','week').map(item=>item.label),['高点抬低','低点未抬低']);
 assert.deepEqual(fireStructure(short,'month-week-day','week').map(item=>item.tone),['short-partial','short-none']);
});

test('空头周日双侧同步下降为深绿，单侧为浅蓝，均不满足为普通色',()=>{
 const row={modes:{'month-week-day':'空头观察'},week_low:90,previous_week_low:100,week_high:115,previous_week_high:120,day_low:88,previous_day_low:90,prior_day_low:95,day_high:113,previous_day_high:115,prior_day_high:120};
 for(const period of ['week','day']){
  assert.deepEqual(fireStructure(row,'month-week-day',period).map(item=>item.label),['高点抬低','低点抬低']);
  assert.ok(fireStructure(row,'month-week-day',period).every(item=>item.tone==='short-strong'));
 }
 assert.deepEqual(fireStructure({...row,week_low:105},'month-week-day','week').map(item=>item.tone),['short-partial','short-none']);
 assert.ok(fireStructure({...row,week_low:105,week_high:125},'month-week-day','week').every(item=>item.tone==='short-none'));
});

test('日K辅助结构按前两日形成并用最新K核验，不把昨日信号冒充仍在延续',()=>{
 const long={modes:{'month-week-day':'多头观察'},prior_day_low:100,previous_day_low:104,day_low:106,prior_day_high:125,previous_day_high:130,day_high:128};
 assert.deepEqual(fireStructure(long,'month-week-day','day').map(item=>item.label),['低点抬高','高点未抬高']);
 assert.deepEqual(fireStructure(long,'month-week-day','day').map(item=>item.tone),['long-partial','long-none']);
 const short={modes:{'month-week-day':'空头观察'},prior_day_low:100,previous_day_low:95,day_low:98,prior_day_high:130,previous_day_high:125,day_high:123};
 assert.deepEqual(fireStructure(short,'month-week-day','day').map(item=>item.label),['高点抬低','低点未抬低']);
 assert.deepEqual(fireStructure(short,'month-week-day','day').map(item=>item.tone),['short-partial','short-none']);
});

test('持平不算抬高或抬低，缺失数据不产生结构共振色',()=>{
 const row={modes:{'month-week-day':'多头观察'},week_low:100,previous_week_low:100,week_high:120,previous_week_high:120};
 assert.deepEqual(fireStructure(row,'month-week-day','week').map(item=>item.label),['低点未抬高','高点未抬高']);
 assert.ok(fireStructure(row,'month-week-day','week').every(item=>item.tone==='long-none'));
 assert.ok(fireStructure({...row,week_high:null},'month-week-day','week').every(item=>item.tone==='neutral'));
});

test('共振强弱色值只按三周期均线，不受辅助结构或突破字段影响',()=>{
 const first=candidate('同均线A','多头观察',2),second={...first,code:'同均线B',week_low:200,day_low:200,month_break_recent_high:500};
 assert.equal(fireCandidateQuality(first,'month-week-day'),fireCandidateQuality(second,'month-week-day'));
});
