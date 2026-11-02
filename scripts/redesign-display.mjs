import {readFile,writeFile} from 'node:fs/promises';
import {backupFiles,replaceFile} from './redesign-files.mjs';
const files=['dist/fire-display.js','dist/market-panorama-display.js','dist/market-panorama-strength.js','dist/cockpit-data.js','dist/workbench.js','dist/cockpit-workbench.js','dist/cockpit-grid.css','dist/globe-palette.js'];await backupFiles('stage2',files);
await replaceFile('dist/fire-display.js',[["import {sectors,sectorFor} from './sectors.js';","import {displaySectors,displaySectorFor,displaySectorIndex} from './display-sectors.js';"]]);
let s=await readFile('dist/fire-display.js','utf8');const start=s.indexOf('export const fireDisplaySectors='),end=s.indexOf('\nexport function fireStrengthTones',start);
s=s.slice(0,start)+`export const fireDisplaySectors=displaySectors.map(s=>[s.label,s.products]);
export function fireDisplaySector(row){return {index:displaySectorIndex(row),label:displaySectorFor(row)}}
export const isFireCandidate=(row,mode)=>['多头观察','空头观察'].includes(row?.modes?.[mode]);
`+s.slice(end);
s=s.replace('const rank=row=>{const index=sectors.indexOf(sectorFor(row));return index<0?sectors.length:index};','const rank=row=>displaySectorIndex(row);');await writeFile('dist/fire-display.js',s);
await writeFile('dist/market-panorama-display.js',`import {displaySectorLabels,displaySectorFor,displayProductOrder,displayProductCode} from './display-sectors.js';
export const panoramaSectors=displaySectorLabels;
export const panoramaSectorFor=displaySectorFor;
export function sortPanoramaProducts(rows){return rows.map((row,index)=>({row,index,rank:displayProductOrder.get(displayProductCode(row))??displayProductOrder.size})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(x=>x.row)}
export function sortPanoramaComparison(rows,mode='default'){const sorted=sortPanoramaProducts(rows);if(mode==='default')return sorted;return sorted.sort((a,b)=>{const x=a.changePct,y=b.changePct;if(!Number.isFinite(x))return Number.isFinite(y)?1:0;if(!Number.isFinite(y))return-1;return mode==='losers'?x-y:y-x})}
`);
s=await readFile('dist/market-panorama-strength.js','utf8');const a=s.indexOf('export const strengthSectors='),b=s.indexOf('\nexport function trendEvidence',a);s="import {displaySectorLabels,displaySectorFor} from './display-sectors.js';\n"+s.slice(0,a)+`export const strengthSectors=displaySectorLabels;
export const strengthSectorFor=displaySectorFor;
`+s.slice(b);await writeFile('dist/market-panorama-strength.js',s);
await replaceFile('dist/cockpit-data.js',[["import {sectorGroups,sectorFor} from './sectors.js';","import {displaySectors as sectorGroups,displaySectorFor as sectorFor} from './display-sectors.js';\nimport {isFireCandidate} from './fire-display.js';"],["return ['多头观察','空头观察'].includes(row?.modes?.[mode]);","return isFireCandidate(row,mode);"]]);
for(const path of ['dist/workbench.js','dist/cockpit-workbench.js'])await replaceFile(path,[["import {sectorFor} from './sectors.js';","import {displaySectorFor as sectorFor} from './display-sectors.js';"]]);
await replaceFile('dist/globe-palette.js',[["export function globeSelection(key,previous='all'){","export const globePaletteKey=key=>({index:'finance',bond:'finance',energy:'chemical',sideline:'agriculture',other:'shipping'}[key]||key);\nexport function globeSelection(key,previous='all'){\n key=globePaletteKey(key);"]]);
s=await readFile('dist/cockpit-workbench.js','utf8');s=s.replace("import {GLOBE_PALETTE} from './globe-palette.js';","import {GLOBE_PALETTE,globePaletteKey} from './globe-palette.js';");s=s.replace('color.key===item.key','color.key===globePaletteKey(item.key)');await writeFile('dist/cockpit-workbench.js',s);
await writeFile('dist/cockpit-grid.css',(await readFile('dist/cockpit-grid.css','utf8'))+'\n.cockpit .sector-nav{grid-template-columns:repeat(4,minmax(0,1fr));}\n');
console.log('阶段2：统一显示来源；规则三文件未写入');
