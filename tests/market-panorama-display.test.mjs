import test from 'node:test';
import assert from 'node:assert/strict';
import {sortPanoramaProducts,sortPanoramaComparison,panoramaSectorFor,panoramaSectors} from '../dist/market-panorama-display.js';
import {fireDisplaySectors} from '../dist/fire-display.js';

test('panorama product order matches Xiaomu sectors and within-sector order',()=>{
 const codes=fireDisplaySectors.flatMap(([,products])=>products.split(' '));
 const rows=[...codes].reverse().map((code,index)=>({code,amount:index}));const before=[...rows];
 assert.deepEqual(sortPanoramaProducts(rows).map(row=>row.code),codes);assert.deepEqual(rows,before);
 assert.deepEqual(sortPanoramaProducts(['AP','FU','LC','AU','CU','IF','TS','RB','FG','A','EC'].map(code=>({code}))).map(row=>row.code),['IF','TS','AU','CU','LC','RB','FG','FU','A','AP','EC']);
});
test('panorama uses eleven shared display groups without changing rule taxonomy',()=>{
 assert.deepEqual(panoramaSectors,['股指','国债','贵金属','有色','新能源','黑色系','能源','化工','农产品','农副产品','其他']);
 for(const [code,label] of [['IF','股指'],['TL','国债'],['FG','黑色系'],['SA','黑色系'],['FU','能源'],['MA','化工'],['AP','农副产品'],['EC','其他'],['UNKNOWN','其他']])assert.equal(panoramaSectorFor({code}),label);
 assert.ok(fireDisplaySectors.some(([label])=>label==='黑色系'));
});
test('comparison gainers and losers preserve data and put missing percentages last',()=>{
 const rows=[{code:'AP',changePct:-3},{code:'FU',changePct:2},{code:'IF',changePct:2},{code:'CU',changePct:null}],before=structuredClone(rows);
 assert.deepEqual(sortPanoramaComparison(rows).map(p=>p.code),['IF','CU','FU','AP']);
 assert.deepEqual(sortPanoramaComparison(rows,'gainers').map(p=>p.code),['IF','FU','AP','CU']);
 assert.deepEqual(sortPanoramaComparison(rows,'losers').map(p=>p.code),['AP','IF','FU','CU']);assert.deepEqual(rows,before);
});
test('product order handles contract aliases and preserves unknown products at the end',()=>{
 const rows=[{code:'NEW1'},{symbol:'SHFE.fu2701'},{code:'OTHER'},{code:'IF'}];
 assert.deepEqual(sortPanoramaProducts(rows),[rows[3],rows[1],rows[0],rows[2]]);
});
