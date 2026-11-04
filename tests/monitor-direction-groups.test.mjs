import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {monitorDirectionGroups,renderMonitorDirectionPicker,renderTrendUniverse} from '../dist/trend-monitor-ui.js';
import {fireStrengthTones} from '../dist/fire-display.js';
const rows=[{code:'CU',name:'沪铜',signals:{}},{code:'MA',name:'甲醇',signals:{}},{code:'AU',name:'黄金',signals:{}},{code:'SI',name:'工业硅',signals:{}}];
const scan={rows:[{code:'CU',modes:{'month-week-day':'多头观察','week-day':'多头观察'},month_direction:'上升',week_direction:'上升',day_direction:'上升',month_ma10:101,previous_month_ma10:100,week_ma10:105,previous_week_ma10:100,day_ma10:108,previous_day_ma10:100},{code:'MA',modes:{'month-week-day':'空头观察','week-day':'空头观察'},month_direction:'下降',week_direction:'下降',day_direction:'下降',month_ma10:99,previous_month_ma10:100,week_ma10:95,previous_week_ma10:100,day_ma10:92,previous_day_ma10:100},{code:'AU',modes:{'month-week':'多头观察','day-trend':'空头观察'},week_direction:'上升',day_direction:'下降'},{code:'SI',modes:{'day-trend':'空头观察'},month_direction:'上升',week_direction:'下降',day_direction:'下降'}]};
test('每个周期直接沿用火多空；全部品种中的多空矛盾单列，不重复放入两边',()=>{
 const g=monitorDirectionGroups(rows,scan,'month-week-day');assert.deepEqual(g.long.map(r=>r.code),['CU']);assert.deepEqual(g.short.map(r=>r.code),['MA']);assert.equal(g.neutral.length,0);const a=monitorDirectionGroups(rows,scan);assert.deepEqual(a.neutral.map(r=>r.code),['AU']);assert.equal(a.long.length+a.short.length+a.neutral.length,rows.length);assert.equal(a.short.find(r=>r.code==='SI').flaw,'月线反向');assert.match(a.long[0].structure,/主线待核验/);
});
test('多头在上、空头在下；色阶复用火，不重算分数；保留关注按钮，分歧为空时不占一行',()=>{
 const html=renderMonitorDirectionPicker(rows,scan,'month-week-day',new Set(['MA'])),dom=new JSDOM(html),doc=dom.window.document;
 assert.ok(html.indexOf('多头观察')<html.indexOf('空头观察'));assert.equal(doc.querySelector('[data-tm-follow="MA"]').getAttribute('aria-pressed'),'true');assert.equal(doc.querySelector('[data-tm-follow="CU"]').getAttribute('aria-pressed'),'false');assert.equal(doc.querySelectorAll('[data-tm-direction-group="neutral"]').length,0);
 const expected=fireStrengthTones(scan.rows,'month-week-day').get(scan.rows[0]);assert.ok(doc.querySelector('[data-tm-follow="CU"]').closest('.tm-direction-chip').classList.contains('tm-strength-'+expected));assert.doesNotMatch(html,/优先主线候选|已确认主线/);
});
test('下面的EMA10表也按多空分组，警报和周期勾选仍保留',()=>{
 const source=[rows[1],rows[0]],groups=monitorDirectionGroups(source,scan,'month-week-day'),doc=new JSDOM(renderTrendUniverse(source,{directionGroups:groups,periodTask:{bigPeriods:['1w','1d'],smallPeriods:['30m']}})).window.document;
 assert.deepEqual([...doc.querySelectorAll('[data-tm-row]')].map(e=>e.dataset.tmRow),['CU','MA']);assert.equal(doc.querySelectorAll('.tm-table-group').length,2);assert.equal(doc.querySelector('[data-tm-period="1w"]').checked,true);assert.equal(doc.querySelector('[data-tm-period="30m"]').checked,true);
});
