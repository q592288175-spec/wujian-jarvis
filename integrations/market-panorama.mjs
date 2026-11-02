import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {sectorFor} from '../dist/sectors.js';
import {completedSeries,barDate} from '../dist/structure.js';
import {panoramaPeriods,panoramaMaLength,cycleResonance} from '../dist/market-panorama-periods.js';
import {atomicWrite} from './research-storage.mjs';
import {intradayComparison} from './intraday-comparison.mjs';
import {readCloseOverview} from './market-overview.mjs';

const finite=v=>typeof v==='number'&&Number.isFinite(v);
export const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(+v)?+v:null;
const bj=()=>new Date(Date.now()+28800000).toISOString().slice(0,10);
const validDate=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
function exportMetadata(value){
 if(value==null)return{};
 if(typeof value!=='object'||Array.isArray(value))throw Error('导出说明无效');
 const labels={title:'标题',date:'数据日期',asOf:'截至时间',unit:'单位',source:'来源',basis:'计算口径',scope:'筛选范围'};
 return Object.fromEntries(Object.entries(labels).filter(([key])=>value[key]!==undefined).map(([key,label])=>{if(typeof value[key]!=='string'||value[key].length>2000)throw Error('导出说明过长或格式不符');return[label,value[key]]}));
}
export const groups={
 '机构':['国泰君安','国泰海通','中信期货','东证期货','永安期货','华泰期货','海通期货'],
 '外资':['高盛期货','摩根大通','瑞银期货'],
 '散户观察组':['东方财富','徽商期货','平安期货'],
 '杭州观察组':['宝城期货','大地期货','南华期货','物产中大','浙商期货']
};
export function memberGroups(name){
 // Only documented account-type suffixes. Keep the original name on every row:
 // recognition must never combine proprietary/client seats or different contracts.
 const identity=String(name||'').trim().replace(/(?:（(?:代客|自营)）|\((?:代客|自营)\))$/u,'').trim();
 return Object.entries(groups).filter(([,names])=>names.some(n=>identity===n||identity===n+'期货'||identity.replace(/期货$/,'')===n.replace(/期货$/,''))).map(([key])=>key);
}
export function maSignal(bars,pointValue=null){
 const done=bars.filter(b=>b.complete!==false&&b.complete!==0&&finite(b.close)&&b.close>0),last=done.at(-1);
 if(done.length<panoramaMaLength)return {side:'missing',ma:null,close:last?.close??null,samples:done.length,distance:null};
 const ma=done.slice(-panoramaMaLength).reduce((s,b)=>s+b.close,0)/panoramaMaLength,delta=last.close-ma;
 const previousMa=done.length>panoramaMaLength?done.slice(-panoramaMaLength-1,-1).reduce((s,b)=>s+b.close,0)/panoramaMaLength:null;
 return {side:Math.abs(delta)<1e-9?'flat':delta>0?'long':'short',ma,previousMa,maChange:previousMa===null?null:ma-previousMa,close:last.close,samples:done.length,distance:finite(pointValue)?delta*pointValue:null,stamp:last.stamp,source:last.source||null,contract:last.contract||null};
}
export function calendarBars(daily,period){
 const bars=daily.map(b=>({...b,timeNs:String(BigInt(Date.parse(b.day+'T00:00:00+08:00'))*1000000n),complete:b.complete!==false&&b.complete!==0}));
 return completedSeries({bars},period==='1mo'?'M':'W').map(b=>({...b,stamp:barDate(b),day:barDate(b),contract:daily.at(-1)?.contract,source:(daily.at(-1)?.source||'完成日K')+' · '+(period==='1mo'?'月K':'周K')+'聚合（保守排除首尾周期）'}));
}
export function needsDailySeed(quotes,stored){
 return quotes.some(q=>{const b=q.bars?.findLast(b=>b.complete===true);if(!b?.timeNs)return false;const day=new Date(Number(BigInt(b.timeNs)/1000000n)+28800000).toISOString().slice(0,10);return day>(stored.get(q.symbol.replace(/\d+$/,'').toUpperCase())||'')});
}
export function seatPairs(rows,prices,pointValue){
 const pairs=new Map();
 for(const r of rows){const key=r.contract+'\0'+r.member;if(!pairs.has(key))pairs.set(key,{contract:r.contract,member:r.member,product:r.product,day:r.day,long:null,short:null,longChange:null,shortChange:null,source:r.source});const p=pairs.get(key);p[r.side]=number(r.value);p[r.side+'Change']=number(r.change)}
 return [...pairs.values()].map(p=>{const complete=finite(p.long)&&finite(p.short),delta=finite(p.longChange)&&finite(p.shortChange)?p.longChange-p.shortChange:null;
  const price=prices.get(p.contract),net=complete?p.long-p.short:null,amount=net!==null&&finite(price)&&finite(pointValue)?net*price*pointValue:null;
  const action=[finite(p.longChange)&&p.longChange!==0?(p.longChange>0?'增多':'减多'):'',finite(p.shortChange)&&p.shortChange!==0?(p.shortChange>0?'增空':'减空'):''].filter(Boolean).join(' / ')||'持平或缺失';
  return {...p,net,delta,amount,amountChange:delta!==null&&finite(price)&&finite(pointValue)?delta*price*pointValue:null,price:price??null,complete,action,groups:memberGroups(p.member)};
 });
}
export function feeAmount(row,prefix,price,pointValue){
 if(row['费用来源类型']==='OpenCTP账户参考')return number(row[{'开仓':'1手开仓费用','平昨':'1手平仓费用','平今':'1手平今费用'}[prefix]]);
 const fixed=number(row[`手续费标准-${prefix}-元`]),rate=number(row[`手续费标准-${prefix}-万分之`]);
 if(finite(rate)&&rate>0)return finite(price)&&finite(pointValue)?price*pointValue*rate/10000:null;
 return finite(fixed)&&fixed>=0?fixed:finite(rate)&&rate===0?0:null;
}
export function feeType(row){
 const account=row['费用来源类型']==='OpenCTP账户参考';
 const rate=number(row[account?'开仓费率':'手续费标准-开仓-万分之']);
 const fixed=number(row[account?'开仓费用/手':'手续费标准-开仓-元']);
 return rate>0?(fixed>0?'mixed':'ratio'):fixed!==null&&fixed>=0?'fixed':'unknown';
}
export function commodityExposure(rows,pointValue){
 const dates=[...new Set(rows.map(r=>r.day))].sort(),day=dates.at(-1),previous=dates.at(-2);let interest=0,amount=0,samples=0;
 if(!previous||!finite(pointValue))return {marketInterestChange:null,marketNominalChange:null,marketSamples:0};
 const prior=new Map(rows.filter(r=>r.day===previous).map(r=>[r.contract,r]));
 for(const r of rows.filter(r=>r.day===day)){const p=prior.get(r.contract);if(!p||!finite(r.interest)||!finite(p.interest)||!finite(r.price))continue;const delta=r.interest-p.interest;interest+=delta;amount+=delta*r.price*pointValue;samples++}
 return {marketInterestChange:samples?interest:null,marketNominalChange:samples?amount:null,marketSamples:samples};
}

