import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {canonical,productCode} from './monitor-engine.mjs';

const exec=promisify(execFile),SOURCE='新浪公开网页行情',INTERVAL=10000;
const dateAt=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
const off={sessionActive:false,sessionKey:null,tradingDay:null};
const night23=new Set('RB HC FU BU RU BR SP OP NR LU A B C CS M Y P I J JM L V PP EG EB PG RR BZ CF CY TA OI RM SR MA FG SA PF ZC SH PX PR PL'.split(' '));
const night25=new Set('CU BC AL AO ZN PB NI SN SS AD'.split(' '));
const night2630=new Set(['AU','AG','SC']);

export function sinaSymbol(symbol,now=Date.now()){
 const value=canonical(symbol),match=value.match(/^(SHFE|INE|DCE|CZCE|GFEX|CFFEX)\.([A-Z]{1,3})(\d{3,4})$/);
 if(!match||+match[3].slice(-2)<1||+match[3].slice(-2)>12)throw Error('需要具体月份合约');
 let month=match[3];
 if(match[1]==='CZCE'&&month.length===3){const year=new Date(now+8*3600000).getUTCFullYear();let delivery=Math.floor(year/10)*10+ +month[0];if(delivery-year>5)delivery-=10;if(year-delivery>5)delivery+=10;month=String(delivery).slice(-2)+month.slice(-2);}
 return 'nf_'+match[2]+month;
}

export function publicSession(symbol,now,days){
 const today=dateAt(now),value=(now+8*3600000)%86400000/60000,code=productCode(symbol),exchange=canonical(symbol).split('.')[0];
 if(!Array.isArray(days)||!days.length||days.at(-1)<today)return {...off,calendarMissing:true};
 const ranges=exchange==='CFFEX'?[[570,690],[780,['T','TF','TS','TL'].includes(code)?915:900]]:[[540,615],[630,690],[810,900]];
 if(days.includes(today))for(const [start,end] of ranges)if(value>=start&&value<end)return {sessionActive:true,sessionKey:today+':day:'+start,tradingDay:today};
 const base=dateAt(now-(value<360?86400000:0)),nightValue=value+(value<360?1440:0),next=days.find(day=>day>base),gap=next?(Date.parse(next)-Date.parse(base))/86400000:0;
 const end=night23.has(code)?1380:night25.has(code)?1500:night2630.has(code)?1590:null;
 if(exchange!=='CFFEX'&&exchange!=='GFEX'&&end&&days.includes(base)&&(gap===1||new Date(base).getUTCDay()===5&&gap===3)&&nightValue>=1260&&nightValue<end)return {sessionActive:true,sessionKey:base+':night',tradingDay:next};
 return off;
}

export async function loadPublicCalendar(root){
 const python=resolve(root,process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');
 const {stdout}=await exec(python,[resolve(root,'scripts/postmarket_calendar.py')],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:1024*1024});
 const value=JSON.parse(stdout);if(!Array.isArray(value.days)||!value.days.every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)))throw Error('交易日历未核验');
 return {days:[...new Set(value.days)].sort(),source:value.source};
}

