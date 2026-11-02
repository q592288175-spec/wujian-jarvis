// 官方与权威信源直连（2026-10-11 借鉴 AIHOT 期货雷达的信源清单与抓取方法，小木独立运行，不依赖 Mac）。
// 列表页取“链接+日期”，RSS 取条目；按品种名、别名、英文关键词和板块筛选；国内官方条目再读详情页的相关段落。
// 每个来源单独限时、单独失败，失败列为缺口，不补造。
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// scope：macro 全品种宏观；exchange 交易所；agri 农产品；energy 能源化工；weather 天气；markets 综合财经
export const OFFICIAL_SOURCES=[
 {name:'国家统计局数据发布',kind:'list',url:'https://www.stats.gov.cn/sj/zxfb/',allow:['https://www.stats.gov.cn/sj/zxfb/'],tier:'A',scope:'macro',lang:'zh',detail:true},
 {name:'国家发展改革委新闻发布',kind:'list',url:'https://www.ndrc.gov.cn/xwdt/xwfb/',allow:['https://www.ndrc.gov.cn/xwdt/xwfb/'],tier:'A',scope:'macro',lang:'zh',detail:true},
 {name:'中国人民银行公开信息',kind:'list',url:'https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html',allow:['https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/20'],tier:'A',scope:'macro',lang:'zh',detail:true},
 {name:'农业农村部动态',kind:'list',url:'https://www.moa.gov.cn/xw/zwdt/',allow:['https://www.moa.gov.cn/xw/zwdt/'],tier:'A',scope:'agri',lang:'zh',detail:true},
 {name:'上海期货交易所公告通知',kind:'list',url:'https://www.shfe.com.cn/publicnotice/notice/',allow:['https://www.shfe.com.cn/publicnotice/notice/2'],tier:'A',scope:'exchange',exchanges:['SHFE','INE'],lang:'zh',detail:false},
 {name:'美联储全部新闻稿',kind:'rss',url:'https://www.federalreserve.gov/feeds/press_all.xml',tier:'A',scope:'macro',lang:'en'},
 {name:'美国经济分析局数据发布',kind:'rss',url:'https://apps.bea.gov/rss/rss.xml',tier:'A',scope:'macro',lang:'en'},
 {name:'欧洲央行新闻稿',kind:'rss',url:'https://www.ecb.europa.eu/rss/press.html',tier:'A',scope:'macro',lang:'en'},
 {name:'白宫新闻',kind:'rss',url:'https://www.whitehouse.gov/news/feed/',tier:'A',scope:'macro',lang:'en'},
 {name:'美国能源信息署新闻稿',kind:'rss',url:'https://www.eia.gov/rss/press_rss.xml',tier:'A',scope:'energy',lang:'en'},
 {name:'美国能源信息署能源资讯',kind:'rss',url:'https://www.eia.gov/rss/todayinenergy.xml',tier:'A',scope:'energy',lang:'en'},
 {name:'USDA NASS 新闻',kind:'rss',url:'https://www.nass.usda.gov/rss/news.xml',tier:'A',scope:'agri',lang:'en'},
 {name:'USDA NASS 报告发布',kind:'rss',url:'https://www.nass.usda.gov/rss/reports.xml',tier:'A',scope:'agri',lang:'en'},
 {name:'美国国家海洋和大气管理局',kind:'rss',url:'https://www.noaa.gov/news/rss.xml',tier:'A',scope:'weather',lang:'en'},
 {name:'CNBC 能源',kind:'rss',url:'https://www.cnbc.com/id/19836768/device/rss/rss.html',tier:'B',scope:'energy',lang:'en'},
 {name:'CNBC 经济',kind:'rss',url:'https://www.cnbc.com/id/20910258/device/rss/rss.html',tier:'B',scope:'markets',lang:'en'},
 {name:'MarketWatch 要闻',kind:'rss',url:'https://feeds.content.dowjones.io/public/rss/mw_topstories',tier:'B',scope:'markets',lang:'en'},
 {name:'BBC 财经',kind:'rss',url:'https://feeds.bbci.co.uk/news/business/rss.xml',tier:'B',scope:'markets',lang:'en'},
 {name:'OilPrice 能源新闻',kind:'rss',url:'https://oilprice.com/rss/main',tier:'C',scope:'energy',lang:'en'},
 {name:'FXStreet 外汇与宏观',kind:'rss',url:'https://www.fxstreet.com/rss/news',tier:'C',scope:'markets',lang:'en'}
];

