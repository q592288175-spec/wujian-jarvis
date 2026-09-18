(() => {
 const screen=document.querySelector('#boot-screen'),status=document.querySelector('#boot-status');
 const shell=document.querySelector('#cockpit-shell');
 const start=performance.now();let done=false;
 if(shell)shell.inert=true;
 function close(){if(done)return;done=true;clearInterval(timer);if(shell)shell.inert=false;screen.classList.add('leaving');setTimeout(()=>screen.remove(),600)}
 const timer=setInterval(()=>{
  const globe=document.querySelector('#globeScene')?.dataset.renderReady==='true';
  const cockpit=!shell||document.querySelector('#cockpitCanvas')?.dataset.renderReady==='true';
  const elapsed=performance.now()-start;
  status.textContent=globe&&cockpit?'全息场景就绪':cockpit?'正在加载全息地球':'正在初始化驾驶舱';
  if(globe&&cockpit&&elapsed>1400)close();
  else if(elapsed>7000){status.textContent='场景仍在加载，可先进入工作台';close()}
 },100);
 document.querySelector('#boot-skip').addEventListener('click',close);
})();
