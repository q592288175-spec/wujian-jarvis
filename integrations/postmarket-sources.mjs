import {parse} from 'parse5';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const configPath=resolve('.runtime/private/market-sources.json');
const hash=text=>createHash('sha256').update(text).digest('hex');
const failure=e=>e.message==='fetch failed'?'网络连接失败，未取得有效响应':/timeout|aborted/i.test(e.message)?'来源连接超时，未取得有效响应':e.message;
const number=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(String(value).replaceAll(',','')))?Number(String(value).replaceAll(',','')):null;
const nodes=(node,predicate)=>{const found=[];function visit(n){if(predicate(n))found.push(n);for(const child of n.childNodes||[])visit(child)}visit(node);return found};
const attribute=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const textOf=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).filter(n=>!['script','style'].includes(n.tagName)).map(textOf).join(' ').replace(/\s+/g,' ').trim();
const plain=html=>textOf(parse(String(html||'')));
const chinaTime=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date):null};
export function classifyPublication(value,date,capturedAt=new Date().toISOString()){
 const time=chinaTime(value);if(!time||Date.parse(value)>Date.parse(capturedAt)||time.slice(0,10)>date)return null;
 if(time.slice(0,10)<date)return Date.parse(date)-Date.parse(time.slice(0,10))<=7*86400000?'历史背景':null;
 return time.slice(11)>='15:00:00'?'盘后信息（仅用于次日背景）':'当日盘前 / 盘中消息';
}
async function pool(values,fn){let i=0;const results=Array(values.length);await Promise.all(Array.from({length:Math.min(3,values.length)},async()=>{while(i<values.length){const j=i++;try{results[j]=await fn(values[j])}catch(e){results[j]={error:e.message}}}}));return results}
const hosts=new Set(['www.cls.cn','mcp.jin10.com','www.shfe.com.cn','www.ine.cn','www.dce.com.cn','www.gfex.com.cn','www.czce.com.cn']);
async function fetchText(url,options={}){
 if(!hosts.has(new URL(url).hostname))throw Error('来源不在授权白名单');
 const {onHeaders,...request}=options;
 const response=await fetch(url,{...request,signal:AbortSignal.timeout(14000),redirect:'error'});
 if(!response.ok)throw Error(`来源返回 HTTP ${response.status}`);
 onHeaders?.(response.headers);
 const reader=response.body.getReader();let length=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>3*1024*1024)throw Error('来源正文超过读取上限');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 return new TextDecoder().decode(Buffer.concat(chunks));
}
export async function sourceSettings(path=configPath){
 let stored={};try{stored=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('本机金十配置无法读取，请检查文件格式与权限')}
 const token=Object.hasOwn(stored,'jin10Token')?stored.jin10Token:(process.env.JIN10_MCP_TOKEN||'');
 return {jin10Token:typeof token==='string'?token:'',updatedAt:stored.updatedAt||null};
}
export async function sourceConnectionStatus(path=configPath){const s=await sourceSettings(path);return {jin10Configured:!!s.jin10Token,updatedAt:s.updatedAt,notice:'Token仅在本机保存；是否可取数据以下次复盘的官方接口结果为准',url:'https://mcp.jin10.com/app/doc.html'}}
export async function saveSourceConnection(input,path=configPath){
 if(typeof input.jin10Token!=='string'||input.jin10Token.length>4096||/[\r\n]/.test(input.jin10Token))throw Error('请输入有效的金十 MCP Token');
 const data={jin10Token:input.jin10Token.trim(),updatedAt:new Date().toISOString()};
 await mkdir(dirname(path),{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,path);return sourceConnectionStatus(path);
}
export function parseClsSubject(html){
 const document=parse(html),script=nodes(document,n=>n.tagName==='script'&&attribute(n,'id')==='__NEXT_DATA__')[0];
 if(!script)throw Error('财联社公开页面未返回结构化正文');
 const data=JSON.parse((script.childNodes||[]).map(n=>n.value||'').join('')).props?.pageProps;
 if(!Array.isArray(data?.data?.articles))throw Error('财联社栏目结构发生变化');
 return data.data.articles.map(a=>({key:String(a.article_id),title:plain(a.article_title),text:plain(a.article_type===-1?a.article_title:a.article_brief),published:new Date(a.article_time*1000).toISOString(),url:`https://www.cls.cn/detail/${a.article_id}`,fullText:a.article_type===-1}));
}
function clsDetail(html){
 const script=nodes(parse(html),n=>n.tagName==='script'&&attribute(n,'id')==='__NEXT_DATA__')[0];
 const article=JSON.parse((script?.childNodes||[]).map(n=>n.value||'').join('')).props?.pageProps?.articleDetail;
 if(article?.isFree===false||!article?.content)throw Error('财联社全文未公开或未取得');
 return {text:plain(article.content),published:new Date(article.ctime*1000).toISOString(),fullText:true};
}
const topics=[1501,1741,11394,11395,11396,11397,11408,11403,11405,11425,1483,1385];
function matching(article,rows,profiles){
 const content=article.title+' '+article.text;
 return rows.filter(row=>{const p=profiles.find(p=>p.symbol===row.code),terms=[row.name,p?.name,...String(p?.aliases||'').split(/[,，;；]/)].filter(v=>v?.length>1&&!/^[A-Z0-9]+$/.test(v));return terms.some(t=>content.includes(t))||p?.name?.length===1&&content.includes(p.name)&&['价','矿','库存','期货','供应','需求'].some(s=>content.includes(p.name+s))}).map(r=>r.code);
}
export async function collectCls(report,profiles,read=fetchText,documents=[]){
 const errors=[],unique=new Map(),fetchedAt=new Date().toISOString();
 const results=await pool(topics,async id=>{const url=`https://www.cls.cn/subject/${id}`,html=await read(url);documents.push({url,text:html,hash:hash(html),fetchedAt});return parseClsSubject(html)});
 for(const result of results){if(result?.error){errors.push(result.error);continue}for(const a of result){const classification=classifyPublication(a.published,report.date,fetchedAt);if(!classification)continue;const codes=matching(a,report.rows,profiles);if(codes.length&&!unique.has(a.key))unique.set(a.key,{...a,codes,classification})}}
 const selected=[...unique.values()].sort((a,b)=>Number(b.classification!=='历史背景')-Number(a.classification!=='历史背景')||b.published.localeCompare(a.published)).slice(0,32);
 await pool(selected.filter(a=>!a.fullText).slice(0,8),async article=>{try{const html=await read(article.url),detail=clsDetail(html),classification=classifyPublication(detail.published,report.date,fetchedAt);if(!classification){article.fullText=false;article.text='';return}Object.assign(article,detail,{classification});documents.push({url:article.url,text:html,hash:hash(html),fetchedAt})}catch{article.fullText=false}});
 return {items:selected.map(a=>({...a,type:'news',source:'财联社',fetchedAt,text:a.text.slice(0,6000),hash:hash(a.text),notice:a.fullText?'已读取公开正文':'仅标题 / 摘要，不作为已核验产业事实'})),provider:{name:'财联社',status:errors.length?'partial':'sampled',count:selected.length,url:'https://www.cls.cn/subject/1501',coverage:'12个公开栏目，每栏目最近20条；候选相关取样，非当日全量；15点后消息仅作次日背景',reason:errors.length?`${errors.length}个栏目未取得正文`:null}};
}
export function parseExchangeTable(html,date,kind,profiles){
 const document=parse(html),intro=textOf(document);
 if(intro.match(/\d{4}-\d{2}-\d{2}/)?.[0]!==date)throw Error('交易所表格日期未核验，或返回验证页面');
 const records=[];
 for(const table of nodes(document,n=>n.tagName==='table')){
  const trs=nodes(table,n=>n.tagName==='tr'),head=trs.find(tr=>String(attribute(tr,'class')||'').includes('special_row_type'));
  if(!head)continue;const title=textOf(head),unit=title.match(/单位\s*[:：]\s*(\S+)/)?.[1];
  const productName=title.split(/单位\s*[:：]/)[0].replace(/\s/g,'');
  const product=profiles.find(p=>['SHFE','INE'].includes(p.exchange)&&[p.name,...String(p.aliases||'').split(/[,，;；]/)].some(v=>v.replace(/\s/g,'')===productName));
  if(!product)continue;
  const total=trs.find(tr=>textOf((tr.childNodes||[]).find(n=>n.tagName==='td')||{})==='总计');if(!total)continue;
  const cells=nodes(total,n=>n.tagName==='td').map(textOf),weekly=kind==='inventory',value=number(cells[weekly?3:1]),change=number(cells[weekly?5:2]);
  if(value===null||!unit)continue;
  records.push({code:product.symbol,name:product.name,type:kind,observedDate:date,value,change,previous:weekly?number(cells[1]):null,unit,period:weekly?'较上期周报':'较上一交易日',label:weekly?'交割库符合交割品质库存（含仓单）':'已制成仓单数量',scope:weekly?'交易所交割库口径，不等于社会 / 全行业库存':'仓单不等于总库存'});
 }
 if(!records.length)throw Error('未取得可核验的交易所合计行');return records;
}
export function parseShfeRanks(json,date,rows){
 const data=JSON.parse(json);if(data.report_date!==date.replaceAll('-','')||!Array.isArray(data.o_cursor))throw Error('席位数据日期或结构未核验');
 return rows.flatMap(row=>{const contract=row.contract.split('.').at(-1).toLowerCase(),matches=data.o_cursor.filter(r=>String(r.INSTRUMENTID).trim().toLowerCase()===contract&&number(r.RANK)>0&&number(r.RANK)<=20);if(!matches.length)return [];
  const sum=key=>matches.every(r=>number(r[key])!==null)?matches.reduce((s,r)=>s+number(r[key]),0):null;
  return [{code:row.code,name:row.name,type:'holdings',observedDate:date,contract:row.contract,value:sum('CJ2'),change:sum('CJ2_CHG'),shortValue:sum('CJ3'),shortChange:sum('CJ3_CHG'),unit:'手',label:'合约前20名席位多 / 空持仓',scope:'多空榜可能是不同席位，不能视为全市场持仓或资金净流入'}];
 });
}
function friday(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+2)%7));return d.toISOString().slice(0,10)}
async function collectExchange(report,profiles,read,documents){
 const items=[],providers=[],stamp=report.date.replaceAll('-',''),week=friday(report.date),requests=[
  {name:'上期所仓单',url:`https://www.shfe.com.cn/data/tradedata/future/stockdata/dailystock_${stamp}/ZH/all.html`,parse:html=>parseExchangeTable(html,report.date,'warehouse',profiles)},
  {name:'上期所周库存',url:`https://www.shfe.com.cn/data/tradedata/future/stockdata/weeklystock_${week.replaceAll('-','')}/ZH/all.html`,parse:html=>parseExchangeTable(html,week,'inventory',profiles)},
  {name:'上期所席位持仓',url:`https://www.shfe.com.cn/data/tradedata/future/dailydata/pm${stamp}.dat`,parse:html=>parseShfeRanks(html,report.date,report.rows)}];
 await pool(requests,async request=>{try{const raw=await read(request.url),records=request.parse(raw),fetchedAt=new Date().toISOString();documents.push({url:request.url,text:raw,hash:hash(raw),fetchedAt});items.push(...records.filter(r=>report.rows.some(row=>row.code===r.code)).map(r=>({...r,title:`${r.name} · ${r.label}`,source:request.name,url:request.url,fetchedAt,published:r.observedDate,classification:r.observedDate===report.date?'复盘日交易所数据':'最新有效周报（非当日变化）',text:`${r.label} ${r.value} ${r.unit}；变化 ${r.change??'未获取'} ${r.unit}；${r.scope}`,hash:hash(raw)})));providers.push({name:request.name,status:'ok',count:records.filter(r=>report.rows.some(row=>row.code===r.code)).length,date:records[0]?.observedDate,url:request.url,coverage:'原表合计行 / 具体合约，不含其他交易所或全行业库存'})}catch(e){providers.push({name:request.name,status:'unavailable',count:0,url:request.url,reason:e.message})}});
 // Do not interpret challenge pages or unverified units as exchange statistics.
 const others=[{name:'郑商所仓单',url:`https://www.czce.com.cn/cn/DFSStaticFiles/Future/${report.date.slice(0,4)}/${stamp}/FutureDataWhsheet.htm`},{name:'能源中心仓单',url:`https://www.ine.cn/data/tradedata/future/stockdata/dailystock_${stamp}/ZH/all.html`}];
 await pool(others,async s=>{try{await read(s.url);providers.push({...s,status:'unavailable',count:0,reason:'页面未通过当前日期、合计行和单位核验，未提取数值'})}catch(e){providers.push({...s,status:'unavailable',count:0,reason:e.message})}});
 const jsonSources=[{name:'大商所仓单',url:'https://www.dce.com.cn/dcereport/publicweb/dailystat/wbillWeeklyQuotes',options:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tradeDate:stamp,varietyId:'all'})}},{name:'广期所仓单',url:'https://www.gfex.com.cn/u/interfacesWebTdWbillWeeklyQuotes/loadList',options:{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'gen_date='+stamp}}];
 await pool(jsonSources,async s=>{try{await read(s.url,s.options);providers.push({name:s.name,url:s.url,status:'unavailable',count:0,reason:'响应尚未通过日期、合计口径与原单位核验，未采用数值'})}catch(e){providers.push({name:s.name,url:s.url,status:'unavailable',count:0,reason:e.message})}});
 return {items,providers};
}
function mcpPayload(raw){
 let data;try{data=JSON.parse(raw)}catch{const events=raw.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>{try{return JSON.parse(l.slice(5))}catch{return null}});data=events.findLast(v=>v?.result||v?.error)}
 if(!data||data.error)throw Error('金十 MCP 未返回有效结果');return data.result;
}
export function jin10Arguments(schema,query){
 const props=schema?.properties||{},args={};for(const key of Object.keys(props))if(['query','keyword','search','search_query','searchKeyword'].includes(key))args[key]=query;
 for(const key of schema?.required||[])if(!Object.hasOwn(args,key))throw Error(`金十工具必要字段 ${key} 尚未适配`);return args;
}
export async function createJin10Client(token,read=fetchText){
 if(!token)throw Error('未配置金十官方 MCP Token');
 let id=0;const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+token};
 const rpc=async(method,params)=>mcpPayload(await read('https://mcp.jin10.com/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),onHeaders:h=>{const session=h.get('mcp-session-id');if(session)headers['Mcp-Session-Id']=session}}));
 const initialized=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'xiaomu-postmarket',version:'1.0'}});
 headers['MCP-Protocol-Version']=initialized?.protocolVersion||'2025-11-25';
 await read('https://mcp.jin10.com/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
 const tools=(await rpc('tools/list',{}))?.tools||[];let resources=[];try{resources=(await rpc('resources/list',{}))?.resources||[]}catch{}
 return {tools,resources,async call(name,args={}){
  const tool=tools.find(t=>t.name===name);if(!tool)throw Error('金十未声明此工具');
  const schema=tool.inputSchema||{};if(Object.keys(args).some(key=>!Object.hasOwn(schema.properties||{},key)))throw Error('金十工具包含未声明参数');
  if((schema.required||[]).some(key=>!Object.hasOwn(args,key)))throw Error('金十工具缺少必要参数');
  for(const [key,value] of Object.entries(args)){const p=schema.properties[key];if(p.type==='string'&&typeof value!=='string'||p.type==='integer'&&!Number.isInteger(value)||p.type==='number'&&(!Number.isFinite(value)||typeof value!=='number'))throw Error('金十工具参数类型不正确');if(p.minimum!==undefined&&value<p.minimum||p.maximum!==undefined&&value>p.maximum)throw Error('金十工具参数超出范围')}
  const result=await rpc('tools/call',{name,arguments:args});if(result?.isError)throw Error('金十业务错误：授权、额度或请求暂不可用');
  const data=result?.structuredContent;if(!data||data.status&&data.status!==200)throw Error('金十未返回成功的 structuredContent');return data;
 },async resource(uri){if(!resources.some(r=>r.uri===uri))throw Error('金十未声明此资源');return rpc('resources/read',{uri})}};
}
export async function collectJin10(report,profiles,token,read=fetchText){
 const provider={name:'金十数据',status:'unavailable',count:0,url:'https://mcp.jin10.com/app/doc.html'};
 if(!token)return {items:[],provider:{...provider,reason:'未配置官方 MCP Token；未读取付费或需授权内容'}};
 const found=new Map(),errors=[];let client;
 try{client=await createJin10Client(token,read)}catch(e){return {items:[],provider:{...provider,reason:e.message.replaceAll(token,'[已隐藏]')}}}
 const fetchedAt=new Date().toISOString();let calls=0;
 function add(a,fullText){const published=a.time||a.published_at,classification=classifyPublication(published,report.date,fetchedAt);if(!classification)return;const article={key:String(a.id||a.url||hash(String(a.content)+published)),newsId:!fullText?a.id:null,title:plain(a.title||a.content),text:plain(fullText?a.content:a.introduction||''),published,url:a.url||(a.id?`https://flash.jin10.com/detail/${encodeURIComponent(a.id)}`:null)},codes=matching(article,report.rows,profiles);const promotional=/点击阅读|点击链接|点击查看|点击进入/.test(article.text);if(codes.length)found.set(article.key,{...article,codes,type:'news',source:'金十数据',classification,fetchedAt,fullText:fullText&&!promotional,hash:hash(article.text),notice:promotional?'引流标题线索，未取得所链接文章全文':fullText?'官方正文':'仅资讯摘要，等待正文核验'})}
 const call=async(name,args={})=>{if(++calls>28)throw Error('本次金十读取已到安全上限');return client.call(name,args)};
 if(client.tools.some(t=>t.name==='list_flash')){
  let cursor;for(let page=0;page<8;page++)try{const payload=await call('list_flash',cursor?{cursor}:{}),data=payload.data;if(!Array.isArray(data?.items))throw Error('快讯列表结构未核验');for(const a of data.items)add(a,true);const dates=data.items.map(a=>chinaTime(a.time)?.slice(0,10)).filter(Boolean);if(dates.some(d=>d<report.date)||!data.has_more||!data.next_cursor||data.next_cursor===cursor)break;cursor=data.next_cursor}catch(e){errors.push(e.message);break}
 }
 const keywords=[...new Set([...(report.focus?.long||[]),...(report.focus?.short||[]),...report.rows.map(r=>r.code)].map(code=>profiles.find(p=>p.symbol===code)?.name).filter(Boolean))].slice(0,5);
 for(const keyword of keywords){for(const [tool,full] of [['search_flash',true],['search_news',false]])if(client.tools.some(t=>t.name===tool))try{const payload=await call(tool,{keyword});if(!Array.isArray(payload.data?.items))throw Error('搜索结果结构未核验');for(const a of payload.data.items)add(a,full)}catch(e){errors.push(e.message)}}
 for(const article of [...found.values()].filter(a=>!a.fullText&&a.newsId).slice(0,6))if(client.tools.some(t=>t.name==='get_news'))try{const payload=await call('get_news',{id:String(article.newsId)});add(payload.data,true)}catch(e){errors.push(e.message)}
 return {items:[...found.values()].slice(0,45),provider:{...provider,status:errors.length?'partial':'sampled',count:found.size,coverage:`标准 MCP，快讯最多8页 + ${keywords.length}个候选关键词；${calls}次工具读取，非全天穷尽；使用 cursor / next_cursor`,reason:errors.length?[...new Set(errors)].join('；').replaceAll(token,'[已隐藏]'):null}};
}

