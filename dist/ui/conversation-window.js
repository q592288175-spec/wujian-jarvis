export function bindConversationWindow({panel,minimize,maximize,close,onMinimize,onClose}){
 const toggle=()=>{
  const expanded=panel.classList.toggle('conversation-expanded');
  maximize.title=expanded?'还原窗口':'放大窗口';
  maximize.setAttribute('aria-label',maximize.title);
  maximize.setAttribute('aria-pressed',String(expanded));
 };
 minimize.onclick=onMinimize;
 maximize.onclick=toggle;
 if(onClose)close.onclick=onClose;
 panel.querySelector('.call-head,header').addEventListener('dblclick',event=>{if(!event.target.closest('button'))toggle()});
 return {toggle};
}
