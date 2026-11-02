const frame=document.querySelector('#workbenchPreview');
const buttons=[...document.querySelectorAll('[data-appearance]')];
const previewTheme=document.body.dataset.previewTheme||'wood';
const previewCss=document.body.dataset.previewCss||'/fire-preview-theme.css';
let appearance=previewTheme, observer;

function applyAppearance(){
  const doc=frame.contentDocument, sheet=doc?.querySelector('#firePreviewTheme');
  if(!sheet)return;
  const isFire=Boolean(doc.querySelector('#mainNav [data-view="fire"].active'));
  sheet.disabled=appearance!==previewTheme||!isFire;
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===appearance)));
}

// The preview changes presentation only. Original renderers, handlers and data stay in the frame.
function attachPreview(){
  observer?.disconnect();
  const doc=frame.contentDocument;
  if(!doc?.head||doc.querySelector('#firePreviewTheme'))return;
  const sheet=doc.createElement('link');
  sheet.id='firePreviewTheme';sheet.rel='stylesheet';sheet.href=previewCss;
  sheet.onload=()=>{applyAppearance();document.querySelector('#previewLoading').hidden=true};
  sheet.onerror=()=>{document.querySelector('#previewLoading').textContent='样稿样式读取失败，请刷新重试'};
  doc.head.append(sheet);
  observer=new MutationObserver(applyAppearance);
  const nav=doc.querySelector('#mainNav');
  if(nav)observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  applyAppearance();
}

buttons.forEach(button=>button.addEventListener('click',()=>{appearance=button.dataset.appearance;applyAppearance()}));
frame.addEventListener('load',attachPreview);
if(frame.contentDocument?.readyState==='complete')attachPreview();
