// 水研究预采集：并行取得单品种最新资讯、仓单、席位和机构线索，统一编号后交给模型。
// 每个来源独立超时、独立失败，失败写入缺口，不补造数值。
import {searchLatestNews,readNewsArticle} from './research-sources.mjs';
import {collectCls,collectJin10,sourceSettings} from './postmarket-sources.mjs';
import {searchImaResearch} from './ima-research.mjs';
import {collectOfficial} from './official-sources.mjs';

const EM_DATA='https://datacenter-web.eastmoney.com/api/data/v1/get';
const beijingDate=(value=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(value);
const withTimeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(`${label}超时`)),ms))]);

async function emReport(reportName,filter,{columns='ALL',pageSize=50,sort='TRADE_DATE',order='-1'}={}){
 const url=new URL(EM_DATA);
 for(const [key,value] of Object.entries({reportName,columns,filter,pageNumber:'1',pageSize:String(pageSize),sortColumns:sort,sortTypes:order,source:'WEB',client:'WEB'}))url.searchParams.set(key,value);
 const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error(`东方财富数据中心返回 HTTP ${response.status}`);
 const data=await response.json();
 if(data.code===9201)return [];
 if(!data.success)throw Error(data.message||'东方财富数据中心返回失败');
 return data.result?.data||[];
}

// 东方财富对上期能源、广期所用小写代码（sc、si2611），其余交易所用大写，两种都查。
const bothCases=code=>`("${String(code).toUpperCase()}","${String(code).toLowerCase()}")`;
// 郑商所三位月份（MA611）补齐为东方财富四位（MA2611）。
export function eastmoneyContract(contract){
 const match=String(contract||'').split('.').at(-1).match(/^([A-Za-z]+)(\d{3,4})$/);
 if(!match)return null;
 return match[1].toUpperCase()+(match[2].length===3?'2'+match[2]:match[2]);
}

export async function warehouseReceipts(code){
 const rows=await emReport('RPT_FUTU_STOCKDATA',`(SECURITY_CODE in ${bothCases(code)})`,{columns:'SECURITY_CODE,TRADE_DATE,ON_WARRANT_NUM,ADDCHANGE',pageSize:10});
 return rows.map(r=>({date:String(r.TRADE_DATE).slice(0,10),receipts:r.ON_WARRANT_NUM,change:r.ADDCHANGE}));
}

export function summarizePositions(rows){
 if(!rows.length)return null;
 const date=rows.map(r=>String(r.TRADE_DATE).slice(0,10)).sort().at(-1),day=rows.filter(r=>String(r.TRADE_DATE).startsWith(date));
 const total=day.find(r=>r.TYPE==='1'&&r.MEMBER_NAME_ABBR==='本日合计'),members=day.filter(r=>r.TYPE==='0');
 const top=(rankKey,valueKey,changeKey)=>members.filter(r=>r[rankKey]>0&&r[rankKey]<=5).sort((a,b)=>a[rankKey]-b[rankKey]).map(r=>({member:r.MEMBER_NAME_ABBR,position:r[valueKey],change:r[changeKey]}));
 const net=total&&Number.isFinite(total.LONG_POSITION)&&Number.isFinite(total.SHORT_POSITION)?total.LONG_POSITION-total.SHORT_POSITION:null;
 const netChange=total&&Number.isFinite(total.LP_CHANGE)&&Number.isFinite(total.SP_CHANGE)?total.LP_CHANGE-total.SP_CHANGE:null;
 return {date,contract:day[0]?.SECURITY_CODE?.toUpperCase()||null,settle:day[0]?.SETTLE_PRICE??null,top20Long:total?.LONG_POSITION??null,top20LongChange:total?.LP_CHANGE??null,top20Short:total?.SHORT_POSITION??null,top20ShortChange:total?.SP_CHANGE??null,top20Net:net,top20NetChange:netChange,topLong:top('LP_RANK','LONG_POSITION','LP_CHANGE'),topShort:top('SP_RANK','SHORT_POSITION','SP_CHANGE')};
}

