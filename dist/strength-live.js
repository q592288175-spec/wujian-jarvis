/** Display-only comparison helpers. No candidate or trading rules live here. */
import {quoteSession} from './market-intraday.js';
export const STRENGTH_REFRESH_MS=30000;
export const strengthPalette=['#ee8454','#5c9f7d','#7eb7df','#6267ce','#d777cf','#f2c860','#9a65b9','#df6b6f','#a1c878','#43a5b0','#bd8058','#587fbb','#b65c97','#7b9760','#8a73bd','#c09a3f','#3e8d92','#b96b58','#609abf','#a58fba'];
const colors=new Map();
export function strengthColor(code){
 if(!colors.has(code)){const i=colors.size;colors.set(code,i<strengthPalette.length?strengthPalette[i]:`hsl(${Math.round((i*137.508)%360)} 48% 48%)`)}
 return colors.get(code);
}
export function labelInk(color){
 if(!/^#[0-9a-f]{6}$/i.test(color))return '#ffffff';
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
 return lum>.25?'#182b43':'#ffffff';
}
function prepareCurveColors(codes){
 const used=new Set(),waiting=[];
 for(const code of codes){const color=colors.get(code);if(strengthPalette.includes(color)&&!used.has(color))used.add(color);else waiting.push(code)}
 for(const code of waiting){const color=strengthPalette.find(c=>!used.has(c))||`hsl(${Math.round((used.size*137.508)%360)} 48% 48%)`;colors.set(code,color);used.add(color)}
}
// Display-only sessions, matched against the existing publicSession in tests.
// The verified API supplies the trading day and night opening; do not infer a holiday calendar here.
const night23=new Set('RB HC FU BU RU BR SP OP NR LU A B C CS M Y P I J JM L V PP EG EB PG RR BZ CF CY TA OI RM SR MA FG SA PF ZC SH PX PR PL'.split(' '));
const night25=new Set('CU BC AL AO ZN PB NI SN SS AD'.split(' '));
const night2630=new Set(['AU','AG','SC']);
const stampAt=ms=>new Date(ms+28800000).toISOString().slice(0,19).replace('T',' ');
export function strengthTradingIntervals(row){
 const d=row.intraday;
 if(d?.basisKey!=='session-open'||d.code!==row.code||d.contract!==row.contract||!/^\d{4}-\d{2}-\d{2}$/.test(d.tradingDay||'')||!Number.isFinite(stampMs(d.baselineAt))||!['SHFE','INE','DCE','CZCE','GFEX','CFFEX'].includes(row.exchange))return [];
 const start=stampMs(d.baselineAt),day=stampMs(d.tradingDay+' 00:00:00'),ranges=[];
 if(d.session?.hasNight){
  const minutes=night23.has(row.code)?120:night25.has(row.code)?240:night2630.has(row.code)?330:null;
  if(!minutes||row.exchange==='GFEX'||row.exchange==='CFFEX'||d.baselineAt.slice(11)!=='21:00:00')return [];
  ranges.push([start,start+minutes*60000]);
 }
 const dayRanges=row.exchange==='CFFEX'?[[570,690],[780,['T','TF','TS','TL'].includes(row.code)?915:900]]:[[540,615],[630,690],[810,900]];
 ranges.push(...dayRanges.map(([a,b])=>[day+a*60000,day+b*60000]));
 return ranges.map(([a,b])=>({start:stampAt(a),end:stampAt(b)}));
}
export function strengthTimeline(rows){
 const actual=rows.flatMap(p=>p.points.map(v=>v.stamp)).sort(),first=actual[0],last=actual.at(-1);
 if(!first)return [];
 // Session boundaries retain a horizontal edge right up to reopening, then the real price jump.
 return [...new Set([...actual,...rows.flatMap(strengthTradingIntervals).flatMap(s=>[s.start,s.end]).filter(t=>t>=first&&t<=last)])].sort();
}
function restValues(row,x,map){
 const intervals=strengthTradingIntervals(row);
 return x.map(t=>{
  if(map.has(t))return map.get(t);
  const previous=intervals.findLast(s=>s.end<t);
  if(!previous||!Number.isFinite(map.get(previous.end))||t>row.intraday.tradingDay+' 18:00:00')return null;
  // Missing observations in an open session must stay missing. Never borrow the next price.
  if(intervals.some(s=>t>s.start&&t<=s.end))return null;
  return {value:map.get(previous.end),displayOnly:'休市延续',sourceStamp:previous.end};
 });
}
export function strengthTooltip(params){
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return escape(params[0]?.axisValueLabel||params[0]?.axisValue||'')+params.filter(p=>Number.isFinite(typeof p.data==='object'?p.data?.value:p.value)).map(p=>{
  const held=p.data?.displayOnly==='休市延续',value=typeof p.data==='object'?p.data.value:p.value;
  return '<br>'+(p.marker||'')+escape(p.seriesName)+'　'+(value>0?'+':'')+value.toFixed(2)+'%'+(held?' <span style="color:#52627a">休市延续 · 最后成交 '+escape(p.data.sourceStamp)+'</span>':'');
 }).join('');
}
export function strengthLines(rows,x){
 const number=v=>typeof v==='object'?v?.value:v;
 const values=rows.map(p=>{const map=new Map(p.points.filter(v=>Number.isFinite(v.value)).map(v=>[v.stamp,v.value]));return {...p,values:restValues(p,x,map)}}).filter(p=>p.values.some(v=>Number.isFinite(number(v))));
 values.sort((a,b)=>number(b.values.findLast(v=>Number.isFinite(number(v))))-number(a.values.findLast(v=>Number.isFinite(number(v))))||a.code.localeCompare(b.code));
 prepareCurveColors(values.map(p=>p.code));
 return values.map((p,i)=>{const color=strengthColor(p.code),name=p.code+' '+p.name;return {id:p.code,name,type:'line',symbol:'none',connectNulls:false,data:p.values,lineStyle:{color,width:2.2,type:'solid'},itemStyle:{color},emphasis:{focus:'series',lineStyle:{width:3.5}},endLabel:{show:true,formatter:String(i+1).padStart(2,'0')+' '+name,color:labelInk(color),backgroundColor:color,borderRadius:3,padding:[4,6],fontSize:12,fontWeight:700,distance:10,valueAnimation:false},labelLayout:{moveOverlap:'shiftY',hideOverlap:false}}});
}
const stampMs=stamp=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp||'')?Date.parse(stamp.replace(' ','T')+'+08:00'):NaN;
/** Exactly five minutes, same contract, six uninterrupted minute observations. */
export function fiveMinuteMove(product,data,{cutoff=product.priceTime}={}){
 if(!data)return {status:'missing',reason:product.intradayError||'分钟数据未取得'};
 if(!data||data.contract!==product.contract||data.code!==product.code)return {status:'missing',reason:'主力合约不一致或分钟数据未取得'};
 const points=[...new Map((data.points||[]).filter(p=>Number.isFinite(p.value)&&p.value> -100&&Number.isFinite(stampMs(p.stamp))&&p.stamp<=cutoff).map(p=>[p.stamp,p])).values()].sort((a,b)=>a.stamp.localeCompare(b.stamp));
 const last=points.at(-1),window=points.slice(-6);
 if(!last||window.length<6)return {status:'missing',reason:'不足5分钟样本'};
 if(stampMs(cutoff)-stampMs(last.stamp)>120000)return {status:'missing',reason:'分钟行情滞后超过2分钟'};
 if(window.some((p,i)=>i>0&&stampMs(p.stamp)-stampMs(window[i-1].stamp)!==60000))return {status:'missing',reason:'跨休市或分钟样本不连续'};
 return {status:'ok',value:((100+last.value)/(100+window[0].value)-1)*100,from:window[0].stamp,asOf:last.stamp,contract:data.contract,source:data.source};
}
export function fiveMinuteLeaders(rows,{cutoff,limit=5}={}){
 const computed=rows.map(p=>({...p,movement5:fiveMinuteMove(p,p.intraday,{cutoff:cutoff||p.priceTime})})),valid=computed.filter(p=>p.movement5.status==='ok');
 return {up:valid.filter(p=>p.movement5.value>0).sort((a,b)=>b.movement5.value-a.movement5.value||a.code.localeCompare(b.code)).slice(0,limit),down:valid.filter(p=>p.movement5.value<0).sort((a,b)=>a.movement5.value-b.movement5.value||a.code.localeCompare(b.code)).slice(0,limit),valid:valid.length,total:rows.length,missing:computed.filter(p=>p.movement5.status!=='ok').map(p=>({code:p.code,reason:p.movement5.reason}))};
}
export function strengthAutoReady({auto,playing,replayMode,date,today,lastLoadedAt,now=Date.now()}){return auto&&!playing&&!replayMode&&date===today&&now-lastLoadedAt>=STRENGTH_REFRESH_MS-500}

