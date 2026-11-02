// Display taxonomy only; does not change trading-system risk buckets or research frameworks.
export const sectorGroups=[
 {key:'finance',label:'股指/国债',products:'IH IF IC IM TS TF T TL'},
 {key:'precious',label:'贵金属',products:'AU AG PT PD'},
 {key:'nonferrous',label:'有色金属',products:'CU AL AO AD PB ZN SN NI SS BC'},
 {key:'new-energy',label:'新能源金属',products:'LC SI PS'},
 {key:'black',label:'黑色/建材',products:'I RB HC JM J SM SF FG LG WR FB BB'},
 {key:'chemical',label:'能源化工',products:'SC FU LU PG BU UR SA SH MA EG TA PX V EB PP PR BZ PL L PF RU BR NR SP OP ZC'},
 {key:'agriculture',label:'农产品',products:'P Y OI M RM C CS LH JD SR CF AP PK CJ A B RR CY RS WH JR RI LR'},
 {key:'shipping',label:'航运',products:'EC'}
];
export const sectors=sectorGroups.map(group=>group.label);
const lookup=new Map(sectorGroups.flatMap(group=>group.products.split(' ').map(product=>[product,group.label])));
const legacyLabels={'金融-股指':'股指/国债','金融-国债':'股指/国债','股指国债':'股指/国债','贵金属板块':'贵金属','有色板块':'有色金属','新能源':'新能源金属','黑色':'黑色/建材','建材':'黑色/建材','黑色系板块':'黑色/建材','能源化工板块':'能源化工','农产品板块':'农产品','其他/航运':'航运'};
export function sectorFor(q={}){
 const product=String(q.code||q.symbol||q.main_contract||q.actualContract||'').split('.').pop().replace(/\d+$/,'').toUpperCase();
 return lookup.get(product)||legacyLabels[q.sector]||(sectors.includes(q.sector)?q.sector:'待分类');
}
export function groupedQuotes(quotes){return [...sectors,'待分类'].map(name=>({name,quotes:quotes.filter(q=>sectorFor(q)===name)}));}
