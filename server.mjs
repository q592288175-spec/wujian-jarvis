import {createAlertSpeech} from './integrations/alert-speech.mjs';
import {akshareTools,akshareData} from './integrations/akshare.mjs';
import {fundamentalsTools,fundamentalsQuery} from './integrations/fundamentals.mjs';
import {attachVolc,volcStatus,voiceTicket} from './integrations/volc-voice.mjs';
import {loadVoiceConfig} from './integrations/voice-config.mjs';
import {loadBinding} from './integrations/im-binding.mjs';
import {registration,disconnectFeishu} from './integrations/feishu-registration.mjs';
import {buildAxesReport,sizeByRisk} from './integrations/three-axes.mjs';
import {feishuStatus,startFeishu,stopFeishu,setFeishuSchedule,previewFeishuReport,pushFeishuReport} from './integrations/feishu.mjs';
import {liveStatus,createLive,delegateLive} from './integrations/live-voice.mjs';
import {startResearch,getReport,listReports,cancelResearch,reportDetails,recordFollowup} from './integrations/research-agent.mjs';
import {researchUniverse,researchBatchStatus,startResearchBatch,stopResearchBatch} from './integrations/research-universe.mjs';
import {researchMethod,researchTools,researchQuery} from './integrations/research.mjs';
import {assistantReply} from './integrations/assistant.mjs';
import {saveWaterNotes} from './integrations/five-workbench.mjs';
import {applyResearchDraft} from './integrations/research-application.mjs';
import {maintenanceStatus,startSystemBackup,backupBusy} from './integrations/maintenance.mjs';
import {modelStatus,runDeepSeek} from './integrations/deepseek.mjs';
import {createPostmarketReview} from './integrations/postmarket-review.mjs';
import {loadPostmarketEvidence,explainPostmarketReport} from './integrations/postmarket-evidence.mjs';
import {sourceConnectionStatus,saveSourceConnection} from './integrations/postmarket-sources.mjs';
import {marketSnapshot,marketQuery,marketTools} from './integrations/market.mjs';
import {refreshEod,eodRefreshStatus,startEodSchedule} from './integrations/eod-refresh.mjs';
import {latestStrength} from './integrations/relative-strength.mjs';
import {createPanorama} from './integrations/market-panorama.mjs';
import {applyDayTrendRule,selectDayTrendCandidate,DAY_TREND_MODE} from './integrations/day-trend.mjs';
import {providers,externalData,externalTool} from './integrations/providers.mjs';
import {officialNews,rules,financeTools,financeInstructions} from './finance.mjs';
import {knowledgeStatus,reindexKnowledge,searchKnowledge,knowledgeSource} from './integrations/knowledge-base.mjs';
import {ruleRegistry,listAccounts,saveAccount,syncAccountBalance,listBalanceChanges,editBalanceChange,voidBalance,deleteOrDisableAccount,listCards,getCard,saveCard,deleteCard,restoreCard,cardRemovalPreview,savePlan,approvePlan,addExecution,listExecutions,saveReview,reviewForCard,listChanges,previewCsv,commitCsv,latestFire,specificBars,startFireRefresh,selectFireCandidate,summary,fullCard,backup,calculateRisk} from './integrations/five-workbench.mjs';
import http from 'node:http';
import {cardEnvironment} from './integrations/five-workbench.mjs';
import {goldPlanning} from './integrations/five-workbench.mjs';
import {contractSpec} from './integrations/contract-specs.mjs';
import {recordTrade,correctTradePnl,saveExecutionDraft,operationArchiveData} from './integrations/five-workbench.mjs';
import {beginSystemRun,endSystemRun,systemGovernance,recordIssue,releasePlan} from './integrations/five-workbench.mjs';
import {reconcileTradePosition} from './integrations/five-workbench.mjs';
import {scanRuleDetails} from './integrations/scan-rule-details.mjs';
import {createOperationArchive} from './integrations/operation-archive.mjs';
import {checkTradeMarket} from './integrations/trade-market-check.mjs';
import {monitorService} from './integrations/monitor-service.mjs';
import {createTrendRuntime} from './integrations/trend-monitor-runtime.mjs';
import {TqLogin} from './integrations/tq-login.mjs';
import {tqQuoteFor} from './integrations/tq-panorama.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const ROOT=dirname(fileURLToPath(import.meta.url)),PUBLIC=resolve(ROOT,'dist'),PORT=Number(process.env.PORT||4318);
const APP_VERSION=JSON.parse(await readFile(resolve(ROOT,'package.json'),'utf8')).version;
const buildSources=['integrations/relative-strength.mjs','integrations/knowledge-policy.mjs','integrations/knowledge-base.mjs','integrations/research-application.mjs','integrations/maintenance.mjs','integrations/monitor-health.mjs','scripts/system-backup.mjs','server.mjs','integrations/five-workbench.mjs','integrations/fire-refresh.mjs','integrations/eod-refresh.mjs','scripts/fire_scan.py','integrations/eod_market.py','integrations/trade-ledger.mjs','integrations/account-balances.mjs','integrations/team-governance.mjs','integrations/approval-boundary.mjs','integrations/assistant.mjs','integrations/research-agent.mjs','integrations/research-market.mjs','integrations/research.mjs','integrations/research-evidence.mjs','integrations/team-context.mjs','integrations/postmarket-review.mjs','integrations/postmarket-evidence.mjs','integrations/postmarket-sources.mjs','scripts/postmarket_calendar.py','integrations/monitor-service.mjs','integrations/monitor-engine.mjs','integrations/monitor-store.mjs','integrations/monitor-announcements.mjs','integrations/monitor_market.py','integrations/monitor-sina.mjs','integrations/feishu-core.mjs','integrations/feishu.mjs','integrations/im-binding.mjs','integrations/local-secret.mjs','scripts/protect-local-secret.ps1','integrations/volc-voice.mjs','integrations/volc-duplex.mjs','integrations/voice-config.mjs'];
buildSources.push('integrations/tq-login.mjs','integrations/tq-panorama.mjs');
buildSources.push('integrations/market-panorama.mjs','integrations/market-overview.mjs','integrations/market-panorama-data.py','integrations/overview_closes.py','integrations/fee-refresh.mjs','integrations/jiaoyixingqiu_fees.py');
buildSources.push('integrations/trend-monitor-runtime.mjs','integrations/trend-monitor-engine.mjs','integrations/trend-monitor-service.mjs','integrations/trend-market.mjs','integrations/weixin-channel.mjs','integrations/trend-monitor-table.mjs','integrations/alert-speech.mjs','dist/alarm-voices.js','dist/liquidity.js');
buildSources.push('integrations/workbench-chat.mjs','integrations/weixin-chat.mjs','mcp/local-client.mjs');
const serverBuild=createHash('sha256').update(Buffer.concat(await Promise.all(buildSources.concat('dist/indicators.js','integrations/day-trend.mjs','integrations/gold-planning.mjs','dist/gold-methods.js').map(p=>readFile(resolve(ROOT,p)))))).digest('hex');
const operationArchive=createOperationArchive(process.env.WUJIAN_OPERATION_DIR||resolve(ROOT,'操作记录'),operationArchiveData);
const monitor=monitorService();monitor.enforceLiquidity=true;
const tqLogin=new TqLogin({monitor,root:ROOT});
const panorama=createPanorama({root:ROOT,getFire:async()=>applyDayTrendRule(await latestFire()),getLiveQuote:(product,day)=>tqQuoteFor(product,day,monitor),getLiveStatus:()=>tqLogin.status()});
const trendMonitor=createTrendRuntime({root:ROOT,monitor,panorama});
const alertSpeech=createAlertSpeech({root:process.env.WUJIAN_TREND_HOME||ROOT});
const postmarketReview=createPostmarketReview({getScan:latestFire,refreshScan:startFireRefresh,getEvidence:loadPostmarketEvidence,explain:process.env.DEEPSEEK_API_KEY?explainPostmarketReport:null});
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
async function visibleCurrentCards(rows){const codes=new Set((await panorama.snapshot()).products.map(p=>p.code));return rows.filter(c=>codes.has(c.symbol)||c.archivedAt||c.status==='已结束'||listExecutions(c.id).length>0);}
async function requireCurrentProduct(value){const key=String(value||'').trim().toUpperCase(),code=key.split('.').at(-1).replace(/\d+$/,'');const snap=await panorama.snapshot();if(!snap.products.some(p=>p.code===code||p.name.toUpperCase()===key||(Array.isArray(p.aliases)?p.aliases:String(p.aliases||'').split(/[,，]/)).some(a=>a.toUpperCase()===key)))throw Error('该品种成交量和持仓量未同时严格大于1万手，已从当前选品过滤');}
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>2*1024*1024)throw Error('请求过大');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString()||'{}')}
const origins=new Set([`http://localhost:${PORT}`,`http://127.0.0.1:${PORT}`]);
const server=http.createServer(async(req,res)=>{try{const host=req.headers.host;if(![`localhost:${PORT}`,`127.0.0.1:${PORT}`].includes(host))return json(res,403,{error:'仅允许本地访问'});const url=new URL(req.url,`http://${host}`);if(['POST','PATCH','DELETE'].includes(req.method)&&!origins.has(req.headers.origin))return json(res,403,{error:'来源校验失败'});
if(url.pathname.startsWith('/api/tq/')){
 const path=url.pathname.slice('/api/tq/'.length);
 if(req.method==='GET'&&path==='status')return json(res,200,tqLogin.status());
 if(req.method==='GET'&&path==='quotes')return json(res,200,tqLogin.quotes());
 if(req.method==='POST'&&path==='login')return json(res,202,await tqLogin.login(await body(req)));
 if(req.method==='POST'&&path==='reconnect')return json(res,202,await tqLogin.reconnect());
 if(req.method==='POST'&&path==='logout')return json(res,200,await tqLogin.logout());
 return json(res,404,{error:'天勤行情接口不存在'});
}
if(url.pathname.startsWith('/api/trend-monitor/')){
 try{
  const path=url.pathname.slice('/api/trend-monitor/'.length);
  if(req.method==='POST'&&path==='speech'){const input=await body(req);const event=input.preview===true?{name:'螺纹钢',period:'30m',direction:'down',isTest:true}:monitor.store.event(input.eventId);if(!event||event.kind&&event.kind!=='ma-turn')throw Error('语音警报不存在');return json(res,200,await alertSpeech.render(event,input.voiceId));}
  if(req.method==='GET'&&path==='status')return json(res,200,trendMonitor.status());
  if(req.method==='GET'&&path==='catalog')return json(res,200,{items:await trendMonitor.catalog()});
  if(req.method==='GET'&&path==='tasks')return json(res,200,{items:trendMonitor.service.tasks()});
  if(req.method==='POST'&&path==='watchlist')return json(res,200,await trendMonitor.saveWatchlist(await body(req)));
  if(req.method==='GET'&&path==='events')return json(res,200,{items:trendMonitor.status().events});
  if(req.method==='POST'&&/^events\/[0-9a-f-]{36}\/read$/.test(path)){const id=path.split('/')[1],event=monitor.store.event(id);if(!event||event.kind!=='ma-turn')throw Error('该监控警报不存在');const result=monitor.store.read(id);return json(res,200,result);}
  if(req.method==='POST'&&path==='tasks')return json(res,201,await trendMonitor.save(await body(req)));
  if(req.method==='POST'&&/^tasks\/[0-9a-f-]{36}$/.test(path))return json(res,200,await trendMonitor.save(await body(req),path.split('/')[1]));
  if(req.method==='POST'&&/^tasks\/[0-9a-f-]{36}\/(activate|pause|archive)$/.test(path)){const [,id,action]=path.split('/');return json(res,200,trendMonitor.setStatus(id,{activate:'active',pause:'paused',archive:'archived'}[action]));}
  if(req.method==='GET'&&path==='weixin/status')return json(res,200,trendMonitor.weixin.status());
  if(req.method==='POST'&&path==='weixin/login'){const input=await body(req);if(input.replace!==undefined&&typeof input.replace!=='boolean')throw Error('请明确是否更换接收微信');return json(res,200,await trendMonitor.weixin.startLogin({replace:input.replace===true}));}
  if(req.method==='POST'&&path==='weixin/login/cancel'){const input=await body(req),current=trendMonitor.weixin.status().login;if(input.id&&current?.id!==input.id)throw Error('扫码会话已更新，请刷新后再操作');return json(res,200,trendMonitor.weixin.cancelLogin());}
  if(req.method==='POST'&&path==='weixin/verify'){const input=await body(req);return json(res,200,await trendMonitor.weixin.submitVerifyCode(input.id,input.code));}
  if(req.method==='POST'&&path==='weixin/disconnect')return json(res,200,await trendMonitor.weixin.disconnect());
  if(req.method==='POST'&&path==='weixin/test')return json(res,201,await trendMonitor.testWeixin());
  if(req.method==='GET'&&path==='stream'){
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'});
   const listener=(type,value)=>res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);trendMonitor.listeners.add(listener);listener('status',{});
   const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(timer);trendMonitor.listeners.delete(listener)});return;
  }
  return json(res,404,{error:'全品种监控接口不存在'});
 }catch(error){return json(res,400,{error:error.message||'全品种监控处理失败'});}
}
if(req.method==='GET'&&url.pathname==='/api/maintenance/status')return json(res,200,await maintenanceStatus());
if(url.pathname.startsWith('/api/market-panorama/')){
 const path=url.pathname.slice('/api/market-panorama/'.length);
 try{
  if(req.method==='GET'&&path==='events'){
   await panorama.init();panorama.schedule();res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'});
   const listener=(type,value)=>res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);panorama.listeners.add(listener);listener('ready',{});
   const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(timer);panorama.listeners.delete(listener)});return;
  }
  if(req.method==='GET'&&path==='fee-rating')return json(res,200,JSON.parse(await readFile(resolve(ROOT,'data/fee-rating.json'),'utf8')));
  if(req.method==='GET'&&path==='status')return json(res,200,await panorama.status());
  if(req.method==='POST'&&path==='refresh')return json(res,202,await panorama.start(await body(req)));
  if(req.method==='POST'&&path==='cancel')return json(res,200,panorama.cancel());
  if(req.method==='POST'&&path==='watchlist')return json(res,200,{values:await panorama.watchlist((await body(req)).values)});
  if(req.method==='POST'&&path==='export')return json(res,201,await panorama.exportTable(await body(req)));
  if(req.method==='POST'&&path==='image')return json(res,201,await panorama.exportImage(await body(req)));
  if(req.method==='GET'&&path==='variety')return json(res,200,await panorama.detail(url.searchParams.get('product'),url.searchParams.get('date')||undefined));
  if(req.method==='GET'&&path==='intraday')return json(res,200,await panorama.intraday(url.searchParams.get('product'),url.searchParams.get('date')||undefined));
  if(req.method==='GET'&&['snapshot','catalog','overview','strength','rankings','funds','positions','fees','seat-flow'].includes(path))return json(res,200,await panorama.snapshot(url.searchParams.get('date')||undefined));
  return json(res,404,{error:'市场接口不存在'});
 }catch(error){return json(res,400,{error:error.message})}
}
if(req.method==='POST'&&url.pathname==='/api/maintenance/backup'){if((await listReports()).some(r=>r.status==='running')||(await latestFire()).refreshing)return json(res,409,{error:'请等待研究或盘后刷新完成再备份'});return json(res,202,await startSystemBackup());}
if(backupBusy()&&['POST','PATCH','DELETE'].includes(req.method)&&/^\/api\/(workbench|research|knowledge)\//.test(url.pathname))return json(res,503,{error:'正在建立完整恢复点，暂缓写入；请保留表单并在备份完成后重试'});
if(url.pathname.startsWith('/api/monitor/')){
 try{
  const path=url.pathname.slice('/api/monitor/'.length);
  if(req.method==='GET'&&path==='stream'){
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'});
   const listener=(type,value)=>res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);monitor.listeners.add(listener);listener('status',{});
   const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(timer);monitor.listeners.delete(listener)});return;
  }
  if(req.method==='GET'&&path==='status')return json(res,200,monitor.status());
  if(req.method==='GET'&&path==='contracts')return json(res,200,{items:await monitor.catalog()});
  if(req.method==='GET'&&path==='rules')return json(res,200,{items:monitor.rules()});
  if(req.method==='GET'&&path==='events')return json(res,200,{items:monitor.store.events({limit:url.searchParams.get('limit'),unread:url.searchParams.get('unread')==='1'})});
  if(req.method==='GET'&&path==='export')return json(res,200,monitor.store.export());
  if(req.method==='POST'&&path==='export/file')return json(res,201,monitor.exportFile());
  if(req.method==='GET'&&path==='desktop/pending')return json(res,200,{items:monitor.store.pending('desktop').map(item=>item.event)});
  if(req.method==='POST'&&path==='preview')return json(res,200,await monitor.preview(await body(req)));
  if(req.method==='POST'&&path==='rules')return json(res,201,await monitor.save(await body(req)));
  if(req.method==='POST'&&/^rules\/[0-9a-f-]{36}$/.test(path))return json(res,200,await monitor.save(await body(req),path.split('/')[1]));
  if(req.method==='POST'&&/^rules\/[0-9a-f-]{36}\/(activate|pause|archive)$/.test(path)){const [,id,action]=path.split('/');return json(res,200,action==='activate'?monitor.activate(id):monitor.setStatus(id,action==='pause'?'paused':'archived'));}
  if(req.method==='POST'&&/^events\/[0-9a-f-]{36}\/read$/.test(path))return json(res,200,monitor.store.read(path.split('/')[1]));
  if(req.method==='POST'&&/^events\/[0-9a-f-]{36}\/receipt$/.test(path)){const result=monitor.store.confirmDelivery(path.split('/')[1],await body(req));monitor.emit('change',{});return json(res,200,result);}
  if(req.method==='GET'&&/^events\/[0-9a-f-]{36}$/.test(path)){const event=monitor.store.event(path.split('/')[1]);return json(res,event?200:404,event||{error:'提醒不存在'});}
  if(req.method==='POST'&&path==='test')return json(res,201,monitor.test((await body(req)).channels));
  if(req.method==='POST'&&path==='runtime'){const input=await body(req);if(typeof input.enabled!=='boolean')throw Error('请明确启动或停止监控');return json(res,200,monitor.setRuntime(input.enabled,String(input.reason||'本人操作').slice(0,100)));}
  if(req.method==='POST'&&path==='connection')return json(res,200,monitor.connect(await body(req)));
  if(req.method==='POST'&&path==='provider')return json(res,200,await monitor.useProvider((await body(req)).provider));
  if(req.method==='POST'&&path==='sources/check'){void monitor.announcements.poll().then(()=>monitor.emit('change',{}));return json(res,202,{status:'checking'});}
  if(req.method==='POST'&&path==='desktop/heartbeat'){const input=await body(req);monitor.desktop={at:Date.now(),supported:input.supported===true};return json(res,200,{ok:true});}
  if(req.method==='POST'&&path==='desktop/ack'){const input=await body(req);if(!['sending','accepted','failed','unknown'].includes(input.status)||!monitor.store.event(input.id))throw Error('通知回执无效');monitor.store.delivery(input.id,'desktop',input.status,input.note||'');monitor.emit('change',{});return json(res,200,{ok:true});}
  return json(res,404,{error:'提醒接口不存在'});
 }catch(error){return json(res,400,{error:error.message||'提醒处理失败'});}
}
res.on('finish',()=>{if(req.method==='POST'&&res.statusCode<300&&url.pathname.startsWith('/api/workbench/')&&!url.pathname.startsWith('/api/workbench/postmarket-reviews')&&!['/api/workbench/risk','/api/workbench/import/preview','/api/workbench/operation-files/sync'].includes(url.pathname)&&!/^\/api\/workbench\/cards\/[^/]+\/(trade|pnl-correction|draft|reviews)$/.test(url.pathname))void operationArchive.sync()});
if(req.method==='GET'&&url.pathname==='/api/volc/status')return json(res,200,volcStatus());
if(req.method==='POST'&&url.pathname==='/api/volc/session')return json(res,201,voiceTicket((await body(req)).contextSymbol));
if(req.method==='GET'&&url.pathname==='/api/three-axes')return json(res,200,buildAxesReport(await marketSnapshot()));
if(req.method==='POST'&&url.pathname==='/api/three-axes/size'){try{return json(res,200,sizeByRisk(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/feishu/bind/start')return json(res,202,await registration.start());
if(req.method==='POST'&&url.pathname==='/api/feishu/bind/status')return json(res,200,registration.status((await body(req)).id));
if(req.method==='POST'&&url.pathname==='/api/feishu/bind/cancel')return json(res,200,registration.cancel((await body(req)).id));
if(req.method==='POST'&&url.pathname==='/api/feishu/disconnect')return json(res,200,await disconnectFeishu());
if(req.method==='GET'&&url.pathname==='/api/feishu/status')return json(res,200,feishuStatus());
if(req.method==='GET'&&url.pathname==='/api/feishu/preview')return json(res,200,await previewFeishuReport());
if(req.method==='GET'&&url.pathname==='/api/eod-market/status')return json(res,200,await eodRefreshStatus());
if(req.method==='POST'&&url.pathname==='/api/eod-market/refresh'){void refreshEod();return json(res,202,{status:'refreshing'})}
if(req.method==='POST'&&url.pathname==='/api/feishu/schedule'){try{return json(res,200,await setFeishuSchedule(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/feishu/push'){try{return json(res,200,await pushFeishuReport())}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{app:'wujian-jarvis',version:APP_VERSION,mode:'local',projectRoot:ROOT,serverBuild});
if(url.pathname.startsWith('/api/codex/')||url.pathname==='/api/session')return json(res,410,{error:'旧模型通话入口已停用，请使用DeepSeek文字/语音对话'});
if(req.method==='GET'&&url.pathname==='/api/live-voice/status')return json(res,200,liveStatus());
if(req.method==='POST'&&url.pathname==='/api/live-voice/session'){try{return json(res,201,await createLive((await body(req)).sdp))}catch(e){return json(res,503,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/live-voice/delegate'){try{return json(res,200,await delegateLive(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(url.pathname==='/api/llm/status')return json(res,200,modelStatus());
if(req.method==='POST'&&url.pathname==='/api/chat'){try{const b=await body(req);return json(res,200,await assistantReply(b.messages,b.contextSymbol,{cardId:b.cardId}))}catch(e){return json(res,502,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/knowledge/status')return json(res,200,await knowledgeStatus());
if(req.method==='POST'&&url.pathname==='/api/knowledge/reindex'){try{return json(res,202,reindexKnowledge(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/knowledge/search'){try{return json(res,200,await searchKnowledge(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/knowledge\/source\/\d+$/.test(url.pathname)){try{return json(res,200,await knowledgeSource(Number(url.pathname.split('/').pop())))}catch(e){return json(res,404,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/rules')return json(res,200,await ruleRegistry());
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+\/removal$/.test(url.pathname)){try{return json(res,200,cardRemovalPreview(url.pathname.split('/')[4]))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/restore$/.test(url.pathname)){try{const result=restoreCard(url.pathname.split('/')[4]);await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/rules/detail')return json(res,200,await scanRuleDetails(await ruleRegistry(),applyDayTrendRule(await latestFire())));
if(req.method==='GET'&&url.pathname==='/api/workbench/governance')return json(res,200,systemGovernance());
if(req.method==='POST'&&url.pathname==='/api/workbench/governance/start'){try{return json(res,200,await beginSystemRun())}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/governance/finish'){try{return json(res,200,endSystemRun((await body(req)).result))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/governance/issues'){try{return json(res,200,recordIssue(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/reconcile-position$/.test(url.pathname)){try{const result=reconcileTradePosition(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/release$/.test(url.pathname)){try{return json(res,200,releasePlan(url.pathname.split('/')[4],(await body(req)).reason))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/contract-spec'){const spec=contractSpec(url.searchParams.get('symbol'));return json(res,spec?200:404,spec||{error:'该品种合约参数暂不可用'});}
if(req.method==='GET'&&url.pathname==='/api/workbench/summary'){const value=await summary(url.searchParams.get('accountId'));value.cards=await visibleCurrentCards(value.cards);value.pending=await visibleCurrentCards(value.pending);return json(res,200,value);}
if(req.method==='GET'&&url.pathname==='/api/workbench/accounts')return json(res,200,listAccounts());
if(req.method==='GET'&&/^\/api\/workbench\/accounts\/[^/]+\/balance-changes$/.test(url.pathname)){try{return json(res,200,listBalanceChanges(url.pathname.split('/')[4]))}catch(e){return json(res,404,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/operation-files')return json(res,200,operationArchive.status());
if(req.method==='POST'&&url.pathname==='/api/workbench/operation-files/sync'){await operationArchive.sync();return json(res,200,operationArchive.status());}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/trade$/.test(url.pathname)){try{const result=recordTrade(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,200,{...result,archive:operationArchive.status()})}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/pnl-correction$/.test(url.pathname)){try{const result=correctTradePnl(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,200,{...result,archive:operationArchive.status()})}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/draft$/.test(url.pathname)){try{const saved=saveExecutionDraft(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,200,saved)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+\/market-check$/.test(url.pathname)){try{const card=fullCard(url.pathname.split('/')[4]);if(!card)throw Error('交易卡不存在');const bars=card.trade.remainingLots>0?(await specificBars(card.contract)).bars:[];return json(res,200,checkTradeMarket(card.trade,bars,contractSpec(card.symbol)))}catch(e){return json(res,200,{status:'unknown',message:'行情核验暂不可用：'+e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/accounts'){try{const result=saveAccount(await body(req));await operationArchive.sync();return json(res,201,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/accounts\/[^/]+\/balance$/.test(url.pathname)){try{const result=syncAccountBalance(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='PATCH'&&/^\/api\/workbench\/accounts\/[^/]+\/balance-changes\/[^/]+$/.test(url.pathname)){try{const parts=url.pathname.split('/');const result=editBalanceChange(parts[4],parts[6],await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/accounts\/[^/]+\/balance-changes\/[^/]+\/void$/.test(url.pathname)){try{const parts=url.pathname.split('/'),result=voidBalance(parts[4],parts[6],await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='DELETE'&&/^\/api\/workbench\/accounts\/[^/]+$/.test(url.pathname)){try{const result=deleteOrDisableAccount(url.pathname.split('/').pop(),await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,409,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/cards')return json(res,200,await visibleCurrentCards(listCards({accountId:url.searchParams.get('accountId'),status:url.searchParams.get('status')})));
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+\/environment$/.test(url.pathname)){try{return json(res,200,await cardEnvironment(url.pathname.split('/')[4],{cycle:url.searchParams.get('cycle')||'day',force:url.searchParams.get('refresh')==='1'}))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/cards'){try{const input=await body(req);if(!input.id)await requireCurrentProduct(input.symbol);return json(res,201,saveCard(input))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+$/.test(url.pathname)){const item=fullCard(url.pathname.split('/').pop());return json(res,item?200:404,item||{error:'交易卡不存在'})}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+$/.test(url.pathname)){try{return json(res,200,saveCard({...await body(req),id:url.pathname.split('/').pop()}))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='DELETE'&&/^\/api\/workbench\/cards\/[^/]+$/.test(url.pathname)){try{const result=deleteCard(url.pathname.split('/').pop(),await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,409,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+\/gold$/.test(url.pathname)){try{return json(res,200,goldPlanning.history(url.pathname.split('/')[4]))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/gold\/(analyze|choose|review|approve)$/.test(url.pathname)){try{const parts=url.pathname.split('/');const result=await goldPlanning[parts[6]](parts[4],await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/plan$/.test(url.pathname)){try{return json(res,201,await savePlan(url.pathname.split('/')[4],await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/approve$/.test(url.pathname)){try{const result=await approvePlan(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,200,result)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+\/executions$/.test(url.pathname))return json(res,200,listExecutions(url.pathname.split('/')[4]));
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/executions$/.test(url.pathname)){try{return json(res,201,addExecution(url.pathname.split('/')[4],await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/cards\/[^/]+\/reviews$/.test(url.pathname))return json(res,200,reviewForCard(url.pathname.split('/')[4]));
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/reviews$/.test(url.pathname)){try{const saved=saveReview(url.pathname.split('/')[4],await body(req));await operationArchive.sync();return json(res,201,saved)}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/risk'){try{const input=await body(req);if(input.cardId)input.layers=(await cardEnvironment(input.cardId,{cycle:input.plan?.mainCycle||'day'})).layers;return json(res,200,calculateRisk(input))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/fire')return json(res,200,applyDayTrendRule(await latestFire()));
if(req.method==='GET'&&url.pathname==='/api/workbench/relative-strength')return json(res,200,await latestStrength(await latestFire()));
if(req.method==='GET'&&url.pathname==='/api/postmarket-sources')return json(res,200,await sourceConnectionStatus());
if(req.method==='POST'&&url.pathname==='/api/postmarket-sources'){try{return json(res,200,await saveSourceConnection(await body(req)))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/postmarket-reviews')return json(res,200,await postmarketReview.history(url.searchParams.get('mode')));
if(req.method==='GET'&&url.pathname==='/api/workbench/postmarket-reviews/current')return json(res,200,postmarketReview.current());
if(req.method==='POST'&&url.pathname==='/api/workbench/postmarket-reviews'){try{return json(res,202,postmarketReview.start((await body(req)).mode||'all'))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/postmarket-reviews\/[0-9a-f-]{36}\/save$/.test(url.pathname)){try{return json(res,200,await postmarketReview.save(url.pathname.split('/')[4]))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/postmarket-reviews\/[0-9a-f-]{36}\/result$/.test(url.pathname)){try{return json(res,200,await postmarketReview.result(url.pathname.split('/')[4]))}catch(e){return json(res,404,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/workbench\/postmarket-reviews\/[0-9a-f-]{36}$/.test(url.pathname)){try{return json(res,200,await postmarketReview.status(url.pathname.split('/')[4]))}catch(e){return json(res,404,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/fire/bars'){try{return json(res,200,await specificBars(url.searchParams.get('contract')))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/fire/refresh'){try{if(postmarketReview.isCapturing())throw Error('正在固定本次复盘数据，请稍后刷新');return json(res,202,await startFireRefresh())}catch(e){return json(res,409,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/fire/select'){try{const input=await body(req);return json(res,201,input.mode===DAY_TREND_MODE?selectDayTrendCandidate(input,{fire:await latestFire(),cards:listCards({accountId:input.accountId}),saveCard}):await selectFireCandidate(input))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/import/preview'){try{return json(res,200,previewCsv((await body(req)).csv))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/workbench/import/commit'){try{const b=await body(req);return json(res,201,commitCsv(b.cardId,b.rows))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/workbench/changes')return json(res,200,listChanges());
if(req.method==='GET'&&url.pathname==='/api/workbench/backup'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="wujian-workbench-${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'no-store'});return res.end(JSON.stringify(await backup(),null,2))}
if(url.pathname==='/api/status'){const live=await marketSnapshot();return json(res,200,{mode:'real-research',realtimeConfigured:false,chatConfigured:!!process.env.DEEPSEEK_API_KEY,llm:modelStatus(),marketConnected:['observing','eod-ready'].includes(live.status)&&live.quotes.length>0,marketStatus:live.status,brokerConnected:false,tasks:(await listReports()).map(({id,name,status,stage,created})=>({id,name,status,stage,created})),decisions:[]});}
if(req.method==='POST'&&url.pathname==='/api/research/run'){try{const b=await body(req);if(!b.cardId)await requireCurrentProduct(b.product);return json(res,202,await startResearch(b.cardId?{product:b.product,cardId:b.cardId}:b.product))}catch(e){return json(res,400,{error:e.message})}}
if(req.method==='GET'&&/^\/api\/research\/cards\/[^/]+$/.test(url.pathname)){const cardId=url.pathname.split('/').pop();return json(res,200,(await listReports(Infinity)).filter(r=>r.cardId===cardId).map(({report,sources,evidence,inputWater,...meta})=>meta));}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/water-notes$/.test(url.pathname)){try{return json(res,200,saveWaterNotes(url.pathname.split('/')[4],await body(req)))}catch(e){return json(res,409,{error:e.message})}}
if(req.method==='POST'&&/^\/api\/workbench\/cards\/[^/]+\/apply-research$/.test(url.pathname)){try{return json(res,200,await applyResearchDraft(url.pathname.split('/')[4],await body(req)))}catch(e){return json(res,409,{error:e.message})}}
if(req.method==='GET'&&url.pathname==='/api/research/universe')return json(res,200,await researchUniverse());
if(req.method==='GET'&&url.pathname==='/api/research/batch')return json(res,200,researchBatchStatus());
if(req.method==='POST'&&url.pathname==='/api/research/batch'){try{return json(res,202,await startResearchBatch(await body(req)))}catch(e){return json(res,409,{error:e.message})}}
if(req.method==='POST'&&url.pathname==='/api/research/batch/stop')return json(res,200,await stopResearchBatch());
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
if(url.pathname==='/api/live-market')return json(res,200,await marketSnapshot(url.searchParams.get('scope')==='all'?'all':'research'));
if(url.pathname==='/api/market')return json(res,200,await marketSnapshot(url.searchParams.get('scope')==='all'?'all':'research'));
if(url.pathname.startsWith('/api/tasks')||url.pathname==='/api/decisions')return json(res,410,{error:'生成示例接口已移除，请使用真实研究报告入口'});
if(req.method==='POST'&&url.pathname==='/api/tool'){const b=await body(req);if(b.name==='get_akshare_futures_data')return json(res,200,await akshareData(b.args));if(fundamentalsTools.some(t=>t.name===b.name))return json(res,200,await fundamentalsQuery(b.name,b.args));if(researchTools.some(t=>t.name===b.name))return json(res,200,await researchQuery(b.name,b.args));if(marketTools.some(t=>t.name===b.name))return json(res,200,await marketQuery(b.name,b.args));if(b.name==='get_external_context')return json(res,200,await externalData(b.args?.provider));if(b.name==='get_official_news')return json(res,200,await officialNews());if(b.name==='get_current_rules')return json(res,200,await rules());return json(res,400,{error:'工具未授权'})}
if(req.method!=='GET')return json(res,405,{error:'方法不支持'});const p=resolve(PUBLIC,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(PUBLIC+sep))return json(res,403,{error:'拒绝访问'});try{let content=await readFile(p);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'});res.end(content)}catch{json(res,404,{error:'文件不存在'})}
}catch(e){json(res,400,{error:'请求无效或本地处理失败'})}});
const closeVolc=attachVolc(server,PORT);
await loadVoiceConfig();
await tqLogin.init();
await loadBinding().catch(()=>{});
const stopEodSchedule=process.env.WUJIAN_SKIP_EOD_SCHEDULE==='1'?()=>{}:startEodSchedule();
server.listen(PORT,'127.0.0.1',()=>{console.log(`小木 local workspace: http://127.0.0.1:${PORT}`);void startFeishu()});
monitor.start();
if(process.env.WUJIAN_TREND_AUTOSTART!=='0')void trendMonitor.start().catch(()=>console.error('全品种监控启动未完成，请在监控页面核验数据状态'));
void operationArchive.sync();
const archiveRetry=setInterval(()=>{if(operationArchive.status().status==='error')void operationArchive.sync()},15000);archiveRetry.unref();

for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{trendMonitor.stop();panorama.stop();monitor.stop();closeVolc();stopEodSchedule();registration.stop();stopFeishu();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref()});
