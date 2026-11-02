import {parse} from 'parse5';
import {request} from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {allowedNewsSource} from './research-sources.mjs';

export function publicAddress(address){
 if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127)}
 // Explicitly reject mapped/private/link-local addresses; prefer public IPv4 when available.
 return isIP(address)===6&&!/^(::|fc|fd|fe[89ab]|ff)/i.test(address);
}
export function parseDocument(html){
 const root=parse(html),lines=[],meta={};let title='';
 const attr=(node,key)=>node.attrs?.find(a=>a.name===key)?.value;
 function text(node){return node.nodeName==='#text'?node.value:(node.childNodes||[]).filter(n=>!['script','style','nav','footer','header','noscript'].includes(n.nodeName)).map(n=>text(n)+(['p','div','br','li'].includes(n.nodeName)?'\n':'')).join(node.nodeName==='tr'?' | ':'')}
 function visit(node){
  if(['script','style','nav','footer','header','noscript'].includes(node.nodeName))return;
  if(node.nodeName==='meta'){const key=attr(node,'property')||attr(node,'name');if(key)meta[key]=attr(node,'content')}
  if(node.nodeName==='title')title=text(node).trim();
  if(['p','tr','h1','h2','h3','li'].includes(node.nodeName)){const value=text(node).replace(/\s+/g,' ').trim();if(value)lines.push(value);return}
  for(const child of node.childNodes||[])visit(child);
 }
 visit(root);
 const content=lines.join('\n')||text(root).replace(/\s+/g,' ').trim();
 return{title,text:content.slice(0,24000),published:meta['article:published_time']||meta['publishdate']||meta['pubdate']||null,truncated:content.length>24000};
}
async function download(url,signal){
 if(!allowedNewsSource(url)||new URL(url).protocol!=='https:')throw Error('来源不在可信 HTTPS 范围');
 const target=new URL(url),addresses=await lookup(target.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('来源解析到非公网地址');
 const address=addresses.find(a=>a.family===4)||addresses[0];
 return new Promise((resolvePromise,reject)=>{
  const req=request(target,{signal,lookup:(_host,options,cb)=>options?.all?cb(null,[address]):cb(null,address.address,address.family),headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html,application/pdf,text/plain'}},res=>{
   const chunks=[];let bytes=0;
   if(res.statusCode>=300&&res.statusCode<400){res.resume();resolvePromise({redirect:res.headers.location});return}
   if(res.statusCode!==200){res.resume();reject(Error(`来源返回 HTTP ${res.statusCode}`));return}
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){res.destroy(Error('原文超过读取上限'));return}chunks.push(chunk)});
   res.on('error',reject);res.on('end',()=>resolvePromise({body:Buffer.concat(chunks),type:String(res.headers['content-type']||'')}));
  });req.on('error',reject);req.end();
 });
}
async function pdfText(buffer,signal){
 return new Promise((resolvePromise,reject)=>{
  const python=resolve(process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');
  const child=spawn(python,[resolve('scripts/research-pdf.py')],{windowsHide:true,signal,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  const out=[];let length=0;
  child.stdout.on('data',b=>{length+=b.length;if(length>400000){child.kill();reject(Error('PDF 提取超过上限'))}else out.push(b)});
  child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',reject);
  child.on('close',code=>{if(code!==0){reject(Error('PDF 无法读取，可能需要授权或扫描件识别'));return}try{resolvePromise(JSON.parse(Buffer.concat(out).toString('utf8')))}catch{reject(Error('PDF 正文解析失败'))}});
  child.stdin.end(buffer);
 });
}
export async function readResearchDocument({url,signal}){
 const timeout=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let current=String(url).replace(/^http:/,'https:');
 for(let redirects=0;redirects<4;redirects++){
  const value=await download(current,combined);
  if(value.redirect){current=new URL(value.redirect,current).href.replace(/^http:/,'https:');continue}
  const hash=createHash('sha256').update(value.body).digest('hex');
  if(value.type.includes('pdf')||value.body.subarray(0,5).toString()==='%PDF-'){
   const doc=await pdfText(value.body,combined),text=doc.pages.map(p=>`第${p.page}页\n${p.text}`).join('\n');
   if(text.trim().length<60)throw Error('PDF 正文不足，未把扫描图片视为已读');
   return{url:current,text,pages:doc.pages.map(p=>p.page),pageCount:doc.pageCount,truncated:doc.truncated,contentHash:hash,format:'pdf',fetchedAt:new Date().toISOString()};
  }
  if(!/text\/html|text\/plain|xhtml/.test(value.type))throw Error('不支持的原文格式');
  const doc=parseDocument(value.body.toString('utf8'));
  if(doc.text.length<60)throw Error('正文过短或需要登录');
  return{...doc,url:current,contentHash:hash,format:'html',fetchedAt:new Date().toISOString()};
 }
 throw Error('原文跳转过多');
}
