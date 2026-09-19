import {marked} from '../vendor/markdown/marked.js';
import DOMPurify from '../vendor/markdown/purify.js';
// Model and report content is untrusted; raw HTML is never mounted unsanitized.
export function renderMarkdown(target,text){
 target.classList.add('markdown-body');
 target.innerHTML=DOMPurify.sanitize(marked.parse(String(text??''),{gfm:true,breaks:true}),{
  ALLOWED_TAGS:['p','br','strong','em','del','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','a'],
  ALLOWED_ATTR:['href','title','start','align'],ALLOW_DATA_ATTR:false
 });
 for(const a of target.querySelectorAll('a')){
  const href=a.getAttribute('href')||'';
  if(!/^https?:\/\//i.test(href)){a.removeAttribute('href');continue}
  a.target='_blank';a.rel='noopener noreferrer';
 }
 return target;
}
