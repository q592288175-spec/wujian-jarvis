// 放到 tests/display-sectors.test.mjs 使用（路径按项目 tests/ 目录写）。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {displaySectors,displaySectorLabels,displaySectorFor,displaySectorIndex} from '../dist/display-sectors.js';
import {sectorGroups,sectorFor} from '../dist/sectors.js';
import {strengthSectorFor,strengthSectors} from '../dist/market-panorama-strength.js';

const codes=[...new Set(sectorGroups.flatMap(group=>group.products.split(' ')))];

test('87 个品种各自只属于一个显示分类，数量固定',()=>{
 assert.equal(codes.length,87);
 const seen=new Map();
 for(const sector of displaySectors)for(const code of sector.products.split(' ')){assert.ok(!seen.has(code),`${code} 重复出现在 ${seen.get(code)} 和 ${sector.label}`);seen.set(code,sector.label)}
 assert.deepEqual([...seen.keys()].sort(),[...codes].sort(),'显示分类与 sectors.js 的品种全集必须一致');
 const counts=Object.fromEntries(displaySectors.map(sector=>[sector.label,sector.products.split(' ').length]));
 assert.deepEqual(counts,{股指:4,国债:4,贵金属:4,有色:10,新能源:3,黑色系:14,能源:4,化工:20,农产品:15,农副产品:8,其他:1});
});
test('显示分类顺序与市场全景已验收的顺序一致',()=>{
 assert.deepEqual(displaySectorLabels,['股指','国债','贵金属','有色','新能源','黑色系','能源','化工','农产品','农副产品','其他']);
 assert.deepEqual(displaySectorLabels,strengthSectors);
});
test('与市场全景现行行为逐品种一致',()=>{
 for(const code of codes)assert.equal(displaySectorFor({code}),strengthSectorFor({code}),code);
});
test('与 8 类规则分类的差异只有 SA、ZC 两个品种跨类，其余都是细分',()=>{
 const parent={股指:'股指/国债',国债:'股指/国债',贵金属:'贵金属',有色:'有色金属',新能源:'新能源金属',黑色系:'黑色/建材',能源:'能源化工',化工:'能源化工',农产品:'农产品',农副产品:'农产品',其他:'航运'};
 const cross=codes.filter(code=>parent[displaySectorFor({code})]!==sectorFor({code})).sort();
 assert.deepEqual(cross,['SA','ZC']);
});
test('未知品种归入其他，排序序号落在最后',()=>{
 assert.equal(displaySectorFor({code:'ZZZ'}),'其他');
 assert.equal(displaySectorIndex({code:'ZZZ'}),displaySectors.length-1);
 assert.equal(displaySectorFor('CZCE.MA2701'),'化工');
});
test('sectors.js 是板块环境指数的成分来源，内容哈希冻结，任何改动须经五简确认',()=>{
 const hash=createHash('sha256').update(readFileSync(new URL('../dist/sectors.js',import.meta.url))).digest('hex');
 assert.equal(hash,'62cd2b579cf6fab3b93f91d828f1f38443871ac187ae86a1a3fe17d68114947a');
});
