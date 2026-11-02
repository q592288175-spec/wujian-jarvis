import {readFile} from 'node:fs/promises';
import {Lexer} from 'marked';
import {RESONANCE_RULE_VERSION,WEEK_DAY_RULE_VERSION} from './resonance-rule.mjs';

function sectionCode(tokens,heading){
 let inside=false;
 const blocks=[];
 for(const token of tokens){
  if(token.type==='heading')inside=token.text===heading;
  else if(inside&&token.type==='code')blocks.push(token.text);
 }
 return blocks.join('\n');
}

export function buildScanRuleDetails(registry,fire,method=''){
 const tokens=Lexer.lex(method);
 const monthlyLines=sectionCode(tokens,'五、模式归类').split('\n').filter(line=>line.startsWith('月周'));
 const monthWindow=sectionCode(tokens,'四、极值突破').split('\n').filter(line=>/^月线(突破窗口|新高|新低)/.test(line));
 const weekStructure=sectionCode(tokens,'三、结构').split('\n').filter(line=>line.startsWith('周'));
 const resonance=fire.resonance_rule||{},weekDay=fire.week_day_rule||{};
 const unknown='规则信息未取得，请核对来源后使用';
 return{
  version:registry.version,combinedHash:registry.combinedHash,readOnly:true,
  runId:registry.runId||null,sourceChanged:Boolean(registry.sourceChanged),
  dataDate:fire.data_date||null,scanVersion:fire.rule_version||null,
  common:{liquidity:resonance.liquidity||unknown,direction:sectionCode(tokens,'二、方向')||unknown,
   directionBoundary:resonance.version===RESONANCE_RULE_VERSION?'所需周期均上升为多头方向，均下降为空头方向；走平或方向不一致不进入观察候选。':unknown},
  modes:[
   {id:'month-week-day',label:'月周日共振',version:resonance.version||null,
    direction:resonance.version===RESONANCE_RULE_VERSION?`${resonance.direction}\n多头：月、周、日MA10均上升；空头：月、周、日MA10均下降。`:resonance.direction||unknown,
    structure:resonance.structures||unknown,breakout:resonance.breakout||unknown},
   {id:'month-week',label:'月周大周期',version:fire.baseline_rule_version||null,
    direction:monthlyLines.join('\n')||unknown,structure:weekStructure.join('\n')||unknown,breakout:monthWindow.join('\n')||unknown},
   {id:'week-day',label:'周日小周期',version:weekDay.version||null,
    direction:weekDay.version===WEEK_DAY_RULE_VERSION?`${weekDay.direction}\n多头：周、日MA10均上升；空头：周、日MA10均下降。\n${weekDay.price}`:weekDay.direction||unknown,
    structure:weekDay.structure||unknown,
    breakout:weekDay.breakout||unknown},
   ...(fire.day_trend_rule?[{id:'day-trend',label:'日K顺势',version:fire.day_trend_rule.version,
    direction:fire.day_trend_rule.direction,structure:fire.day_trend_rule.structure,
    breakout:fire.day_trend_rule.breakout+'\n'+fire.day_trend_rule.scope}]:[])
  ],
  sampleRequirements:sectionCode(tokens,'六、样本要求')||unknown,
  sources:(registry.files||[]).filter(file=>['火扫描技能包方法','火计算程序','动态月行情适配','共振计算程序'].includes(file.name)).map(({name,sha256,available})=>({name,sha256,available})),
  boundary:'观察候选不等于交易批准；此处只读，不修改技能包、筛选条件或账户记录。'
 };
}

export async function scanRuleDetails(registry,fire){
 const source=(registry.files||[]).find(file=>file.name==='火扫描技能包方法');
 // An active round must show its frozen source, not silently substitute a changed file.
 const saved=(registry.contents||[]).find(file=>file.name==='火扫描技能包方法');
 const method=saved?.content??(registry.runId?'':source?.available?await readFile(source.path,'utf8').catch(()=>''):'');
 return buildScanRuleDetails(registry,fire,method);
}