export async function memberPositions(contract){
 const code=eastmoneyContract(contract);if(!code)throw Error('缺少具体合约，无法读取席位');
 const rows=await emReport('RPT_FUTU_DAILYPOSITION',`(SECURITY_CODE in ${bothCases(code)})(TYPE in ("0","1"))`,{pageSize:120});
 return summarizePositions(rows);
}

export async function mainContract(code){
 const rows=await emReport('RPT_FUTU_POSITIONCODE',`(TRADE_CODE in ${bothCases(code)})(IS_MAINCODE="1")`,{columns:'SECURITY_CODE,IS_MAINCODE,TRADE_CODE',sort:'SECURITY_CODE',pageSize:5});
 return rows[0]?.SECURITY_CODE?.toUpperCase()||null;
}

// 相关度：标题命中最强；正文命中时还要有期货来源、产业数据或行情栏目佐证，过滤顺带提及的泛财经文章。
const relevance=(item,terms)=>{
 const title=item.title||'',body=item.text||'';
 let score=terms.some(t=>title.includes(t))?3:terms.some(t=>body.includes(t))?1:0;
 if(!score)return 0;
 if(/期货|收评|早餐|播报|日报|周报|黑色|能化|化工|有色|农产品|油脂|软商品|现货|库存|开工|装置|检修|港口|政策/.test(title))score+=1;
 if(/期货|东方财富研究中心|上海证券报|中国证券报|证券时报|新华|财联社|Mysteel|我的钢铁|隆众|卓创|生意社/.test(item.source||''))score+=1;
 if(/产量|库存|厂库|社库|表需|开工|产能利用率|利润|基差|仓单|装置|检修|到港|进口|出口|现货|出厂价|升贴水|供应|需求/.test(body))score+=1;
 return score;
};
// 长文（如全市场收评）只保留首段和提及该品种的段落，避免截断后丢失关键内容。
export function focusText(text,terms,max=1500){
 const paragraphs=String(text||'').split(/\n+/).map(p=>p.trim()).filter(Boolean);
 const picked=paragraphs.filter((p,i)=>i===0||terms.some(t=>p.includes(t)));
 return (picked.length>1?picked:paragraphs).join('\n').slice(0,max);
}

export async function collectNews(product,{now=new Date(),days=10}={}){
 const terms=[product.name,...String(product.aliases||'').split(/[,，;；]/)].map(s=>s.trim()).filter(t=>t.length>1&&!/^[A-Z0-9]+$/.test(t));
 const queries=[...new Set([product.name,`${product.name}期货`,terms.find(t=>t!==product.name)].filter(Boolean))];
 const batches=await Promise.all(queries.map(query=>searchLatestNews({query,days,limit:20,now}).catch(()=>({items:[]}))));
 const unique=new Map();
 for(const item of batches.flatMap(b=>b.items||[])){const score=relevance(item,terms);if(score>=3&&!unique.has(item.url))unique.set(item.url,{...item,score})}
 const ranked=[...unique.values()].sort((a,b)=>b.score-a.score||b.published.localeCompare(a.published)).slice(0,14);
 await Promise.all(ranked.slice(0,8).map(async item=>{try{const article=await readNewsArticle({url:item.url});if(article.text){item.text=focusText(article.text,terms);item.fullText=true}}catch{}}));
 return ranked.sort((a,b)=>b.published.localeCompare(a.published));
}

