import {buildAxesReport,sizeByRisk} from './integrations/three-axes.mjs';
import {feishuStatus,startFeishu,stopFeishu,setFeishuSchedule,previewFeishuReport,pushFeishuReport} from './integrations/feishu.mjs';
import {liveStatus,createLive,delegateLive} from './integrations/live-voice.mjs';
import {startResearch,getReport,listReports,cancelResearch,reportDetails,recordFollowup} from './integrations/research-agent.mjs';
import {researchMethod,researchTools,researchQuery} from './integrations/research.mjs';
import {assistantReply} from './integrations/assistant.mjs';
import {modelStatus} from './integrations/deepseek.mjs';
import {marketSnapshot,marketQuery,marketTools} from './integrations/market.mjs';
import {providers,externalData,externalTool} from './integrations/providers.mjs';
import {officialNews,rules,financeTools,financeInstructions} from './finance.mjs';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const ROOT=dirname(fileURLToPath(import.meta.url)),PUBLIC=resolve(ROOT,'dist'),PORT=Number(process.env.PORT||4318);
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>65536)throw Error('请求过大');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString()||'{}')}
const origins=new Set([`http://localhost:${PORT}`,`http://127.0.0.1:${PORT}`]);
const server=http.createServer(async(req,res)=>{try{const host=req.headers.host;if(![`localhost:${PORT}`,`127.0.0.1:${PORT}`].includes(host))return json(res,403,{error:'仅允许本地访问'});const url=new URL(req.url,`http://${host}`);if(req.method==='POST'&&!origins.has(req.headers.origin))return json(res,403,{error:'来源校验失败'});
if(req.method==='GET'&&url.pathname==='/api/three-axes')return json(res,200,buildAxesReport(await marketSnapshot()));
if(req.method==='POST'&&url.pathname==='/api/three-axes/size'){try{return json(res,200,sizeByRisk(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/feishu/status')return json(res,200,feishuStatus());
if(req.method==='GET'&&url.pathname==='/api/feishu/preview')return json(res,200,await previewFeishuReport());
if(req.method==='POST'&&url.pathname==='/api/feishu/schedule'){try{return json(res,200,await setFeishuSchedule(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/feishu/push'){try{return json(res,200,await pushFeishuReport())}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{app:'wujian-jarvis',version:'0.3.0',mode:'local'});
if(url.pathname.startsWith('/api/codex/')||url.pathname==='/api/session')return json(res,410,{error:'旧模型通话入口已停用，请使用DeepSeek文字/语音对话'});
if(req.method==='GET'&&url.pathname==='/api/live-voice/status')return json(res,200,liveStatus());
if(req.method==='POST'&&url.pathname==='/api/live-voice/session'){try{return json(res,201,await createLive((await body(req)).sdp))}catch(e){return json(res,503,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/live-voice/delegate'){try{return json(res,200,await delegateLive(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(url.pathname==='/api/llm/status')return json(res,200,modelStatus());
if(req.method==='POST'&&url.pathname==='/api/chat'){try{const b=await body(req);return json(res,200,await assistantReply(b.messages,b.contextSymbol))}catch(e){return json(res,502,{error:e.message})}}
if(url.pathname==='/api/status'){const live=await marketSnapshot();return json(res,200,{mode:'real-research',realtimeConfigured:liveStatus().configured,chatConfigured:!!process.env.DEEPSEEK_API_KEY,llm:modelStatus(),marketConnected:live.status==='observing'&&live.quotes.length>0,marketStatus:live.status,brokerConnected:false,tasks:(await listReports()).map(({id,name,status,stage,created})=>({id,name,status,stage,created})),decisions:[]});}
if(req.method==='POST'&&url.pathname==='/api/research/run'){try{const b=await body(req);return json(res,202,await startResearch(b.product))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/research/cancel'){const b=await body(req);return json(res,200,await cancelResearch(b.id))}
if(req.method==='POST'&&url.pathname==='/api/research/followup'){const b=await body(req);return json(res,201,await recordFollowup(b.id,b))}
if(req.method==='GET'&&url.pathname==='/api/research/reports')return json(res,200,(await listReports()).map(({report,sources,evidence,...meta})=>meta));
if(req.method==='GET'&&url.pathname.startsWith('/api/research/reports/')){const r=await reportDetails(url.pathname.split('/').pop());return json(res,r?200:404,r||{error:'报告不存在'})}
if(url.pathname==='/api/research/method')return json(res,200,researchMethod);
if(url.pathname==='/api/research/brief')return json(res,200,await researchQuery('get_research_brief',{kind:url.searchParams.get('kind')||'close'}));
if(url.pathname==='/api/providers')return json(res,200,providers());
if(url.pathname==='/api/external')return json(res,200,await externalData(url.searchParams.get('provider')));
if(url.pathname==='/api/news')return json(res,200,await officialNews());
if(url.pathname==='/api/rules')return json(res,200,await rules());
if(url.pathname==='/api/live-market')return json(res,200,await marketSnapshot());
if(url.pathname==='/api/market')return json(res,200,await marketSnapshot());
if(url.pathname.startsWith('/api/tasks')||url.pathname==='/api/decisions')return json(res,410,{error:'生成示例接口已移除，请使用真实研究报告入口'});
if(req.method==='POST'&&url.pathname==='/api/tool'){const b=await body(req);if(researchTools.some(t=>t.name===b.name))return json(res,200,await researchQuery(b.name,b.args));if(marketTools.some(t=>t.name===b.name))return json(res,200,await marketQuery(b.name,b.args));if(b.name==='get_external_context')return json(res,200,await externalData(b.args?.provider));if(b.name==='get_official_news')return json(res,200,await officialNews());if(b.name==='get_current_rules')return json(res,200,await rules());return json(res,400,{error:'工具未授权'})}
if(req.method!=='GET')return json(res,405,{error:'方法不支持'});const p=resolve(PUBLIC,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(PUBLIC+'/'))return json(res,403,{error:'拒绝访问'});try{let content=await readFile(p);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'});res.end(content)}catch{json(res,404,{error:'文件不存在'})}
}catch(e){json(res,400,{error:'请求无效或本地处理失败'})}});
server.listen(PORT,'127.0.0.1',()=>{console.log(`JARVIS local workspace: http://127.0.0.1:${PORT}`);void startFeishu()});

for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopFeishu();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref()});
