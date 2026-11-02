import {displaySectorLabels,displaySectorFor,displayProductOrder,displayProductCode} from './display-sectors.js';
export const panoramaSectors=displaySectorLabels;
export const panoramaSectorFor=displaySectorFor;
export function sortPanoramaProducts(rows){return rows.map((row,index)=>({row,index,rank:displayProductOrder.get(displayProductCode(row))??displayProductOrder.size})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(x=>x.row)}
export function sortPanoramaComparison(rows,mode='default'){const sorted=sortPanoramaProducts(rows);if(mode==='default')return sorted;return sorted.sort((a,b)=>{const x=a.changePct,y=b.changePct;if(!Number.isFinite(x))return Number.isFinite(y)?1:0;if(!Number.isFinite(y))return-1;return mode==='losers'?x-y:y-x})}