// 板块 → 需要看的信源范围（品种框架里的 sector）
const SECTOR_SCOPES={有色:['markets'],贵金属:['markets'],黑色:['markets'],新能源:['markets'],能源:['energy','markets'],化工:['energy'],橡胶:['markets','weather'],林纸:['markets'],油脂油料:['agri','weather'],谷物:['agri','weather'],软商品:['agri','weather'],果品:['agri','weather'],养殖:['agri'],航运:['energy','markets'],'金融（独立）':['markets']};
// 英文信源按关键词筛选；未列出的品种只用板块通用词
const EN_TERMS={CU:['copper'],BC:['copper'],AL:['aluminum','aluminium'],AO:['alumina'],ZN:['zinc'],PB:['lead'],NI:['nickel'],SN:['tin'],SS:['stainless'],AU:['gold'],AG:['silver'],PT:['platinum'],PD:['palladium'],SI:['silicon'],PS:['polysilicon','solar'],LC:['lithium'],RB:['steel','rebar'],HC:['steel'],I:['iron ore'],JM:['coking coal','coal'],J:['coke','coal'],ZC:['thermal coal','coal'],SC:['crude','oil','brent','wti','opec','hormuz'],FU:['fuel oil','bunker','crude'],LU:['fuel oil','bunker','crude'],BU:['asphalt','bitumen','crude'],PG:['propane','lpg'],EC:['container','shipping','freight','red sea','suez'],TA:['paraxylene','polyester','crude'],PX:['paraxylene','crude'],EG:['ethylene glycol','crude'],MA:['methanol'],L:['polyethylene','ethylene'],PP:['polypropylene','propylene'],V:['pvc'],EB:['styrene'],BZ:['benzene'],RU:['rubber'],NR:['rubber'],BR:['butadiene','rubber'],SP:['pulp'],A:['soybean'],B:['soybean'],M:['soybean','soymeal'],Y:['soybean','soyoil'],P:['palm oil'],OI:['canola','rapeseed'],RM:['canola','rapeseed'],C:['corn'],CS:['corn'],WH:['wheat'],PM:['wheat'],SR:['sugar'],CF:['cotton'],CY:['cotton'],LH:['hog','pork'],JD:['egg'],IF:['china','stocks'],IH:['china','stocks'],IC:['china','stocks'],IM:['china','stocks'],T:['treasury','yield'],TF:['treasury','yield'],TS:['treasury','yield'],TL:['treasury','yield']};
// 国家统计局“流通领域重要生产资料市场价格”表中的产品名
const NBS_NAMES={CU:['电解铜'],BC:['电解铜'],AL:['铝锭'],PB:['铅锭'],ZN:['锌锭'],RB:['螺纹钢'],HC:['热轧普通板卷'],WR:['线材'],SH:['烧碱'],MA:['甲醇'],BZ:['纯苯'],L:['聚乙烯'],PP:['聚丙烯'],BR:['顺丁胶'],PG:['液化石油气'],SC:['汽油','柴油'],FU:['柴油'],JM:['焦煤'],J:['焦炭'],ZC:['山西优混'],FG:['浮法平板玻璃'],PS:['多晶硅'],RR:['稻米'],WH:['小麦'],PM:['小麦'],C:['玉米'],CS:['玉米'],CF:['棉花'],LH:['生猪'],A:['大豆'],M:['豆粕'],PK:['花生'],SR:['白糖'],UR:['尿素'],RU:['天然橡胶'],NR:['天然橡胶'],SP:['纸浆']};

