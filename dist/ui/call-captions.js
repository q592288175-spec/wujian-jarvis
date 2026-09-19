import {renderMarkdown} from './markdown.js';
/** In-memory transcript for this page. Never uploads clipboard or stores audio. */
export class CallCaptions {
 constructor(panel,{copy=text=>navigator.clipboard.writeText(text)}={}){
  this.copy=copy;this.entries=[];
  this.root=document.createElement('section');this.root.className='call-captions';this.root.setAttribute('aria-label','通话字幕');
  this.root.innerHTML='<header class="caption-head"><div><b>对话字幕</b><small>识别中的文字会修正 · 小木显示回复全文</small></div><button type="button" class="copy-captions">复制全部</button></header><div class="caption-log" role="log" aria-live="polite" aria-relevant="additions"><p class="caption-empty">开始说话后，对话会显示在这里。</p></div><div class="caption-draft" aria-live="off" hidden></div><p class="caption-feedback" role="status"></p>';
  panel.append(this.root);this.log=this.root.querySelector('.caption-log');this.draft=this.root.querySelector('.caption-draft');this.feedback=this.root.querySelector('.caption-feedback');
  this.root.querySelector('.copy-captions').onclick=()=>this.copyAll();
 }
 partial(text){this.draft.textContent=text?'你 · 识别中：'+text:'';this.draft.hidden=!text;}
 add(role,text){
  if(!String(text||'').trim())return;
  if(role==='user')this.partial('');
  const selection=window.getSelection?.();const selected=selection&&!selection.isCollapsed&&this.root.contains(selection.anchorNode);
  const follow=this.log.scrollHeight-this.log.scrollTop-this.log.clientHeight<70&&!selected;
  this.log.querySelector('.caption-empty')?.remove();
  const row=document.createElement('article');row.className='caption-row '+role;
  const head=document.createElement('div');head.className='caption-row-head';
  const label=document.createElement('b');label.textContent=role==='user'?'你':'小木';
  const time=document.createElement('time');time.dateTime=new Date().toISOString();time.textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false});
  const button=document.createElement('button');button.type='button';button.textContent='复制';button.setAttribute('aria-label','复制'+label.textContent+'的这条字幕');head.append(label,time,button);
  const body=document.createElement('div');body.className='caption-text';if(role==='user')body.textContent=text;else renderMarkdown(body,text);
  const entry={role,text,time:time.textContent,body};this.entries.push(entry);button.onclick=()=>this.copyText(this.plain(entry));row.append(head,body);this.log.append(row);if(follow)this.log.scrollTop=this.log.scrollHeight;
 }
 plain(entry){return entry.body.innerText||entry.body.textContent||entry.text;}
 async copyText(text){try{await this.copy(text);this.feedback.textContent='已复制'}catch{this.feedback.textContent='无法自动复制，请选中字幕后按 ⌘C / Ctrl+C'} }
 copyAll(){if(!this.entries.length){this.feedback.textContent='还没有已确认的对话';return}return this.copyText(this.entries.map(e=>`[${e.time}] ${e.role==='user'?'你':'小木'}\n${this.plain(e)}`).join('\n\n'));}
}
