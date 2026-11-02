import {parse} from 'parse5';
import {createHash,randomUUID} from 'node:crypto';

export const ANNOUNCEMENT_SOURCES=[
 {id:'SHFE',name:'上期所',url:'https://www.shfe.com.cn/publicnotice/notice/'},
 {id:'INE',name:'能源中心',url:'https://www.ine.com.cn/publicnotice/notice/'},
 {id:'DCE',name:'大商所',url:'https://www.dce.com.cn/dalianshangpin/yw/fw/jystz/ywtz/index.html'},
 {id:'CZCE',name:'郑商所',url:'https://www.czce.com.cn/cn/gyjys/jysdt/ggytz/H770301index_1.htm'},
 {id:'GFEX',name:'广期所',url:'https://www.gfex.com.cn/gfex/tzts/list.shtml'},
 {id:'CFFEX',name:'中金所',url:'https://www.cffex.com.cn/jystz/'}
];
const categories={margin:/保证金/,limit:/涨跌停|交易限额/,fee:/手续费|交割费/,delivery:/交割|最后交易日|合约到期/,session:/交易时间|交易安排|休市|夜盘|开市/};
const digest=text=>createHash('sha256').update(text).digest('hex');
const walk=(node,visit)=>{visit(node);for(const child of node.childNodes||[])walk(child,visit);};
const content=node=>node.nodeName==='#text'?node.value:['script','style','nav','header','footer'].includes(node.tagName)?'':(node.childNodes||[]).map(content).join(' ');
const clean=text=>text.replace(/\s+/g,' ').trim();
const articleUrl=(href,source)=>{try{const value=new URL(href,source.url);return value.protocol==='https:'&&!value.username&&!value.password&&!value.port&&value.hostname===new URL(source.url).hostname?value.href:null}catch{return null}};
export function parseAnnouncementIndex(html,source){
 const root=parse(html),items=new Map();
 walk(root,node=>{if(node.tagName!=='a')return;const attrs=Object.fromEntries((node.attrs||[]).map(item=>[item.name,item.value]));const url=articleUrl(attrs.href,source),title=clean(attrs.title||content(node));
  if(!url||!title||title.length<8||title.length>240||!/(通知|公告|交易安排)/.test(title)||url===source.url)return;
  const parent=node.parentNode?.parentNode,near=parent&&clean(content(parent));const around=near&&near.length<1600?near:clean(content(node.parentNode||node)),date=around.match(/20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}/)?.[0]?.replace(/[./年月]/g,'-');
  items.set(url,{url,title,published:date?date.split('-').map((part,index)=>index?part.padStart(2,'0'):part).join('-'):null});
 });return [...items.values()].slice(0,40);
}
export function parseAnnouncementBody(html){const root=parse(html);let body=null;walk(root,node=>{const attrs=Object.fromEntries((node.attrs||[]).map(item=>[item.name,item.value]));if(!body&&(/TRS_Editor|article-content|news-content|article_con|content-detail|detail-content|detail_content/i.test(attrs.class||'')||node.tagName==='article'))body=node});return body?clean(content(body)).slice(0,60000):'';}
export function announcementCategories(text){return Object.entries(categories).filter(([,pattern])=>pattern.test(text)).map(([key])=>key);}
export async function fetchAnnouncement(url,source,fetchImpl=fetch){
 let current=url;
 for(let attempt=0;attempt<4;attempt++){
  if(!articleUrl(current,source))throw Error('公告来源不在官方域名内');
  const response=await fetchImpl(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Xiaomu-Monitor/1.0'}});
  if(response.status>=300&&response.status<400){current=new URL(response.headers.get('location'),current).href;continue;}
  if(!response.ok)throw Error('官方来源返回 HTTP '+response.status);
  const type=response.headers.get('content-type')||'';
  if(!/html|text|json/i.test(type))return {text:'',fullText:false,url:current};
  const reader=response.body.getReader();let count=0,chunks=[];
  try{for(;;){const part=await reader.read();if(part.done)break;count+=part.value.length;if(count>3*1024*1024)throw Error('公告正文超过读取限制');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{});}
  const buffer=Buffer.concat(chunks);let encoding=/charset=([^;\s]+)/i.exec(type)?.[1]||'utf-8';
  if(encoding==='utf-8'&&/charset\s*=\s*["']?gb/i.test(buffer.subarray(0,4000).toString()))encoding='gb18030';
  return {text:new TextDecoder(encoding).decode(buffer),fullText:true,url:current};
 }throw Error('官方来源重定向次数过多');
}
export class AnnouncementWatcher{
 constructor({store,onEvent=()=>{},fetchImpl=fetch,now=Date.now}){Object.assign(this,{store,onEvent,fetchImpl,now});this.busy=false;this.coverage=store.meta('announcementCoverage',[]);}
 async poll(){
  if(this.busy)return this.coverage;this.busy=true;
  try{
   const rules=this.store.rules().filter(rule=>rule.status==='active'&&rule.kind==='announcement');
   const statuses=[];
   for(const source of ANNOUNCEMENT_SOURCES){
    try{
     const index=await fetchAnnouncement(source.url,source,this.fetchImpl),items=parseAnnouncementIndex(index.text,source);
     if(!items.length)throw Error('列表结构未识别，未取得公告');
     const first=!this.store.meta('announcementBaseline:'+source.id,false);let read=0,failures=0;
     const known=this.store.meta('announcementIndex:'+source.id,{});
     for(const item of items.filter(article=>announcementCategories(article.title).length)){
      const old=this.store.announcement(source.id,item.url);
      let fullText=false,text='',attachmentsUnread=false;
      try{const body=await fetchAnnouncement(item.url,source,this.fetchImpl);text=body.fullText?parseAnnouncementBody(body.text):'';fullText=!!text;const doc=parse(body.text);walk(doc,node=>{if(node.tagName==='a'&&(node.attrs||[]).some(attr=>attr.name==='href'&&/\.(pdf|docx?|xlsx?)(?:[?#]|$)/i.test(attr.value)))attachmentsUnread=true;});if(fullText)read++;if(!fullText||attachmentsUnread)failures++;}catch{failures++;}
      const article={...item,source:source.id,sourceName:source.name,text,fullText,attachmentsUnread,discoveredAt:old?.payload.discoveredAt||new Date(this.now()).toISOString(),hash:digest(item.title+'\n'+text)};
      if(old?.payload.fullText&&!fullText)continue;
      this.store.saveAnnouncement(source.id,article);
      if(first||old?.hash===article.hash||known[item.url]&&!old||old&&!old.payload.fullText&&old.payload.title===item.title)continue;
      const cats=announcementCategories(item.title+' '+text);
      for(const rule of rules){
       if(rule.expiresAt&&Date.parse(rule.expiresAt)<=this.now()){this.store.setStatus(rule.id,'expired');continue;}
       const matching=rule.members.filter(member=>member.exchange===source.id&&(member.announcementNames||[member.name.replace(/^沪/,'')]).some(name=>(text+item.title).includes(name.replace(/\d+$/,''))));
       const exchangeWide=/各品种|所有品种|全部品种|交易安排|休市|夜盘/.test(item.title+' '+text);
       const members=matching.length?matching:exchangeWide?rule.members.filter(member=>member.exchange===source.id):[];
       if(!members.length||!cats.some(category=>rule.categories.includes(category)))continue;
       const event={id:randomUUID(),ruleId:rule.id,ruleVersion:rule.version,kind:'announcement',symbol:members.map(member=>member.symbol).join('、'),name:members.map(member=>member.name).join('、'),condition:'关注品种交易所公告',label:old?'官方公告内容更新':'新官方公告',source:source.name,triggeredAt:new Date(this.now()).toISOString(),channels:rule.channels,evidence:{...article,categories:cats,notice:fullText&&!attachmentsUnread?'已读取官方正文，请按原公告核对生效时间':'仅公告线索，正文或附件未完整取得，不生成调整结论'}};
       if(this.store.recordEvent(event,{uniqueKey:rule.id+':'+rule.version+':'+item.url+':'+article.hash}))this.onEvent(event);
      }
     }
     for(const item of items)known[item.url]=true;
     this.store.setMeta('announcementIndex:'+source.id,known);
     this.store.setMeta('announcementBaseline:'+source.id,true);const successAt=new Date(this.now()).toISOString();this.store.setMeta('announcementSuccess:'+source.id,successAt);statuses.push({source:source.id,name:source.name,status:failures?'partial':'ok',count:items.length,fullText:read,failedDetails:failures,checkedAt:successAt,lastSuccessAt:successAt,url:source.url});
    }catch(error){statuses.push({source:source.id,name:source.name,status:'unavailable',message:'官方公告未取得，保留历史记录',reason:String(error.message).slice(0,180),lastSuccessAt:this.store.meta('announcementSuccess:'+source.id,null),checkedAt:new Date(this.now()).toISOString(),url:source.url});}
   }
   this.coverage=statuses;this.store.setMeta('announcementCoverage',statuses);return statuses;
  }finally{this.busy=false;}
 }
}