const cache=new Map();
const decode=s=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');
// 先拆 CDATA 再去标签；RSS 摘要里常是转义过的 HTML，解码后再去一次标签
const plain=s=>strip(decode(decode(strip(String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1'))))).replace(/\s+/g,' ').trim();
const allowedHost=url=>{try{const host=new URL(url).hostname;return OFFICIAL_SOURCES.some(s=>new URL(s.url).hostname===host)}catch{return false}};
async function fetchText(url,{timeout=12000,limit=2_000_000}={}){
 if(!allowedHost(url))throw Error('不在官方信源白名单');
 const response=await fetch(url,{headers:{'User-Agent':UA,Accept:'text/html,application/xml,application/rss+xml,*/*'},redirect:'follow',signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 if(!allowedHost(response.url))throw Error('跳转到白名单以外的网站');
 const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>limit)throw Error('页面超过读取上限');
 return buffer.toString('utf8');
}
const dateFrom=text=>{const m=String(text||'').match(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/)||String(text||'').match(/[t/](20\d{2})(\d{2})(\d{2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:null};

// 列表页：取白名单前缀下的链接，标题优先用 title 属性；日期优先取链接里的 t20261009 / 2026092118...，其次取链接后紧邻的日期文本。
export function parseList(html,base,allow){
 const found=new Map();
 for(const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const href=m[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];if(!href||href.startsWith('javascript'))continue;
  let url;try{url=new URL(decode(href),base).href}catch{continue}
  if(!allow.some(prefix=>url.startsWith(prefix))||url===base)continue;
  const title=plain(m[1].match(/title\s*=\s*["']([^"']+)["']/i)?.[1]||m[2]).replace(/\.{3}$|…$/,'');if(title.length<6)continue;
  const after=html.slice(m.index+m[0].length,m.index+m[0].length+400);
  const date=dateFrom(url.match(/\/t(20\d{6})_/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'))||dateFrom(url.match(/\/(20\d{6})\d{6,}/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'))||dateFrom(plain(after).slice(0,40));
  const old=found.get(url);if(!old||title.length>old.title.length)found.set(url,{title,url,published:date});
 }
 return [...found.values()];
}
export function parseRss(xml){
 const blocks=[...xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)].map(m=>m[0]);
 const tag=(block,name)=>block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`,'i'))?.[1]||'';
 return blocks.map(block=>{const link=plain(tag(block,'link'))||block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]||'';const raw=plain(tag(block,'pubDate')||tag(block,'published')||tag(block,'updated')||tag(block,'dc:date'));const time=Date.parse(raw);return{title:plain(tag(block,'title')),url:decode(link).trim(),published:Number.isFinite(time)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short'}).format(new Date(time)):dateFrom(raw),summary:plain(tag(block,'description')||tag(block,'summary')||tag(block,'content')).slice(0,400)}}).filter(item=>item.title&&item.url);
}
async function readSourceList(source){
 const hit=cache.get(source.url);if(hit&&Date.now()-hit.at<15*60000)return hit.items;
 const text=await fetchText(source.url);
 const items=source.kind==='rss'?parseRss(text):parseList(text,source.url,source.allow);
 cache.set(source.url,{at:Date.now(),items});return items;
}
// 统计局旬度价格表：只取该品种所在行
export function nbsPriceRows(html,names){
 const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1]).replace(/\s/g,'')));
 return [...new Set(rows.filter(cells=>cells.length>=5&&names.some(name=>cells[0].startsWith(name))).map(cells=>`${cells[0]}：${cells[2]}元/${cells[1]}，比上期${cells[3]}元（${cells[4]}%）`))];
}
async function detailText(url,terms){
 const html=await fetchText(url,{timeout:10000});
 const paragraphs=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>plain(m[1])).filter(p=>p.length>8);
 const picked=paragraphs.filter(p=>terms.some(t=>p.includes(t)));
 return {html,text:(picked.length?picked:paragraphs.slice(0,3)).join('\n').slice(0,1200)};
}

const within=(published,days,now)=>{if(!published)return false;const time=Date.parse(String(published).slice(0,10)+'T00:00:00+08:00');return Number.isFinite(time)&&now-time<=days*86400000&&time-now<=86400000};
const GENERAL_NOTICE=/保证金|涨跌停|限额|风险控制|节假日|休市|交割|手续费/;
// 宏观背景只留与价格、政策、经济数据相关的条目，去掉会见、节日致辞之类
const BACKGROUND_ZH=/价格|物价|利率|降准|降息|货币|财政|关税|进出口|外贸|采购经理|PMI|CPI|PPI|国民经济|工业|消费|投资|供需|储备|调控|保供|稳价|经济形势|金融市场|运行情况|意见|方案|通知/;
const BACKGROUND_EN=/rate|inflation|price|cpi|pce|gdp|tariff|trade|econom|monetary|fomc|employment|jobs|outlook|supply|demand|inventor|production|output|crop|harvest|drought|hurricane|el ni|la ni/i;
const NOISE=/会见|会谈|党组|学习贯彻|丰收节|Day$|Message on|Proclamation|Nominat|Interview/i;
const usefulBackground=(item,lang)=>!NOISE.test(item.title)&&(lang==='zh'?BACKGROUND_ZH:BACKGROUND_EN).test(item.title+' '+(item.summary||''));
export async function collectOfficial({code,name,aliases='',sector,exchange},{now=Date.now(),days=14}={}){
 const terms=[name,...String(aliases).split(/[,，;；]/)].map(s=>s.trim()).filter(t=>t.length>1&&!/^[A-Z0-9]+$/.test(t));
 const en=EN_TERMS[code]?new RegExp(`\\b(?:${EN_TERMS[code].map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})\\b`,'i'):null,scopes=new Set(['macro',...(SECTOR_SCOPES[sector]||['markets'])]);
 const sources=OFFICIAL_SOURCES.filter(s=>s.scope==='exchange'?s.exchanges.includes(exchange):scopes.has(s.scope));
 const lists=await Promise.all(sources.map(source=>readSourceList(source).then(items=>({source,items}),error=>({source,error:error.message}))));
 const picked=[],providers=[];
 for(const {source,items,error} of lists){
  if(error){providers.push({name:source.name,status:'unavailable',count:0,reason:error});continue}
  const recent=items.filter(item=>within(item.published,days,now));
  const matches=recent.filter(item=>{const text=item.title+' '+(item.summary||'');return source.lang==='zh'?terms.some(t=>text.includes(t)):!!en&&en.test(text)});
  // 宏观与板块官方源即使没提到品种，也保留最新1—2条作为政策背景；交易所只保留品种相关和通用风控通知
  const background=source.scope==='exchange'?recent.filter(item=>GENERAL_NOTICE.test(item.title)&&!matches.includes(item)).slice(0,2):source.tier==='A'&&!matches.length?recent.filter(item=>usefulBackground(item,source.lang)).slice(0,source.scope==='macro'?2:1):[];
  const chosen=[...matches.slice(0,4),...background].map(item=>({...item,source:source.name,tier:source.tier,scope:source.scope,lang:source.lang,matched:matches.includes(item),detail:source.detail}));
  picked.push(...chosen);providers.push({name:source.name,status:recent.length?'ok':'empty',count:chosen.length});
 }
 // 国内官方详情：先读统计局最新旬度价格表，再读标题命中品种的官方文章
 const nbsNames=NBS_NAMES[code]||[];
 const nbs=picked.find(item=>item.source==='国家统计局数据发布'&&/流通领域重要生产资料市场价格/.test(item.title));
 const priceReport=nbs||(nbsNames.length?(lists.find(l=>l.source.name==='国家统计局数据发布')?.items||[]).find(item=>/流通领域重要生产资料市场价格/.test(item.title)):null);
 if(priceReport&&nbsNames.length){try{const {html}=await detailText(priceReport.url,terms);const rows=nbsPriceRows(html,nbsNames);if(rows.length){const entry=picked.find(item=>item.url===priceReport.url)||{...priceReport,source:'国家统计局数据发布',tier:'A',scope:'macro',lang:'zh'};entry.matched=true;entry.summary=`${priceReport.title}：${rows.join('；')}`;entry.fullText=true;if(!picked.includes(entry))picked.unshift(entry)}}catch{}}
 await Promise.all(picked.filter(item=>item.detail&&item.lang==='zh'&&!item.fullText&&item.matched).slice(0,4).map(async item=>{try{const {text}=await detailText(item.url,terms);if(text){item.summary=text;item.fullText=true}}catch{}}));
 const order={A:0,B:1,C:2};
 const items=picked.sort((a,b)=>Number(b.matched)-Number(a.matched)||order[a.tier]-order[b.tier]||String(b.published).localeCompare(String(a.published))).slice(0,16);
 return {items,providers};
}
