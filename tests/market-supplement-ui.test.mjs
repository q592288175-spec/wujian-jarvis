import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {warehousePanel,rollPanel,supplementPanel,supplementSources} from '../dist/market-supplement-ui.js';
test('仓单零值和未知增减分开，历史可展开，不伪称社会库存或已知单位',()=>{
 const dom=new JSDOM(warehousePanel({warrantHistory:{history:[{date:'2026-10-23',receipts:0,change:null}],samples:1,unit:'来源未标注单位',definition:'注册仓单，不是社会库存',dataDate:'2026-10-23',firstDate:'2026-10-23'}}));const el=dom.window.document;assert.ok(el.querySelector('details summary'));assert.match(el.body.textContent,/未取得/);assert.equal(el.querySelector('tbody td:nth-child(2)').textContent,'0');assert.match(el.body.textContent,/来源未标注单位/);
 const p={closeDate:'2026-10-24',signals:{day:{stamp:'2026-10-23'}},warrantHistory:{history:[{date:'2026-10-23',receipts:10}],dataDate:'2026-10-23'}};
 assert.doesNotMatch(warehousePanel(p),/按旧数据查看/);p.warrantHistory.dataDate='2026-10-22';assert.match(warehousePanel(p),/按旧数据查看/);
});
test('展期缺口保留HTTP原因，覆盖部分来源的状态不冒充全量完成',()=>{
 assert.match(rollPanel({rollStatus:{reason:'DCE HTTP 412，未绕过'}}),/HTTP 412/);assert.match(supplementSources([{enabled:true,status:'partial',source:'交易所日行情',rows:52,reason:'大商所未取得'}]),/部分取得/);
});
test('实际资料区同时挂接仓单与展期模块，不只导出未使用的组件',()=>{
 const doc=new JSDOM(supplementPanel({code:'M',exchange:'DCE'})).window.document;assert.equal(doc.querySelectorAll('[data-evidence]').length,2);assert.match(doc.body.textContent,/尚未取得/);
});
test('备用合约交割日不冒充最后交割日，显示查询批次及可读来源',()=>{
 const html=supplementPanel({contract:'M2701',contractInfo:{listed:'2026-01-19',lastTrade:'2027-01-15',delivery:'2027-01-20',dataDate:'2026-10-25',dateBasis:'查询批次日；源未给资料发布日期',source:'OpenCTP公开备用',sourceUrl:'http://dict.openctp.cn/instruments?types=futures'}});
 const doc=new JSDOM(html).window.document;assert.match(doc.body.textContent,/交割日 2027-01-20（源DeliveryDate；最后交割日未取得）/);assert.match(doc.body.textContent,/查询批次日/);assert.equal(doc.querySelector('a').hostname,'dict.openctp.cn');
 const unsafe=supplementPanel({contractInfo:{sourceUrl:'javascript:alert(1)'}});assert.doesNotMatch(unsafe,/href="javascript/);
});