export function openComparisonRows(products,series,{date,cutoff}={}){
 return products.map(p=>{
  const d=series.get([date,p.code,p.contract].join('|')),end=cutoff||p.priceTime;
  const point=d?.basisKey==='session-open'&&d.baseline>0&&d.contract===p.contract?d.points.filter(x=>x.stamp<=end).at(-1):null;
  const fresh=point&&stampMs(end)-stampMs(point.stamp)<=120000;
  return {...p,openChangePct:fresh?point.value:null,openChangeAmount:fresh?(point.price??d.baseline*(1+point.value/100))-d.baseline:null,comparisonAsOf:fresh?point.stamp:null,openingAt:d?.baselineAt||null,openingPrice:d?.baseline||null,comparisonTradingDay:d?.tradingDay||null};
 });
}
export function openQuoteLeaders(products,series,{date,cutoff,limit=6}={}){
 const all=openComparisonRows(products,series,{date,cutoff}).filter(p=>Number.isFinite(p.openChangePct)&&p.priceType==='具体合约最新价'&&p.priceTime?.slice(0,10)===date),session=quoteSession(all.map(p=>p.comparisonAsOf).sort().at(-1));
 const rows=all.filter(p=>quoteSession(p.comparisonAsOf)===session).sort((a,b)=>b.openChangePct-a.openChangePct||a.code.localeCompare(b.code)),strong=rows.slice(0,limit),used=new Set(strong.map(p=>p.code)),weak=[...rows].reverse().filter(p=>!used.has(p.code)).slice(0,limit);
 return {strong,weak,total:rows.length,session};
}
export function openObservationPool(products,series,options){
 const q=openQuoteLeaders(products,series,options),tag=(rows,side)=>rows.map(p=>({...p,observation:{pool:'quote',side,label:side==='long'?'开盘相对强':'开盘相对弱',tag:side==='long'?'强':'弱',date:p.comparisonTradingDay}}));
 const long=tag(q.strong,'long'),short=tag(q.weak,'short');return {key:'quote',label:'开盘强弱',long,short,rows:[...long,...short],total:q.total,stale:0};
}