export function createPanorama({root=resolve('.'),folder=process.env.WUJIAN_PANORAMA_DIR||resolve(root,'.runtime/market-panorama'),getFire=async()=>({rows:[]}),getLiveQuote=()=>null,getLiveStatus=()=>null}={}){
 if(relative(root,folder).startsWith('..'))throw Error('市场缓存必须位于项目内');
 let db=null,catalog=[],specs={},initialized=null,job=null,child=null,liveChild=null,starting=false,revision=0,lastSnapshot=null,snapshotAt=0,stopped=false;
 const listeners=new Set(),pendingSnapshots=new Map();
 let fireCatalogKey=null;
 const fireKey=fire=>JSON.stringify((fire.rows||[]).map(r=>[String(r.code).toUpperCase(),r.main_contract,r.data_date,r.modes]));
 function emit(type,value){revision++;lastSnapshot=null;for(const fn of listeners)fn(type,{...value,revision})}
 async function init(){
  if(initialized)return initialized;
  initialized=(async()=>{
   await mkdir(folder,{recursive:true});db=new DatabaseSync(resolve(folder,'market.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS records(kind TEXT,key TEXT,day TEXT,body TEXT,source TEXT,updated TEXT,PRIMARY KEY(kind,key,day)); CREATE TABLE IF NOT EXISTS bars(product TEXT,contract TEXT,period TEXT,stamp TEXT,day TEXT,open REAL,high REAL,low REAL,close REAL,volume REAL,interest REAL,source TEXT,complete INTEGER,PRIMARY KEY(product,contract,period,stamp)); CREATE INDEX IF NOT EXISTS bars_lookup ON bars(product,period,day); CREATE TABLE IF NOT EXISTS seats(product TEXT,contract TEXT,day TEXT,member TEXT,side TEXT,value REAL,change REAL,source TEXT,PRIMARY KEY(product,contract,day,member,side)); CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT);');
   for(const path of ['data/contract-specs.json','.runtime/contract-specs/current.json']){try{const s=JSON.parse(await readFile(resolve(root,path),'utf8'));Object.assign(specs,s.products)}catch{}}
   let market={quotes:[]};try{market=JSON.parse(await readFile(resolve(root,'.runtime/market.json'),'utf8'))}catch{}
   const quotes=new Map(market.quotes.map(q=>[q.symbol.replace(/\d+$/,'').toUpperCase(),q]));
   const fire=await getFire(),rows=new Map((fire.rows||[]).map(r=>[r.code.toUpperCase(),r]));fireCatalogKey=fireKey(fire);
   const exchanges={'上期所':'SHFE','上海期货交易所':'SHFE','能源中心':'INE','上海国际能源交易中心':'INE','大商所':'DCE','大连商品交易所':'DCE','郑商所':'CZCE','郑州商品交易所':'CZCE','广期所':'GFEX','广州期货交易所':'GFEX','中金所':'CFFEX','中国金融期货交易所':'CFFEX'};
   catalog=[...new Set([...quotes.keys(),...rows.keys()])].map(code=>{const q=quotes.get(code)||{},r=rows.get(code)||{},spec=specs[code]||{},exchange=q.exchange||exchanges[r.exchange]||r.exchange||exchanges[spec.exchange]||spec.exchange||'';
    const raw=String(r.main_contract||q.actualContract||'').split('.').at(-1).toUpperCase(),contract=/^[A-Z]+\d{3,4}$/.test(raw)?raw:null;
    return {code,name:r.name||q.name?.replace('主力连续','')||spec.name||code,exchange,sector:sectorFor({code}),contract,contractDate:r.data_date||q.actualContractDate||null,pointValue:spec.pointValue??null,tickSize:spec.tickSize??null,fireModes:r.modes||{},fireDate:r.data_date||null};
   }).sort((a,b)=>a.code.localeCompare(b.code));
   await writeFile(resolve(folder,'catalog.json'),JSON.stringify(catalog));
   const old=parse(await readFile(resolve(folder,'job.json'),'utf8').catch(()=>''));if(old)job=['running','queued'].includes(old.status)?{...old,status:'interrupted',stage:'上次同步被中断，可重试'}:old;
  })().catch(e=>{initialized=null;throw e});return initialized;
 }
 function record(kind,key,day){const r=db.prepare('SELECT * FROM records WHERE kind=? AND key=? AND day<=? ORDER BY day DESC LIMIT 1').get(kind,key,day);return r?{...parse(r.body),recordDay:r.day,source:r.source,updated:r.updated}:null}
 function bars(code,period,day,limit=2200,expectedContract=undefined){
  if(period==='1mo'||period==='1w')return calendarBars(bars(code,'1d',day),period).slice(-limit);
  if(expectedContract!==undefined&&!expectedContract)return[];
  const latest=expectedContract!==undefined?{contract:expectedContract}:db.prepare('SELECT contract FROM bars WHERE product=? AND period=? AND day<=? ORDER BY stamp DESC LIMIT 1').get(code,period,day);
  if(!latest)return[];
  return db.prepare('SELECT * FROM bars WHERE product=? AND period=? AND contract=? AND day<=? ORDER BY stamp DESC LIMIT ?').all(code,period,latest.contract,day,limit).reverse();
 }
 let jobWrites=Promise.resolve();
 async function persistJob(){const value=JSON.stringify(job);jobWrites=jobWrites.catch(()=>{}).then(()=>atomicWrite(resolve(folder,'job.json'),value));await jobWrites;emit('job',job)}
 async function refreshCatalog(){
  const fire=await getFire();
  if(!fire.rows?.length)return;
  const key=fireKey(fire);if(key===fireCatalogKey)return;
  const rows=new Map(fire.rows.map(r=>[String(r.code).toUpperCase(),r]));
  for(const c of catalog){const row=rows.get(c.code);if(row){const raw=String(row.main_contract||'').split('.').at(-1).toUpperCase();if(/^[A-Z]+\d{3,4}$/.test(raw)){c.contract=raw;c.contractDate=row.data_date||null}}c.fireModes=row?.modes||{};c.fireDate=row?.data_date||null;}
  await atomicWrite(resolve(folder,'catalog.json'),JSON.stringify(catalog));lastSnapshot=null;
  fireCatalogKey=key;emit('data',{source:'fire'});
 }
 async function start({mode='full',product}={}){
  await init();if(child||starting)return job;
  if(!['seed','quotes','closes','minutes','holdings','fees','full','supplement'].includes(mode))throw Error('刷新类型无效');
  if(product&&!catalog.some(c=>c.code===product))throw Error('品种不存在');
  const python=resolve(root,process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');
  if(!existsSync(python))throw Error('本地数据环境不可用');
  starting=true;job={id:randomUUID(),status:'running',mode,product:product||null,stage:'准备同步',startedAt:new Date().toISOString(),errors:[],results:{}};try{if(['full','seed','minutes'].includes(mode))await refreshCatalog();await persistJob()}catch(e){starting=false;throw e}
  const args=[resolve(root,'integrations/market-panorama-data.py'),mode,'--folder',folder];if(product)args.push('--product',product);
  child=spawn(python,args,{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'},stdio:['ignore','pipe','pipe']});
  starting=false;
  let buffer='',err='';const labels={seed:'导入已有盘后行情',quotes:'同步具体合约报价',closes:'同步同合约收盘与昨收',fees:'同步手续费',holdings:'同步六所持仓排名',minutes:'同步分钟K线',supplement:'同步合约与现货资料'};
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stderr.on('data',s=>err=(err+s).slice(-1200));
  child.stdout.on('data',s=>{buffer+=s;let i;while((i=buffer.indexOf('\n'))>=0){const v=parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(!v)continue;if(v.stage)job.stage=labels[v.stage]||v.stage;if(v.result!==undefined)job.results[v.stage]=v.result;if(v.errors)job.errors=v.errors;if(v.results)job.results=v.results;void persistJob().catch(()=>{});}});
  let done=false;const finish=async(code,error)=>{if(done)return;done=true;child=null;const cancelled=job.status==='cancelled';const failures=Object.values(job.results).flatMap(v=>v?.failures||[]);job={...job,status:cancelled?'cancelled':code===0?(job.errors.length||failures.length?'partial':'completed'):'failed',stage:cancelled?'同步已取消':code===0?'本轮同步结束':'本轮同步失败',finishedAt:new Date().toISOString(),failures,...(!cancelled&&(error||code!==0)?{error:error||err||'数据进程意外结束'}:{})};await persistJob()};
  child.once('error',e=>void finish(1,e.message));child.once('exit',c=>void finish(c));return job;
 }
 async function snapshot(day=bj()){
  await init();if(!validDate(day)||day>bj())throw Error('请选择有效的历史交易日期');
  await refreshCatalog();
  if(!getLiveStatus()?.selected&&lastSnapshot?.selectedDate===day&&Date.now()-snapshotAt<5000)return lastSnapshot;
  // Concurrent chart requests share one calculation; later live requests still refresh.
  const key=day+':'+revision;if(pendingSnapshots.has(key))return pendingSnapshots.get(key);
  const pending=buildSnapshot(day,revision);pendingSnapshots.set(key,pending);
  try{return await pending}finally{if(pendingSnapshots.get(key)===pending)pendingSnapshots.delete(key)}
 }
 async function buildSnapshot(day,buildRevision){
  const dates=db.prepare("SELECT DISTINCT day FROM bars WHERE period='1d' AND day<=? ORDER BY day DESC LIMIT 260").all(day).map(r=>r.day);
  const seatDate=db.prepare('SELECT MAX(day) AS day FROM seats WHERE day<=?').get(day).day||null;
  const allSeats=seatDate?db.prepare('SELECT * FROM seats WHERE day=?').all(seatDate):[];
  const rawFees=db.prepare("SELECT r.* FROM records r WHERE kind='fee' AND day=(SELECT MAX(day) FROM records x WHERE x.kind=r.kind AND x.key=r.key AND x.day<=?)").all(day).map(r=>({...parse(r.body),source:r.source,recordDay:r.day}));
  const prices=new Map(db.prepare("SELECT key,body FROM records WHERE kind='settle' AND day=?").all(seatDate||'').map(r=>[r.key,parse(r.body)?.price]));
  const products=catalog.map(c=>{
   const daily=bars(c.code,'1d',day),last=daily.at(-1),prev=daily.at(-2),validDaily=Boolean(last&&last.day===dates[0]),live=getLiveQuote(c,day)||record('quote',c.code,day),signals={};
   for(const {key,period} of panoramaPeriods){const signal=maSignal(period==='1d'?daily:period==='1mo'||period==='1w'?calendarBars(daily,period):bars(c.code,period,day,160,c.contract),c.pointValue);const stale=['1mo','1w'].includes(period)?last?.day<dates[0]:signal.stamp&&dates[0]&&signal.stamp.slice(0,10)<dates[0];if(stale)Object.assign(signal,{side:'missing',ma:null,distance:null,reason:'序列陈旧'});signals[key]=signal;}
   const recent=live&&live.contract===c.contract&&(live.quoteAt.slice(0,10)===day||live.source==='TqSdk'&&live.tradingDay===day||day===bj()&&live.quoteAt.slice(0,10)>=(dates[0]||day));const close=recent?live.last:validDaily?last.close:null;
   const pct=recent?live.changePct:finite(close)&&prev?.close>0?(close/prev.close-1)*100:null;
   const series=bars(c.code,'30m',day,80,c.contract).filter(b=>b.complete),end=series.at(-1),before=series.at(-2);
   const continuous=end&&before&&end.day>=(dates[0]||day)&&Date.parse(end.stamp.replace(' ','T')+'+08:00')-Date.parse(before.stamp.replace(' ','T')+'+08:00')===1800000;
   const pairs=seatPairs(allSeats.filter(r=>r.product===c.code),prices,c.pointValue);
   const feeRows=rawFees.filter(r=>r['合约代码']?.toUpperCase().replace(/\d+$/,'')===c.code).map(r=>{const rawPrice=number(r['现价']),price=rawPrice>0?rawPrice:null,open=feeAmount(r,'开仓',price,c.pointValue),today=feeAmount(r,'平今',price,c.pointValue),previous=feeAmount(r,'平昨',price,c.pointValue);return {...r,contract:r['合约代码'].toUpperCase(),contractInfo:record('contract-info',r['合约代码'].toUpperCase(),day),price,feeType:feeType(r),open,today,previous,tick:finite(c.tickSize)&&finite(c.pointValue)?c.tickSize*c.pointValue:null}});
   const comparable=pairs.filter(p=>p.complete),amounts=pairs.filter(p=>p.amount!==null),deltas=pairs.filter(p=>p.delta!==null);
   return {...c,warrantStatus:record('supplement-status','warrant:'+c.code,day),rollYield:record('roll-yield',c.code,day),rollStatus:record('supplement-status','roll-product:'+c.code,day)||record('supplement-status','roll:'+c.exchange,day),contractInfo:c.contract?record('contract-info',c.contract,day):null,basis:record('basis',c.code,day),fireModes:c.fireDate&&c.fireDate<=day?c.fireModes:{},fireDate:c.fireDate&&c.fireDate<=day?c.fireDate:null,close,closeDate:recent?live.quoteAt.slice(0,10):last?.day||null,priceSource:recent?live.source:last?.source||null,priceTime:recent?live.quoteAt:last?.stamp||null,priceType:recent?'具体合约最新价':'完成日K主连',changeBasis:recent?'昨结':'昨收',volume:recent?live.volume:validDaily?last.volume??null:null,interest:recent?live.interest:validDaily?last.interest??null:null,changePct:pct,quoteChangePct:recent?live.changePct??null:null,previousSettlement:recent?live.previousSettlement??null:null,return3:validDaily&&daily.length>3?(last.close/daily.at(-4).close-1)*100:null,return5:validDaily&&daily.length>5?(last.close/daily.at(-6).close-1)*100:null,volumeChange:validDaily&&prev&&finite(last.volume)&&finite(prev.volume)?last.volume-prev.volume:null,interestChange:validDaily&&prev&&finite(last.interest)&&finite(prev.interest)?last.interest-prev.interest:null,signals,resonance:cycleResonance(signals),movement30:continuous&&before.close>0?(end.close/before.close-1)*100:null,movementAt:end?.stamp||null,pairs,fees:feeRows,net:comparable.length?comparable.reduce((s,p)=>s+p.net,0):null,delta:deltas.length?deltas.reduce((s,p)=>s+p.delta,0):null,amount:amounts.length?amounts.reduce((s,p)=>s+p.amount,0):null,amountChange:pairs.some(p=>p.amountChange!==null)?pairs.reduce((s,p)=>s+(p.amountChange??0),0):null,seatCoverage:{pairs:pairs.length,complete:comparable.length,priced:amounts.length},seatDate};
  });
  const settlements=db.prepare("SELECT key,day,body FROM records WHERE kind='settle' AND day<=?").all(day).map(r=>({contract:r.key,day:r.day,...parse(r.body)}));
  for(const p of products)Object.assign(p,commodityExposure(settlements.filter(r=>r.contract.replace(/\d+$/,'')===p.code),p.pointValue));
  const coverage=db.prepare("SELECT body FROM records WHERE kind='coverage' AND day=?").all(seatDate||dates[0]||day).map(r=>parse(r.body));
  const watchlist=parse(db.prepare("SELECT value FROM preferences WHERE key='watchlist'").get()?.value)||[];
  const supplementConfig=parse(await readFile(resolve(root,'data/panorama-sources.json'),'utf8').catch(()=>'null'));const supplementSources=(supplementConfig?.sources||[]).map(s=>({...s,...record('supplement-status',s.key,day)}));
  const value={tqConnection:getLiveStatus(),supplementSources,selectedDate:day,generatedAt:new Date().toISOString(),revision:buildRevision,dates,seatDate,products,coverage,job,watchlist,periods:Object.fromEntries(panoramaPeriods.map(p=>[p.key,p.label])),maLength:panoramaMaLength,method:'月K、周K、日K、2小时、30分钟统一MA10；完成K线收盘高于均线为多、低于均线为空。月周沿用小木完成日K聚合，保守排除首尾周期；分钟为具体合约。此为市场观察，不改变火筛选资格。席位为公开排名样本，未上榜不作零。',seriesNotice:'使用小木主连及具体合约，未冒充原站加权序列；收益排名不等于原站分数。',source:'AKShare、交易所公开排名与新浪公开行情',counts:{total:products.length,priced:products.filter(p=>p.close!==null).length,seated:products.filter(p=>p.pairs.length).length,fees:rawFees.length}};
  const closeDates=db.prepare("SELECT DISTINCT day FROM bars WHERE period='1d' AND complete=1 AND day<=? ORDER BY day DESC LIMIT 2").all(day).map(r=>r.day);
  value.closeOverview=readCloseOverview(db,products,closeDates);
  if(revision===buildRevision){lastSnapshot=value;snapshotAt=Date.now()}return value;
 }
 async function detail(code,day=bj()){
  const snap=await snapshot(day),product=snap.products.find(p=>p.code===code);if(!product)throw Error('品种不存在');
  // Batch history reads; prices still match the exact contract and trading day.
  const rows=db.prepare('SELECT * FROM seats WHERE product=? AND day<=? ORDER BY day,contract,member,side').all(code,day);
  const byDay=new Map();for(const row of rows){if(!byDay.has(row.day))byDay.set(row.day,[]);byDay.get(row.day).push(row)}
  const pricesByDay=new Map();
  if(rows.length)for(const r of db.prepare("SELECT key,day,body FROM records WHERE kind='settle' AND day<=? AND key IN (SELECT DISTINCT contract FROM seats WHERE product=? AND day<=?)").all(day,code,day)){if(!pricesByDay.has(r.day))pricesByDay.set(r.day,new Map());pricesByDay.get(r.day).set(r.key,parse(r.body)?.price)}
  const seatHistory=[...byDay].map(([d,values])=>({day:d,pairs:seatPairs(values,pricesByDay.get(d)||new Map(),product.pointValue)}));
  return {...product,warrantHistory:record('warrant-history',code,day),bars:Object.fromEntries(panoramaPeriods.map(({period})=>[period,['120m','30m'].includes(period)?bars(code,period,day,2200,product.contract):bars(code,period,day,2200)])),seatHistory,selectedDate:day};
 }
 async function intraday(code,day=bj()){
  const snap=await snapshot(day),product=snap.products.find(p=>p.code===code);
  if(!product)throw Error('品种不存在');return intradayComparison(product,day);
 }
 async function watchlist(values){await init();if(!Array.isArray(values)||values.length>200||values.some(v=>!catalog.some(c=>c.code===v)))throw Error('自选品种无效');const list=[...new Set(values)];db.prepare("INSERT OR REPLACE INTO preferences VALUES('watchlist',?)").run(JSON.stringify(list));emit('watchlist',{values:list});return list}
 async function status(){await init();return {job,catalog:catalog.length,revision,folder,counts:{bars:db.prepare('SELECT COUNT(*) AS n FROM bars').get().n,seats:db.prepare('SELECT COUNT(*) AS n FROM seats').get().n},updatedAt:new Date().toISOString()}}
 let timer=null,lastMinutes=Date.now(),marketMtime=0;
 function schedule(){if(timer||process.env.WUJIAN_PANORAMA_AUTOSYNC==='0')return;timer=setInterval(async()=>{
  if(!listeners.size||stopped)return;
  try{const path=resolve(root,'.runtime/market.json'),mtime=(await stat(path)).mtimeMs;if(mtime!==marketMtime){marketMtime=mtime;const s=JSON.parse(await readFile(path,'utf8'));const latest=s.quotes?.map(q=>q.tradingDay).filter(Boolean).sort().at(-1),stored=db.prepare("SELECT MAX(day) AS day FROM bars WHERE period='1d'").get().day;if(s.status==='eod-ready'&&latest&&!child&&!starting){const perProduct=new Map(db.prepare("SELECT product,MAX(day) AS day FROM bars WHERE period='1d' GROUP BY product").all().map(r=>[r.product,r.day]));if(!stored||latest>stored||needsDailySeed(s.quotes||[],perProduct)){await start({mode:!stored||latest>stored?'full':'seed'});return}}}}catch{}
  if(!liveChild&&!(child&&job?.mode==='quotes')){
   const python=resolve(root,process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');
   liveChild=spawn(python,[resolve(root,'integrations/market-panorama-data.py'),'quotes','--folder',folder],{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'},stdio:'ignore'});
   let finished=false;const finish=()=>{if(finished)return;finished=true;liveChild=null;emit('data',{})};liveChild.once('error',finish);liveChild.once('exit',finish);
  }
  if(!child&&Date.now()-lastMinutes>=300000){lastMinutes=Date.now();void start({mode:'minutes'}).catch(()=>{})}
 },30000);timer.unref()}
 function cancel(){if(!child)return job;job.status='cancelled';child.kill();return job}
 function stop(){stopped=true;clearInterval(timer);child?.kill();liveChild?.kill();for(const listener of listeners)listener('close',{});listeners.clear();db?.close();}
 async function exportTable({rows,title,date,metadata}){if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!Array.isArray(r)||r.length>80))throw Error('导出表格无效');const directory=resolve(root,'output/market-panorama/exports');await mkdir(directory,{recursive:true});const path=resolve(directory,`市场全景-${String(title||'表格').replace(/[^\p{L}\p{N}-]/gu,'').slice(0,30)}-${Date.now()}.csv`);const cell=v=>{let text=String(v??'');if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};const evidence=exportMetadata(metadata);await writeFile(path,'\ufeff'+[['小木市场全景',title,date],...Object.entries(evidence),...rows].map(r=>r.map(cell).join(',')).join('\r\n'));return{path,rows:rows.length}}
 async function exportImage({dataUrl,title,metadata}){if(typeof dataUrl!=='string'||dataUrl.length>1800000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw Error('图表图片无效');const image=Buffer.from(dataUrl.split(',')[1],'base64');if(!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('仅支持PNG图表');const directory=resolve(root,'output/market-panorama/exports');await mkdir(directory,{recursive:true});const path=resolve(directory,`图表-${String(title||'市场').replace(/[^\p{L}\p{N}-]/gu,'').slice(0,30)}-${Date.now()}.png`);const evidence=exportMetadata(metadata);await writeFile(path,image);const metadataPath=path.replace(/\.png$/,'.json');await writeFile(metadataPath,JSON.stringify({...evidence,导出时间:new Date().toISOString()},null,2));return{path,metadataPath}}
 return {init,start,snapshot,detail,intraday,status,watchlist,exportTable,exportImage,listeners,schedule,cancel,stop};
}
