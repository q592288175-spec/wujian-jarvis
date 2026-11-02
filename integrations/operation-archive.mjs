import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const cnTime=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';
const num=value=>value===null||value===undefined?'未知':Number(value).toLocaleString('zh-CN',{maximumFractionDigits:3});
const line=value=>String(value??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' / ');
const csv=value=>typeof value==='number'?String(value):'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
const table=(headers,rows)=>'| '+headers.join(' | ')+' |\n| '+headers.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.map(line).join(' | ')+' |').join('\n');
const modeName=mode=>({real:'实盘',simulation:'模拟',shadow:'影子'})[mode]||'未知';

export function cardMarkdown(card){
 const t=card.trade||{},rows=card.executions||[],plans=card.planHistory||[];
 const text=['# '+card.name+' '+(card.contract||card.symbol),'',
  '账户：'+(card.account?.alias||'未绑定')+'（'+modeName(card.account?.mode)+'）',
  '交易卡：'+card.id+'；轮次：'+card.roundId,
  '归档状态：'+(card.archivedAt?'已移除；'+cnTime(card.archivedAt)+'；原因：'+card.archiveReason:'当前队列'),
  '方向：'+(t.openAction||'未知')+'；状态：'+card.status,
  '本笔已实现净盈亏：'+num(t.realizedPnl)+' 元；结果：'+t.outcome,
  '剩余持仓：'+num(t.remainingLots)+' 手；实际持仓均价：'+num(t.averageEntry),
  '本笔首次入账前余额：'+num(t.balanceBefore)+' 元；最后入账后余额：'+num(t.balanceAfter)+' 元',
  '账户当前账面金额：'+num(card.account?.equity)+' 元。资金变化含其他交易或人工对账时，以资金流水逐条为准。','',
  '## 火与水的交接证据','',
  '火来源：'+(card.source||'未知')+'；行情日期：'+(card.fire?.dataDate||'未知'),
  '水研究当时记录：\n```json\n'+JSON.stringify(card.water||{},null,2)+'\n```','',
  '## 冻结计划与版本','',
  ...plans.flatMap(p=>['### 版本 '+p.version+' · '+p.status,
   '冻结：'+cnTime(p.createdAt)+'；人工批准：'+cnTime(p.approvedAt),
   '主周期：'+({day:'日线',week:'周线',small:'小周期'}[p.payload.mainCycle]||'未知'),
   '入场手法：'+(p.payload.pairType||'未填'),
   '计划入场：'+num(p.payload.entry)+'；止损：'+num(p.payload.stop)+'；测算手数：'+num(p.risk.lots),
   '账户金额快照：'+num(p.payload.accountEquity)+'；亏损比例：'+num(p.payload.riskPercent)+'%；预算：'+num(p.risk.frozenBudget),
   '合约每点金额：'+num(p.payload.multiplier)+'；规则哈希：'+p.evidenceHash,
   '系统运行：'+(p.payload.systemRunId||'历史计划未绑定')+'；复核范围：'+(p.risk.reviewScope||'历史范围待核验'),
   '止盈与退出：'+(p.payload.exitRule||'未填'),'']),
  '## 实际执行','',
  table(['时间（北京时间）','动作','均价','手数','保护价','退出原因','原始净盈亏','备注','异常'],
   rows.map(x=>[cnTime(x.time),x.action,num(x.price),num(x.quantity),num(x.payload.stop),x.payload.reason||'',num(x.payload.netPnl),x.stopStatus||'',(x.payload.anomalies||[]).join('；')])),
  '', '## 监督事项与处理结果','',
  table(['责任环节','问题','下一步','状态','处理结果'],(card.supervision||[]).map(i=>[({fire:'火',water:'水',metal:'金',earth:'土',wood:'木'})[i.owner],i.description,i.next_action,i.status,i.resolution||'尚未处理'])),
  '', '## 本笔资金流水','',
  table(['入账时间','类型','本次增减','入账前','入账后','更正原因'],
   (t.ledger||[]).map(e=>[cnTime(e.createdAt),e.kind,num(e.amount),num(e.balanceBefore),num(e.balanceAfter),e.payload?.reason||''])),
  '', '## 复盘原文与历史版本','',
  ...(card.reviews||[]).flatMap(r=>['### '+cnTime(r.createdAt),
   '做得好：\n'+(r.payload.good||r.payload.executionConclusion||'未填'),
   '\n做得不好：\n'+(r.payload.bad||r.payload.resultConclusion||'未填'),
   '\n下次注意：\n'+(r.payload.next||r.payload.lessons||'未填'),'']),
  '## 尚未确认的执行草稿','',
  card.drafts?.execution?JSON.stringify(card.drafts.execution,null,2):'无',
  '', '草稿不是成交回报，不计入账户资金。实际净盈亏为用户确认的含成本金额，不重复扣费用。'];
 return text.join('\n')+'\n';
}
export function createOperationArchive(directory,readSnapshot){
 const root=resolve(directory);
 let pending=null,again=false,state={status:'pending',directory:root,lastExportAt:null,error:null};
 async function atomic(name,content){
  const target=join(root,name);await mkdir(resolve(target,'..'),{recursive:true});
  const temp=target+'.tmp';await writeFile(temp,content,'utf8');await rename(temp,target);
 }
 async function write(){
  const data=readSnapshot(),cards=data.cards;
  const sections=['# 小木操作记录','', '最后同步：'+cnTime(data.exportedAt),
   '此目录由小木自动生成。数据库保存后自动同步；历史计划、成交、净盈亏更正和复盘版本保留。',
   '未连接期货交易账户。账面金额根据本人确认的实际净盈亏和账户对账更新；浮盈估算、草稿不入账。',
   '交给AI分析时，以实际记录为事实，复盘文字为本人当时观点；建议不自动改交易规则。','',
   '## 账户金额','',table(['账户','账户ID','类型','初始资金','当前余额','累计盈亏'],data.accounts.map(a=>[a.alias,a.id,modeName(a.mode),num(a.initialCapital),num(a.equity),num(a.cumulativePnl)])),'',
   '## 每笔交易',''];
  for(const card of cards){
   const key=createHash('sha256').update(card.id).digest('hex').slice(0,20);
   const md=cardMarkdown(card);
   await atomic('交易卡/'+key+'.md',md);
   sections.push(md.replace(/^# /,'## '));
  }
  await atomic('小木操作记录.md',sections.join('\n'));
  if(data.governance){
   const g=data.governance;
   await atomic('运行框架记录.md',['# 团队运行与锁定框架','',...Object.values(g.responsibilities),
    '',g.reviewMode,'',table(['运行ID','状态','启动时间','结束时间','锁定哈希','结果'],g.history.map(r=>[r.id,r.status,cnTime(r.startedAt),cnTime(r.endedAt),r.snapshot.combinedHash,r.result||'尚未落地'])),
    '',table(['交易卡','责任环节','事项','下一步','状态','处理结果'],g.issues.map(i=>[i.card_id,i.owner,i.description,i.next_action,i.status,i.resolution||'尚未处理']))].join('\n'));
  }
  await atomic('全部记录.json',JSON.stringify(data,null,2));
  const balances=[['记录ID','账户ID','修改前','修改后','变动金额','方向','来源页面','备注','状态','同步时间','修订时间','作废原因'],...(data.balanceChanges||[]).map(c=>[c.id,c.accountId,c.beforeBalance,c.afterBalance,c.amount,c.direction,c.sourcePage,c.note,c.status,c.effectiveAt,c.updatedAt,c.voidReason])];
  await atomic('余额同步记录.csv','\uFEFF'+balances.map(row=>row.map(csv).join(',')).join('\r\n'));
  await atomic('操作流水.jsonl',data.events.map(e=>JSON.stringify(e)).join('\n')+(data.events.length?'\n':''));
  const funds=[['入账ID','账户','交易卡','执行ID','类型','实际增减','入账前金额','入账后金额','成交时间','记账时间'],...data.accountEntries.map(e=>[e.id,e.accountId,e.cardId,e.executionId,e.kind,e.amount,e.balanceBefore,e.balanceAfter,e.effectiveAt,e.createdAt])];
  await atomic('账户资金流水.csv','\uFEFF'+funds.map(row=>row.map(csv).join(',')).join('\r\n'));
  await atomic('同步状态.json',JSON.stringify({exportedAt:data.exportedAt,cards:cards.length,events:data.events.length,accounts:data.accounts.length},null,2));
  state={status:'ready',directory:root,lastExportAt:data.exportedAt,error:null};
 }
 function sync(){
  again=true;if(pending)return pending;
  pending=(async()=>{while(again){again=false;try{await write()}catch(error){state={...state,status:'error',error:'业务记录已保存，操作文件同步失败：'+error.message};break}}})().finally(()=>pending=null);
  return pending;
 }
 return{sync,status:()=>({...state,syncing:!!pending})};
}