// Decode data literals only. Provider JavaScript is never executed.
export function parseSinaQuotes(raw,items,now=Date.now()){
 const literals=new Map();for(const match of String(raw).matchAll(/var\s+hq_str_(nf_[A-Z]+\d+)\s*=\s*("(?:[^"\\]|\\.)*")\s*;/g)){try{literals.set(match[1],JSON.parse(match[2]));}catch{}}
 const quotes=[],missing=[];
 for(const item of items){
  const provider=sinaSymbol(item.symbol,now),text=literals.get(provider);if(!text){missing.push(item.symbol);continue;}
  const fields=text.split(','),financial=item.exchange==='CFFEX',name=financial?fields.at(-1):fields[0],day=fields[financial?36:17],clock=String(fields[financial?37:1]||'').replaceAll(':','').padStart(6,'0');
  const last=Number(fields[financial?3:8]),volume=Number(fields[financial?4:14]);
  if(!name?.endsWith(provider.slice(3).match(/\d+$/)[0])||!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!/^\d{6}$/.test(clock)||!Number.isFinite(last)||last<=0||+clock.slice(0,2)>23||+clock.slice(2,4)>59||+clock.slice(4)>59){missing.push(item.symbol);continue;}
  const quoteAt=day+'T'+clock.slice(0,2)+':'+clock.slice(2,4)+':'+clock.slice(4)+'+08:00';
  if(!Number.isFinite(Date.parse(quoteAt))||dateAt(Date.parse(quoteAt))!==day){missing.push(item.symbol);continue;}
  quotes.push({symbol:canonical(item.symbol),name,last,volume,quoteAt,source:SOURCE,providerSymbol:provider,receivedAt:new Date(now).toISOString()});
 }
 return {quotes,missing};
}

export class SinaMonitorFeed{
 constructor({root=resolve('.'),getCatalog,getCalendar=()=>loadPublicCalendar(root),fetchImpl=fetch,now=Date.now,onMessage=()=>{}}){Object.assign(this,{getCatalog,getCalendar,fetchImpl,now,onMessage});this.symbols=[];this.closed=false;this.seen=new Map();this.sequence=0;this.busy=false;this.failures=0;}
 emit(type,value){if(!this.closed)this.onMessage({type,...value});}
 subscribe(symbols){this.symbols=[...new Set(symbols.map(canonical))];this.seen.clear();this.retryAt=0;}
 async start(symbols=[]){
  this.subscribe(symbols);this.emit('status',{status:'connecting',message:'正在检查免账号公开行情',source:SOURCE,provider:'sina',intervalMs:INTERVAL});
  try{await this.refreshCalendar();await this.poll(true);}catch{this.emit('status',{status:'failed',message:'公开行情或交易日历未取得，判断暂停'});}
  if(this.closed)return;
  this.heartbeat=setInterval(()=>this.emit('heartbeat',{at:new Date(this.now()).toISOString(),subscribed:this.symbols.length,activeContracts:this.active||0}),5000);this.heartbeat.unref();
  this.timer=setInterval(()=>{if(this.now()>=(this.retryAt||0))void this.poll();},INTERVAL);this.timer.unref();
 }
 async refreshCalendar(){if(this.calendar&&this.now()-this.calendarAt<86400000)return;const value=await this.getCalendar();if(!Array.isArray(value.days)||value.days.at(-1)<dateAt(this.now()))throw Error('交易日历未覆盖当前日期');this.calendar=value.days;this.calendarAt=this.now();this.emit('status',{calendarSource:value.source});}
 async poll(probe=false){
  if(this.closed||this.busy)return;this.busy=true;
  try{
   await this.refreshCalendar();const catalog=await this.getCatalog(),items=probe?catalog:catalog.filter(item=>this.symbols.includes(canonical(item.symbol)));
   if(!items.length){this.active=0;this.emit('status',{status:'idle',message:'无启用的价格规则，采集器待命；连接检查记录见下方',subscribed:0,activeContracts:0});return;}
   this.abort=new AbortController();const timer=setTimeout(()=>this.abort.abort(),8000);let raw;
   try{const response=await this.fetchImpl('https://hq.sinajs.cn/list='+items.map(item=>sinaSymbol(item.symbol,this.now())).join(','),{headers:{Referer:'https://finance.sina.com.cn/futures/','User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'},signal:this.abort.signal});if(!response.ok)throw Error('公开行情 HTTP '+response.status);const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024)throw Error('行情响应过大');raw=new TextDecoder('gb18030').decode(bytes);}finally{clearTimeout(timer);}
   if(this.closed)return;const result=parseSinaQuotes(raw,items,this.now());if(!result.quotes.length)throw Error('未取得有效具体合约报价');
   this.failures=0;this.retryAt=0;this.active=0;const coverage={total:items.length,available:result.quotes.length,missing:result.missing,checkedAt:new Date(this.now()).toISOString()};
   if(probe)this.coverage=coverage;
   for(const quote of result.quotes){
    const current=publicSession(quote.symbol,this.now(),this.calendar),provider=publicSession(quote.symbol,Date.parse(quote.quoteAt),this.calendar),info=current.sessionActive&&provider.sessionKey===current.sessionKey?current:off;this.active+=Number(info.sessionActive);
    const signature=quote.quoteAt+':'+quote.last+':'+quote.volume;if(this.seen.get(quote.symbol)===signature)continue;this.seen.set(quote.symbol,signature);this.emit('quote',{...quote,...info,sequence:++this.sequence});
   }
   for(const symbol of result.missing)if(this.symbols.includes(symbol))this.emit('contract-status',{symbol,status:'unavailable'});
   this.emit('status',{status:'connected',message:'新浪公开行情可访问 · 每10秒检查 · '+(this.active?'当前交易时段，陈旧报价不判断':'当前休市，保留最近报价'),source:SOURCE,provider:'sina',intervalMs:INTERVAL,heartbeatAt:new Date(this.now()).toISOString(),activeContracts:this.active,subscribed:this.symbols.length,coverage:this.coverage||coverage,lastCheck:coverage,calendarSource:'现有扫描使用的AKShare交易日历'});
  }catch(error){if(!this.closed){this.failures++;this.retryAt=this.now()+Math.min(5*60000,INTERVAL*2**Math.min(this.failures,5));this.emit('status',{status:'disconnected',message:'公开行情检查失败，暂停价格判断并退避重试',reason:String(error.message).slice(0,180),lastFailureAt:new Date(this.now()).toISOString(),retryAt:new Date(this.retryAt).toISOString(),source:SOURCE,provider:'sina'});}}
  finally{this.busy=false;}
 }
 stop(){this.closed=true;clearInterval(this.timer);clearInterval(this.heartbeat);this.abort?.abort();}
}
