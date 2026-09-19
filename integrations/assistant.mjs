import {decisionProtocol,decisionEvidence,calculatePlanRisk,decisionTools} from './decision-support.mjs';
import {threeAxesKnowledge,threeAxesKnowledgeTool} from './three-axes-knowledge.mjs';
import {buildAxesReport} from './three-axes.mjs';
import {runDeepSeek} from './deepseek.mjs';
import {financeInstructions,financeTools,officialNews,rules} from '../finance.mjs';
import {marketSnapshot,marketTools,marketQuery} from './market.mjs';
import {researchTools,researchQuery} from './research.mjs';
import {startResearch,reportDetails,listReports,cancelResearch} from './research-agent.mjs';
import {sourceTools,sourceQuery} from './research-sources.mjs';
const taskTools=[...decisionTools,threeAxesKnowledgeTool,{name:'get_three_axes_report',description:'读取TqSdk真实合约三板斧参考筛选与八段式日报。独立外部参考模块，不代替五简正式交易许可；无账户时不计算手数。',parameters:{type:'object',properties:{},additionalProperties:false}},{name:'cancel_deep_research',description:'仅当用户明确要求取消后台研究任务时使用；停止说话、停一下或挂断通话不代表取消研究。必须使用已查询到的任务ID。',parameters:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},{name:'list_active_research',description:'查询正在运行的后台研究任务及其ID，不启动新任务。',parameters:{type:'object',properties:{},additionalProperties:false}},{name:'start_deep_research',description:'用户要求深入研究某个品种时，启动后台真实研究任务，立即返回任务ID，用户可继续对话。',parameters:{type:'object',properties:{product:{type:'string'}},required:['product'],additionalProperties:false}},{name:'get_deep_research',description:'查询已启动的深度研究报告状态和结果。',parameters:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}];
export async function assistantReply(messages,contextSymbol,{voice=false}={}){
 if(!Array.isArray(messages)||!messages.length||messages.length>24||messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>6000))throw Error('对话格式不正确或过长');
 const contextQuote=typeof contextSymbol==='string'?(await marketSnapshot()).quotes.find(q=>q.symbol===contextSymbol):null;
 const started=[];
 const execute=async(name,args)=>{
 if(name==='get_futures_decision_evidence'){const snap=await marketSnapshot();const q=snap.quotes.find(q=>q.symbol===args.symbol);return q?decisionEvidence(q,snap):{error:'实际合约未进入研究池，不得补猜',permission:false}}
 if(name==='calculate_futures_plan_risk')return calculatePlanRisk(args);
 if(name==='get_three_axes_knowledge')return threeAxesKnowledge();
 if(name==='get_three_axes_report'){const r=buildAxesReport(await marketSnapshot());return {text:r.text,counts:r.counts,status:r.status,source:r.source,rows:r.rows,permission:false,notice:'环境候选不是交易信号；采集过期或报价历史时不得称实时推荐。'}}
 if(name==='start_deep_research'){const job=await startResearch(args.product);started.push({id:job.id,name:job.name});return job;}
 if(name==='list_active_research')return (await listReports()).filter(j=>j.status==='running').map(({id,name,status,stage})=>({id,name,status,stage}));
 if(name==='cancel_deep_research'){const j=await cancelResearch(args.id);return {id:j.id,name:j.name,status:j.status,stage:j.stage}}
 if(name==='get_deep_research'){const j=await reportDetails(args.id);if(!j)return {error:'任务不存在'};const {sources,...report}=j;return {...report,sources:(sources||[]).map(x=>({name:x.name,url:x.result?.url,error:x.result?.error}))}}
 if(sourceTools.some(t=>t.name===name))return sourceQuery(name,args);
 if(name==='get_official_news')return officialNews();if(name==='get_current_rules')return rules();
 if(researchTools.some(t=>t.name===name))return researchQuery(name,args);
 const r=await marketQuery(name,args);if(r.quotes)r.quotes=r.quotes.map(({bars,...q})=>q);return r;
 };
 const result=await runDeepSeek({messages:[{role:'system',content:(contextQuote?'当前页面选中的实际合约为 '+contextQuote.symbol+'，报价时间 '+contextQuote.quoteTime+'。用户说当前品种时指该合约。\n':'')+financeInstructions+'\n'+await decisionProtocol()+(voice?'现在是实时电话交谈，用户不看屏幕。直接用自然口语回答，一次只讲最重要的结论和依据，通常80至180字，最多350字。不要使用Markdown、表格、网址或朗读任务ID，不要求用户去看面板才能理解回答。研究可以在后台执行，先简短告知已开始，用户追问时用工具查询进展或读取报告并口头总结。保留关键的数据时点、未知和反证。':'')+'\\n你使用DeepSeek V4.1 Flash。当前时间'+new Date().toISOString()+'。回答简短中文，详细研报用start_deep_research启动并告知任务ID。任何新闻和行情都先用工具读取。停止播报与取消研究是两回事；只有用户明确取消研究时才调用cancel_deep_research。没有run_research演示工具，也没有下单工具。'},...messages],tools:[...financeTools,...marketTools,...researchTools,...sourceTools,...taskTools],execute});
 return {...result,jobs:started};
}
