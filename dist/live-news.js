import {contractName} from './contract-name.js';
const box=document.querySelector('#intelList'),note=box.nextElementSibling;
const refresh=document.createElement('button');refresh.textContent='刷新';refresh.className='more';refresh.setAttribute('aria-label','刷新官方公告');box.parentElement.querySelector('.panel-head').append(refresh);
let selected=null,related=false;
const toggle=document.createElement('button');toggle.className='more';toggle.textContent='全部公告';toggle.title='切换当前品种标题匹配，不代表正文影响判断';refresh.before(toggle);
function filterNews(){const name=selected?contractName(selected).replace(/\d+$/,'').replace(/^沪/,''):'';let count=0;for(const a of box.querySelectorAll('a')){a.hidden=related&&(!name||!a.textContent.includes(name));if(!a.hidden)count++}
 box.querySelector('.news-empty')?.remove();if(!count&&related){const p=document.createElement('p');p.className='news-empty';p.textContent='当前品种暂无标题匹配；不代表没有相关事件。可切回全部公告。';box.append(p)}}
toggle.onclick=()=>{related=!related;toggle.textContent=related?'当前品种':'全部公告';filterNews()};
document.addEventListener('jarvis:quote',e=>{selected=e.detail.quote;filterNews()});
async function update(){refresh.disabled=true;note.textContent='正在读取上期所官方公告…';try{const r=await fetch('/api/news');if(!r.ok)throw Error();const data=await r.json();box.replaceChildren();for(const item of data.items||[]){const a=document.createElement('a');a.className='intel-item';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';const time=document.createElement('small');time.textContent=item.date.slice(5);const title=document.createElement('span');title.textContent=item.title;a.append(time,title);box.append(a)}note.textContent=data.items?.length?(data.stale?'缓存过期 · ':'官方公告 · ')+new Date(data.fetchedAt).toLocaleTimeString('zh-CN')+' 抓取 · 标题索引':data.error||'无公告';}catch{note.textContent='官方公告加载失败，未用演示新闻补齐'}finally{refresh.disabled=false;filterNews()}}
refresh.onclick=update;update();
