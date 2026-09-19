// Display taxonomy only; does not change trading-system risk buckets.
export const sectors=['股指国债','贵金属板块','有色板块','黑色系板块','能源化工板块','农产品板块'];
const groups={
 '股指国债':'IC IF IH IM T TF TL TS',
 '贵金属板块':'au ag pt pd',
 '有色板块':'cu al zn pb ni sn ao ad bc lc si ps',
 '黑色系板块':'rb hc ss wr i j jm SF SM',
 '能源化工板块':'FG MA PF PL PR PX SA SH TA UR ZC bz eb eg l pg pp v sc lu nr ec br bu fu ru sp op',
 '农产品板块':'AP CF CJ CY JR LR OI PK PM RI RM RS SR WH a b bb c cs fb lg jd lh m p rr y'
};
const lookup=new Map(Object.entries(groups).flatMap(([sector,products])=>products.split(' ').map(p=>[p,sector])));
export function sectorFor(q){const product=(q.symbol||'').split('.').pop().replace(/\d+$/,'');return lookup.get(product)||'待分类';}
export function groupedQuotes(quotes){return [...sectors,'待分类'].map(name=>({name,quotes:quotes.filter(q=>sectorFor(q)===name)}));}
