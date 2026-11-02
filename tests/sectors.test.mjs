import test from 'node:test';
import assert from 'node:assert/strict';
import {sectorGroups,sectors,sectorFor,groupedQuotes} from '../dist/sectors.js';

const universe='AU AG PT PD CU AL ZN PB NI SN AO AD BC LC SI PS I J JM RB HC SS SF SM WR ZC FG SA FB BB LG SC FU LU BU PG RU NR BR TA PX PF PR MA SH UR L V PP EG EB BZ PL SP OP A B M Y P C CS RR JD LH SR CF CY AP CJ OI RM PK RS WH JR RI LR EC IF IH IC IM T TF TS TL'.split(' ');

test('八类分类完整且互斥覆盖87品种，截图之外的品种也保留',()=>{
 const codes=sectorGroups.flatMap(group=>group.products.split(' '));
 assert.equal(codes.length,87);
 assert.equal(new Set(codes).size,87);
 assert.deepEqual([...codes].sort(),[...universe].sort());
 const groups=groupedQuotes(universe.map(code=>({symbol:code.toLowerCase()+'0'})));
 assert.equal(groups.find(group=>group.name==='待分类').quotes.length,0);
 assert.equal(groups.reduce((sum,group)=>sum+group.quotes.length,0),87);
 assert.deepEqual(sectors,['股指/国债','贵金属','有色金属','新能源金属','黑色/建材','能源化工','农产品','航运']);
});

test('已知品种代码优先于旧板块标签，大小写、具体合约、连续合约口径一致',()=>{
 const examples={SS:'有色金属',SA:'能源化工',LC:'新能源金属',SI:'新能源金属',PS:'新能源金属',FG:'黑色/建材',LG:'黑色/建材',EC:'航运',ZC:'能源化工',BC:'有色金属'};
 for(const [code,label] of Object.entries(examples)){
  assert.equal(sectorFor({code,sector:'黑色'}),label);
  assert.equal(sectorFor({symbol:'SHFE.'+code.toLowerCase()+'2611'}),label);
  assert.equal(sectorFor({main_contract:code+'2701'}),label);
 }
 assert.equal(sectorFor({symbol:'UNKNOWN0'}),'待分类');
 assert.equal(sectorFor({sector:'其他/航运'}),'航运');
});