export const jin10Tools=[{name:'get_jin10_data',description:'通过金十官方 MCP 读取最新快讯、资讯全文、财经日历或国际报价。报价必须先 quote_codes 确认代码；国际现货不是国内期货合约。信息只供研究，不产生下单或许可。',parameters:{type:'object',properties:{tool:{type:'string',enum:['quote_codes','get_quote','get_kline','list_flash','search_flash','list_news','search_news','get_news','list_calendar']},arguments:{type:'object'}},required:['tool'],additionalProperties:false}}];
export async function jin10Query({tool,arguments:args={}},options={}){
 const settings=await sourceSettings();try{const client=await createJin10Client(settings.jin10Token,options.read||fetchText);const result=tool==='quote_codes'?await client.resource('quote://codes'):await client.call(tool,args);return {source:'金十官方 MCP',fetchedAt:new Date().toISOString(),result,notice:'按来源时间与原单位使用；外盘现货不能替代国内期货行情，新闻不是交易许可'}}catch(e){return {source:'金十官方 MCP',error:e.message.replaceAll(settings.jin10Token||'\0','[已隐藏]'),notice:'数据未取得，不得以记忆补造'}}
}
export async function collectPostmarketSources(report,profiles,{read=fetchText,token}={}){
 const documents=[];let configError;if(token===undefined)try{token=(await sourceSettings()).jin10Token}catch(e){configError=e.message;token=''}
 const cls=await collectCls(report,profiles,read,documents),exchange=await collectExchange(report,profiles,read,documents),jin10=await collectJin10(report,profiles,token,read);
 const index={name:'文华商品指数',status:'unavailable',url:'https://www.wenhua.com.cn/guide/lssj.htm',reason:'未接通授权 WT9 数据；公开历史接口不含当日。接口授权是否覆盖商品指数尚待核验，商品样本等权统计不是文华指数'};
 if(configError)jin10.provider.reason=configError;
 const providers=[cls.provider,jin10.provider,...exchange.providers,index].map(p=>({...p,reason:p.reason?failure({message:p.reason}):null}));
 return {items:[...cls.items,...jin10.items,...exchange.items],providers,documents,index,fetchedAt:new Date().toISOString()};
}
