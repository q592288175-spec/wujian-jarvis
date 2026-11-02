// Presentation helpers only; no trading eligibility, balances or risk parameters.
import {sortPanoramaProducts} from './market-panorama-display.js';

export function orderedRows(rows,key,ascending=false){
 const ordered=rows.every(r=>typeof r.code==='string')?sortPanoramaProducts(rows):[...rows];
 if(!key||key==='code')return ascending?[...ordered].reverse():ordered;
 return ordered.sort((a,b)=>{const x=a[key],y=b[key];if(x==null)return y==null?0:1;if(y==null)return-1;const value=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'zh');return ascending?value:-value});
}

export function visibleMembers(history,group,selected){
 const all=[...new Set(history.flatMap(h=>h.pairs.filter(p=>group==='all'||p.groups.includes(group)).map(p=>p.member)))];
 const eligible=selected.size?all.filter(m=>selected.has(m)):all;
 return {all,eligible,shown:selected.size?eligible:eligible.slice(0,12),explicit:!!selected.size};
}

const lineColors=['#b6332f','#246e50','#2564a2','#946a12','#7250a5','#06787d','#a13276','#63721d','#aa4d13','#3a53a8','#74605a','#367d28'];
const styles=new Map(),occupied=new Set(),lineTypes=['solid','dashed','dotted',[8,3],[3,3],[10,3,2,3],[5,2,1,2],[12,4],[2,4],[6,3,2,3],[14,3,3,3],[4,2],[10,4,2,4]];
export function seriesStyle(name){
 if(styles.has(name))return styles.get(name);
 let hash=2166136261;for(const ch of String(name))hash=Math.imul(hash^ch.codePointAt(0),16777619)>>>0;
 const count=lineColors.length*lineTypes.length;let slot=hash%count;
 for(let i=0;i<count&&occupied.has(slot);i++)slot=(slot+1)%count;
 occupied.add(slot);const value={color:lineColors[slot%lineColors.length],type:lineTypes[Math.floor(slot/lineColors.length)]};styles.set(name,value);return value;
}

export function seatGap(p){
 if(!p.pairs.length)return '该观察组未取得样本';
 if(!p.pairs.some(x=>x.delta!==null))return '缺少可比双侧仓差';
 if(!p.pairs.some(x=>x.amountChange!==null))return '金额缺结算价或合约参数';
 return '';
}
