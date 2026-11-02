// 界面“显示分类”的唯一来源（2026-10-25 起）：只用于界面显示、筛选、排序和板块统计。
// 与 sectors.js 的区别：sectors.js 的 8 类是“板块环境指数”的成分来源（integrations/environment.mjs 用它合成板块等权参考指数，
// 进入金页环境判断和环境哈希），属于交易规则输入，本模块不得改动、也不得替代它。
// 成员与顺序等同于 2026-10-24 市场全景已验收的 11 类（fire-display.js 的 fireDisplaySectors，
// 加 market-panorama-display.js 的 建材→黑色系、航运→其他，加 market-panorama-strength.js 的 能源化工→能源/化工）。
export const displaySectors=[
 {key:'index',label:'股指',products:'IH IF IC IM'},
 {key:'bond',label:'国债',products:'TS TF T TL'},
 {key:'precious',label:'贵金属',products:'AU AG PT PD'},
 {key:'nonferrous',label:'有色',products:'CU AL AO AD PB ZN SN NI SS BC'},
 {key:'new-energy',label:'新能源',products:'LC SI PS'},
 {key:'black',label:'黑色系',products:'I RB HC JM J SM SF WR ZC FG SA LG FB BB'},
 {key:'energy',label:'能源',products:'SC FU LU PG'},
 {key:'chemical',label:'化工',products:'BU UR SH MA EG TA PX V EB PP PR BZ PL L PF RU BR NR SP OP'},
 {key:'agriculture',label:'农产品',products:'P Y OI M RM C CS A B RR RS WH JR RI LR'},
 {key:'sideline',label:'农副产品',products:'LH JD SR CF AP PK CJ CY'},
 {key:'other',label:'其他',products:'EC'}
];
export const displaySectorLabels=displaySectors.map(item=>item.label);
const lookup=new Map(displaySectors.flatMap((sector,index)=>sector.products.split(' ').map(code=>[code,{...sector,index}])));
// 品种在界面里的默认排列顺序：先按显示分类，再按上面 products 里的先后。
export const displayProductOrder=new Map(displaySectors.flatMap(sector=>sector.products.split(' ')).map((code,index)=>[code,index]));
export const displayProductCode=row=>String(row?.code||row?.symbol||row?.main_contract||row?.actualContract||row||'').split('.').pop().replace(/\d+$/,'').toUpperCase();
export function displaySectorFor(row){return lookup.get(displayProductCode(row))?.label||'其他'}
export function displaySectorIndex(row){return lookup.get(displayProductCode(row))?.index??displaySectors.length-1}
export function displaySectorKey(row){return lookup.get(displayProductCode(row))?.key||'other'}
