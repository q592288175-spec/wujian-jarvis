import {mkdirSync,mkdtempSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
export function planFixture(project=resolve('.')){
 mkdirSync(join(project,'.runtime/test-plan-lifecycle'),{recursive:true});
 const root=mkdtempSync(join(project,'.runtime/test-plan-lifecycle/run-'));
 const files=['scripts/fire_scan.py','docs/fire-resonance-rule-v2.6.md','docs/automatic-environment.md','docs/system-run.md','integrations/five-workbench.mjs','integrations/team-governance.mjs','integrations/trade-ledger.mjs','integrations/approval-boundary.mjs','integrations/environment.mjs','integrations/resonance-rule.mjs','integrations/simple-sizing.mjs','dist/position-sizing.js'];
 files.push('docs/gold-methods-2026-10-19.md','dist/gold-methods.js','integrations/gold-planning.mjs');
 files.push('docs/gold-intraday-2026-10-26.md');
 for(const f of files){mkdirSync(dirname(join(root,f)),{recursive:true});copyFileSync(join(project,f),join(root,f))}
 for(const d of ['.runtime/fire-scan/.wujian-futures-multi-cycle-scan','.runtime/fire-scan/contract-bars','.runtime/environment'])mkdirSync(join(root,d),{recursive:true});
 const cutoff='2026-09-30',bars=Array.from({length:400},(_,i)=>{const d=new Date('2025-08-27');d.setUTCDate(d.getUTCDate()+i);return{date:d.toISOString().slice(0,10),open:100+i,close:100+i,high:101+i,low:99+i}}).filter(x=>x.date<=cutoff);
 const row={code:'SH',name:'烧碱',main_contract:'SH2611',data_date:cutoff,volume_date:cutoff,open_interest_date:cutoff,volume:50000,open_interest:50000,ok:true,month_direction:'上升',week_direction:'上升',day_direction:'上升',month_ma10:110,previous_month_ma10:100,week_ma10:110,previous_week_ma10:100,day_ma10:110,previous_day_ma10:100};
 writeFileSync(join(root,'.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json'),JSON.stringify({scan_date:cutoff,data_date:cutoff,target_date:cutoff,rows:[row]}));
 writeFileSync(join(root,'.runtime/fire-scan/contract-bars/SH2611.json'),JSON.stringify(bars));
 writeFileSync(join(root,'.runtime/environment/commodity-index.json'),JSON.stringify({name:'合成指数',source:'合成测试',fetchedAt:new Date().toISOString(),bars}));
 return root;
}
