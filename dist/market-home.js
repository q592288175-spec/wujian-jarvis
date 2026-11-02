import {displaySectorFor,displaySectorLabels} from './display-sectors.js';
export const homeExchanges=[['SHFE','上期所'],['DCE','大商所'],['CZCE','郑商所'],['CFFEX','中金所'],['INE','能源中心'],['GFEX','广期所']];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function closeRows(products,overview){
 const map=new Map((overview?.products||[]).map(e=>[e.code,e]));
 return products.map(p=>({...p,displaySector:displaySectorFor(p),eod:map.get(p.code)||{status:'missing',reason:'收盘核验尚未完成，请同步收盘数据'}}));
}
export const usableClose=p=>p.eod?.status==='ok'&&finite(p.eod.changePct);
export function sectorHeat(rows){
 return displaySectorLabels.flatMap(name=>{
  const members=rows.filter(p=>p.displaySector===name);if(!members.length)return [];
  const valid=members.filter(usableClose),mean=valid.length?valid.reduce((s,p)=>s+p.eod.changePct,0)/valid.length:null;
  return [{name,total:members.length,count:valid.length,missing:members.length-valid.length,mean,
   up:valid.filter(p=>p.eod.changePct>0).length,down:valid.filter(p=>p.eod.changePct<0).length,flat:valid.filter(p=>p.eod.changePct===0).length}];
 });
}
export function heatColor(value){
 if(!finite(value))return '#3b4656';
 if(value===0)return '#647084';
 const level=Math.abs(value)<.5?0:Math.abs(value)<1?1:Math.abs(value)<2?2:3;
 return (value>0?['#fbd4d3','#f5a4a0','#db504e','#b8202b']:['#c8e9d7','#8dd4ac','#35a66c','#137b47'])[level];
}
export const heatInk=value=>finite(value)&&Math.abs(value)<1&&value!==0?'#15272b':'#ffffff';
export function hotProducts(rows,{exchange='all',sector='all',order='volume',limit=18}={}){
 const available=rows.filter(p=>usableClose(p)&&(exchange==='all'||p.exchange===exchange)&&(sector==='all'||p.displaySector===sector));
 const compare=order==='gainers'?(a,b)=>b.eod.changePct-a.eod.changePct:order==='losers'?(a,b)=>a.eod.changePct-b.eod.changePct:(a,b)=>(b.eod.volume||0)-(a.eod.volume||0);
 const sorted=[...available].sort((a,b)=>compare(a,b)||a.code.localeCompare(b.code));
 if(order!=='volume'||exchange!=='all'||sector!=='all')return sorted.slice(0,limit);
 const included=new Set(homeExchanges.flatMap(([key])=>sorted.filter(p=>p.exchange===key).slice(0,2).map(p=>p.code)));
 for(const p of sorted){if(included.size>=limit)break;included.add(p.code)}
 return sorted.filter(p=>included.has(p.code)).slice(0,limit);
}
export function treemapOption(groups,{selected='all'}={}){
 const pct=n=>finite(n)?`${n>0?'+':''}${n.toFixed(2)}%`:'待核验';
 return {animation:false,backgroundColor:'#0c151f',tooltip:{trigger:'item',confine:true,backgroundColor:'#152334',borderWidth:0,textStyle:{color:'#f4f7fc'},formatter:p=>{
  const d=p.data;return `${d.name}<br>等权收盘涨跌 ${pct(d.mean)}<br>有效 ${d.count} / ${d.total} · 涨 ${d.up} 跌 ${d.down} 平 ${d.flat}<br>点击筛选右侧品种`;
 }},graphic:groups.length?[]:[{type:'text',left:'center',top:'middle',style:{text:'当前筛选没有品种',fill:'#a9bdd2',fontSize:16}}],series:[{type:'treemap',animation:false,animationDurationUpdate:0,roam:false,nodeClick:false,breadcrumb:{show:false},silent:false,left:0,right:0,top:0,bottom:0,sort:null,
  leafDepth:1,visibleMin:0,squareRatio:1.25,upperLabel:{show:false},itemStyle:{borderWidth:0,gapWidth:3,borderColor:'#0c151f'},
  label:{show:true,position:'inside',formatter:p=>p.data?.name?`${p.data.name}\n${pct(p.data.mean)}\n${p.data.count}/${p.data.total} 品种`:'',fontFamily:'Microsoft YaHei',fontSize:16,fontWeight:650,lineHeight:26,overflow:'break'},
  emphasis:{itemStyle:{borderWidth:2,borderColor:'#ffffff'}},
  data:groups.map(g=>({...g,value:Math.max(4,g.total),itemStyle:{color:heatColor(g.mean),borderWidth:selected===g.name?3:0,borderColor:selected===g.name?'#ffffff':'#0c151f'},label:{color:heatInk(g.mean)}}))}]};
}
