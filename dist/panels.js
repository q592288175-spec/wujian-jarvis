// Spatial presentation only; all controls remain native HTML.
const dashboard=document.querySelector('#dashboard');
let frame=0,x=0,y=0;
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduced')||document.body.classList.contains('focus')||innerWidth<1260;
function draw(){frame=0;dashboard.style.setProperty('--look-x',calm()?'0deg':`${x*1.5}deg`);dashboard.style.setProperty('--look-y',calm()?'0deg':`${-y*.9}deg`)}
dashboard.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=dashboard.getBoundingClientRect();x=(e.clientX-r.left)/r.width*2-1;y=(e.clientY-r.top)/r.height*2-1;if(!frame)frame=requestAnimationFrame(draw)});
dashboard.addEventListener('pointerleave',()=>{x=y=0;draw()});
const panels=[...dashboard.querySelectorAll('.panel')].filter(p=>p.querySelector('.panel-head h2'));
for(const panel of panels){
 const button=document.createElement('button');button.className='panel-pin';button.type='button';button.textContent='◇';button.setAttribute('aria-label','浮出'+panel.querySelector('h2').childNodes[0].textContent.trim()+'面板');button.setAttribute('aria-pressed','false');button.title='浮出 / 归位';
 panel.querySelector('.panel-head').append(button);
 button.addEventListener('click',()=>{const was=panel.classList.contains('panel-forward');panels.forEach(p=>{p.classList.remove('panel-forward');p.querySelector('.panel-pin').setAttribute('aria-pressed','false')});if(!was){panel.classList.add('panel-forward');button.setAttribute('aria-pressed','true')}});
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')panels.forEach(p=>{p.classList.remove('panel-forward');p.querySelector('.panel-pin').setAttribute('aria-pressed','false')})});
