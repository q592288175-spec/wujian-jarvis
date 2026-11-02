import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {applyResonanceRule,WEEK_DAY_MODE,WEEK_DAY_RULE_VERSION} from '../integrations/resonance-rule.mjs';

const source=resolve(process.argv[2]||'.runtime/rule-history/2026-10-07-week-day-before/2026-09-30.json');
const original=JSON.parse(await readFile(source,'utf8')),previous=applyResonanceRule(original);
const result={...previous,recalculated_at:new Date().toISOString(),recalculation_source:source,week_day_rule_version:WEEK_DAY_RULE_VERSION};
assert.deepEqual(result.rows.map(r=>r.modes['month-week']),original.rows.map(r=>r.modes['month-week']));
const output=resolve('.runtime/fire-scan/.wujian-futures-multi-cycle-scan',`${result.target_date}_week-day-2026-10-07.json`);
await mkdir(resolve('.runtime/fire-scan/.wujian-futures-multi-cycle-scan'),{recursive:true});
await writeFile(output,JSON.stringify(result,null,2));
const oldSelected=original.rows.filter(r=>['多头观察','空头观察'].includes(r.modes[WEEK_DAY_MODE])).map(r=>r.code);
const selected=result.rows.filter(r=>['多头观察','空头观察'].includes(r.modes[WEEK_DAY_MODE]));
const audit={time:result.recalculated_at,targetDate:result.target_date,source,output,total:result.rows.length,previous:oldSelected.length,current:selected.length,
 counts:result.counts[WEEK_DAY_MODE],candidates:selected.map(r=>({code:r.code,name:r.name,contract:r.main_contract,direction:r.modes[WEEK_DAY_MODE],volume:r.volume,openInterest:r.open_interest,added:!oldSelected.includes(r.code)}))};
const evidence=resolve('output/week-day-2026-10-07');await mkdir(evidence,{recursive:true});
await writeFile(resolve(evidence,'复算结果.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify(audit,null,2));