// 产出给模型和页面共用的证据包：items 用 E 编号，providers 记录每个来源的取得状态。
export async function collectResearchEvidence({code,name,aliases='',contract,sector,exchange,price,priceBasis='主力连续代理'},{now=new Date()}={}){
 const fetchedAt=now.toISOString(),today=beijingDate(now),product={symbol:code,name,aliases};
 const report={date:today,rows:[{code,name,contract,sector}],focus:{long:[code],short:[]}};
 const profiles=[{symbol:code,name,aliases:String(aliases).replace(/,/g,';')}];
 const task=(label,ms,run)=>withTimeout(run(),ms,label).then(value=>({label,value}),error=>({label,error:error.message}));
 const results=await Promise.all([
  task('东方财富资讯',25000,()=>collectNews(product,{now})),
  task('财联社',30000,()=>collectCls(report,profiles,undefined,[])),
  task('金十数据',30000,async()=>collectJin10(report,profiles,(await sourceSettings()).jin10Token)),
  task('交易所仓单（东方财富汇总）',12000,()=>warehouseReceipts(code)),
  task('前20席位持仓（东方财富汇总）',15000,async()=>{const main=await mainContract(code).catch(()=>null),ours=eastmoneyContract(contract);const list=[...new Set([ours,main].filter(Boolean))];if(!list.length)throw Error('缺少具体合约');return {main,positions:(await Promise.all(list.map(c=>memberPositions(c).catch(()=>null)))).filter(Boolean)}}),
  task('IMA机构研报索引',35000,()=>searchImaResearch({product:name,date:today})),
  task('官方与权威信源',30000,()=>collectOfficial({code,name,aliases,sector,exchange},{now:now.getTime()}))
 ]);
 const get=label=>results.find(r=>r.label===label);
 const items=[],providers=[],missing=[];
 const add=entry=>{items.push({id:'E'+(items.length+1),...entry});};
 const provider=(label,count,extra={})=>{const r=get(label);providers.push({name:label,status:r.error?'unavailable':count?'ok':'empty',count,reason:r.error||extra.reason||null,...extra});if(r.error)missing.push(`${label}：${r.error}`);else if(!count)missing.push(`${label}：近期无相关结果`)};

 const news=[];const seen=new Set();
 for(const item of get('东方财富资讯').value||[])news.push({...item,platform:'东方财富资讯'});
 for(const label of ['财联社','金十数据'])for(const item of get(label).value?.items||[])news.push({title:item.title,text:item.text,published:item.published?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date(item.published)):'',source:label,url:item.url,fullText:!!item.fullText,platform:label});
 news.sort((a,b)=>String(b.published).localeCompare(String(a.published)));
 for(const item of news){const key=String(item.title).replace(/\s/g,'').slice(0,24);if(seen.has(key))continue;seen.add(key);if(items.filter(i=>i.type==='news').length>=18)break;add({type:'news',title:item.title,source:item.source||item.platform,platform:item.platform,published:item.published,url:item.url,fullText:!!item.fullText,text:String(item.text||'').slice(0,item.fullText?1500:300)})}
 provider('东方财富资讯',(get('东方财富资讯').value||[]).length,{coverage:'近10天东方财富资讯搜索，按相关度取前14条，前8条读取正文'});
 const cls=get('财联社'),jin=get('金十数据');
 providers.push({name:'财联社',status:cls.error?'unavailable':cls.value.provider.status,count:cls.value?.items?.length||0,reason:cls.error||cls.value?.provider.reason||null,coverage:'12个公开栏目最近资讯，按品种名称匹配'});
 providers.push({name:'金十数据',status:jin.error?'unavailable':jin.value.provider.status,count:jin.value?.items?.length||0,reason:jin.error||jin.value?.provider.reason||null,coverage:'官方MCP快讯与资讯，按品种关键词检索'});

 const official=get('官方与权威信源');
 for(const item of official.value?.items||[])add({type:item.tier==='A'?'policy':'news',title:item.title,source:item.source,platform:'官方与权威信源',published:item.published,url:item.url,fullText:!!item.fullText,text:String(item.summary||'').slice(0,item.fullText?1200:400),...(item.matched?{}:{note:'未直接提及该品种，作宏观或板块背景'})});
 const failed=(official.value?.providers||[]).filter(p=>p.status==='unavailable');
 providers.push({name:'官方与权威信源',status:official.error?'unavailable':(official.value?.items||[]).length?'ok':'empty',count:(official.value?.items||[]).length,reason:official.error||(failed.length?`${failed.length}个来源未取得：${failed.map(p=>p.name).join('、')}`:null),coverage:'借鉴AIHOT期货雷达的信源：统计局、发改委、人民银行、农业农村部、上期所公告、美联储、BEA、欧洲央行、白宫、EIA、USDA、NOAA及CNBC、MarketWatch、BBC、OilPrice、FXStreet'});
 if(official.error)missing.push(`官方与权威信源：${official.error}`);else if(failed.length)missing.push(`官方信源未取得：${failed.map(p=>`${p.name}（${p.reason}）`).join('；')}`);
 const receipts=get('交易所仓单（东方财富汇总）').value||[];
 if(receipts.length)add({type:'warehouse',title:`${name}交易所仓单（最近${receipts.length}个交易日）`,source:'东方财富数据中心（交易所仓单日报汇总）',published:receipts[0].date,url:'https://data.eastmoney.com/ifdata/xhgp.html',series:receipts,text:`最新${receipts[0].date}仓单${receipts[0].receipts}，较上一交易日${receipts[0].change}；单位按交易所原口径（张或吨）。仓单只代表可交割注册量，不等于社会库存。`});
 provider('交易所仓单（东方财富汇总）',receipts.length);

 const held=get('前20席位持仓（东方财富汇总）').value||{positions:[]};
 const sign=n=>Number.isFinite(n)?(n>=0?'+':'')+n:'未知';
 for(const positions of held.positions)add({type:'positions',title:`${positions.contract}前20席位持仓（${positions.date}）`,source:'东方财富数据中心（交易所会员成交持仓排名）',published:positions.date,url:'https://data.eastmoney.com/futures/sh/data.html',data:positions,text:`结算价${positions.settle}；前20多头${positions.top20Long}（${sign(positions.top20LongChange)}），前20空头${positions.top20Short}（${sign(positions.top20ShortChange)}），净多${positions.top20Net}（${sign(positions.top20NetChange)}）。席位榜不是全市场资金流向。`});
 provider('前20席位持仓（东方财富汇总）',held.positions.length);

 const warnings=[];
 const ours=eastmoneyContract(contract),priced=held.positions.find(p=>p.contract===ours);
 if(held.main&&ours&&held.main!==ours)warnings.push(`小木标注的具体主力为${contract}，东方财富主力标记为${held.main}，需人工核对研究与交易对应哪个合约。`);
 if(!ours)warnings.push('小木当前没有该品种的具体主力映射，只能用主力连续代理。');
 if(priceBasis==='主力连续代理'&&priced&&Number.isFinite(priced.settle)&&Number.isFinite(price)&&Math.abs(priced.settle/price-1)>0.03)warnings.push(`${priced.contract}结算价${priced.settle}与主力连续收盘${price}相差超过3%，主力连续价格可能来自其他月份合约。`);

 const ima=get('IMA机构研报索引');
 const reports=(ima.value?.items||[]).filter(r=>r.reportDate&&(Date.parse(today)-Date.parse(r.reportDate))<=21*86400000).slice(0,6);
 for(const r of reports)add({type:'report',title:r.title,source:'IMA「期货投研」研报索引',published:r.reportDate,url:null,fullText:false,text:r.excerpt||'仅标题，未读取正文'});
 providers.push({name:'IMA机构研报索引',status:ima.error?'unavailable':reports.length?'ok':'empty',count:reports.length,reason:ima.error||null,coverage:'近21天研报标题与摘要，仅作机构观点线索'});
 if(!reports.length)missing.push(ima.error?`IMA机构研报：${ima.error}`:'IMA机构研报：近21天无该品种研报');
 return {status:items.length?'ok':'unavailable',fetchedAt,date:today,items,providers,warnings,missing,scope:'东方财富资讯/财联社/金十的近10天品种资讯，统计局、发改委、央行、农业农村部、交易所、美联储、EIA、USDA等官方信源近14天公告，东方财富汇总的交易所仓单与前20席位，IMA研报标题；非全网穷尽，未取得的来源列为缺口'};
}
