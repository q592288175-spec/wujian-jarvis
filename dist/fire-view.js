// Keep the scan shell and its asynchronous comparison cards mounted between filters.
function patch(parent,fresh){
 const old=[...parent.childNodes],next=[...fresh.childNodes];
 for(let i=0;i<Math.max(old.length,next.length);i++){
  const a=old[i],b=next[i];
  if(!b){a?.remove();continue}
  if(!a){parent.append(b.cloneNode(true));continue}
  if(a.nodeType!==b.nodeType||a.nodeName!==b.nodeName){a.replaceWith(b.cloneNode(true));continue}
  if(a.nodeType===3){if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;continue}
  if(a.nodeType!==1)continue;
  if(a.id==='strengthSummary'&&b.id===a.id)continue;
  for(const attr of [...a.attributes])if(!b.hasAttribute(attr.name)&&!(a.tagName==='DETAILS'&&attr.name==='open'))a.removeAttribute(attr.name);
  for(const attr of [...b.attributes])if(a.getAttribute(attr.name)!==attr.value)a.setAttribute(attr.name,attr.value);
  patch(a,b);
 }
}
export function updateFireView(root,html){
 const template=root.ownerDocument.createElement('template');template.innerHTML=html;
 const current=root.querySelector('#fireScanPanel'),next=template.content.querySelector('#fireScanPanel');
 if(!current||!next){root.replaceChildren(template.content);return}
 const view=root.ownerDocument.defaultView,anchor=current.querySelector('.fire-modebar'),before=anchor?.getBoundingClientRect();
 patch(current,next);
 // Progress controls can change height after patching; restore after all bindings finish.
 return()=>{if(before&&anchor.isConnected&&before.top>=0&&before.bottom<=view.innerHeight){const delta=anchor.getBoundingClientRect().top-before.top;if(Math.abs(delta)>0.5)view.scrollBy({top:delta,behavior:'instant'})}};
}
