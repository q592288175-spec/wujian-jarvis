import * as THREE from './vendor/three.module.js';

// Isolated visual layer: no data, trading or voice permissions are granted here.
const instances=[];
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduced');
function create(host,small=false){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.setClearColor(0x000000,0);host.prepend(renderer.domElement);
 renderer.domElement.setAttribute('aria-hidden','true');
 renderer.domElement.style.visibility='hidden';
 let textureReady=small, sized=false;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100);
 camera.position.set(0,0,small?4.5:6.4);
 const group=new THREE.Group();scene.add(group);
 const uniforms={time:{value:0},color:{value:new THREE.Color(0x55bfff)},energy:{value:0},earth:{value:null},hasMap:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,vertexShader:`varying vec3 n;varying vec3 eye;varying vec2 uvv;void main(){uvv=uv;n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform float time;uniform vec3 color;uniform float energy;uniform sampler2D earth;uniform float hasMap;varying vec3 n;varying vec3 eye;varying vec2 uvv;void main(){float rim=pow(1.-max(dot(n,eye),0.),2.5);vec3 tex=texture2D(earth,uvv).rgb;float land=smoothstep(.015,.18,tex.g-tex.b*.7);float scan=.94+.06*sin(uvv.y*650.+time*1.5);vec3 c=mix(vec3(.006,.035,.075),color*.65,land*hasMap);c+=color*rim*1.5;c+=color*energy*.10;gl_FragColor=vec4(c*scan,.97);}`});
 const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,64,48),material);group.add(sphere);
 if(!small)new THREE.TextureLoader().load('/assets/earth.jpg',tex=>{uniforms.earth.value=tex;uniforms.hasMap.value=1;textureReady=true},undefined,()=>{textureReady=true;document.querySelector('#sceneHint').textContent='全息经纬球 · 纹理未加载'});
 const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.07,48,32),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.BackSide,uniforms:{color:uniforms.color},vertexShader:`varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform vec3 color;varying vec3 n;varying vec3 v;void main(){float a=pow(max(0.,1.-abs(dot(n,v))),4.);gl_FragColor=vec4(color,a*.55);}`}));group.add(atmosphere);
 const wire=new THREE.Mesh(new THREE.SphereGeometry(1.006,36,18),new THREE.MeshBasicMaterial({color:0x40aaff,wireframe:true,transparent:true,opacity:small?.17:.085}));group.add(wire);
 const rings=[];
 for(let i=0;i<(small?3:4);i++){
  const r=new THREE.Mesh(new THREE.TorusGeometry(1.17+i*.15,.0035,4,180,Math.PI*(i===1?1.65:2)),new THREE.MeshBasicMaterial({color:i===1?0xb4efff:0x398ecc,transparent:true,opacity:i===1?.85:.4,blending:THREE.AdditiveBlending}));
  r.rotation.set(.65+i*.45,.3+i*.3,i*.8);group.add(r);rings.push(r);
 }
 const pts=[];for(let i=0;i<(small?450:1900);i++){const a=i*2.39996,y=1-2*(i+.5)/(small?450:1900),r=Math.sqrt(1-y*y),s=small?1.02:1.018;pts.push(Math.cos(a)*r*s,y*s,Math.sin(a)*r*s)}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
 const points=new THREE.Points(geo,new THREE.PointsMaterial({color:0x8fe2ff,size:small?.016:.012,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));group.add(points);
 const orbiters=[];
 if(!small){
  for(let i=0;i<6;i++){const node=new THREE.Mesh(new THREE.SphereGeometry(.018,8,8),new THREE.MeshBasicMaterial({color:i%2?0x63ffdc:0xbbdeff}));scene.add(node);orbiters.push(node)}
  for(let i=0;i<5;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1+i*.14,.004,4,180),new THREE.MeshBasicMaterial({color:0x5acaff,transparent:true,opacity:.5-i*.075}));ring.rotation.x=Math.PI/2.4;ring.position.y=-1.5-i*.015;scene.add(ring)}
  const stars=[];for(let i=0;i<250;i++)stars.push(Math.sin(i*43.13)*3,Math.cos(i*19.71)*3,-1-Math.abs(Math.sin(i*3.4))*3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0x82caff,size:.013,transparent:true,opacity:.5})));
 }
 let angle=.6,drag=false,last=0,hover=0,visible=true,lost=false;
 const canvas=renderer.domElement;
 if(!small){canvas.style.pointerEvents='auto';canvas.style.touchAction='pan-y';canvas.addEventListener('pointerdown',e=>{drag=true;last=e.clientX;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(drag){angle+=(e.clientX-last)*.008;last=e.clientX}});canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);}
 host.addEventListener('pointerenter',()=>hover=1);host.addEventListener('pointerleave',()=>hover=0);
 const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=small?4.5:Math.max(5.4,3.9/camera.aspect);camera.updateProjectionMatrix();sized=true});resize.observe(host);
 const observer=new IntersectionObserver(e=>visible=e[0].isIntersecting);observer.observe(host);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;host.classList.add('gpu-unavailable')});canvas.addEventListener('webglcontextrestored',()=>{lost=false;host.classList.remove('gpu-unavailable')});
 let prev=0,t=0;
 function frame(ms){if(document.hidden||!visible||lost||!textureReady||!sized||ms-prev<33)return;const dt=Math.min((ms-prev)/1000,.05);prev=ms;if(!reduced()){t+=dt;if(!drag)angle+=dt*(small?.16:.045)}
  const state=document.body.dataset.voiceState||'idle',energy=state==='speaking'?1:state==='connected'?.4:state==='connecting'?.7:hover*.2;
  uniforms.energy.value+=(energy-uniforms.energy.value)*.08;uniforms.time.value=t;
  uniforms.color.value.lerp(new THREE.Color(state==='speaking'?0x9fffe6:state==='connecting'?0xb8a1ff:0x55bfff),.04);
  group.rotation.y=angle;group.rotation.z=small?Math.sin(t*.2)*.08:-.14;
  if(small)group.scale.setScalar(1+(reduced()?0:Math.sin(t*(energy?5:1.4))*.018*(1+energy)));
  rings.forEach((r,i)=>{if(!reduced())r.rotation.z+=dt*.04*(i%2?1:-1)});
  orbiters.forEach((p,i)=>{const a=t*.14+i*Math.PI/3;p.position.set(Math.cos(a)*1.38,Math.sin(a)*.5,Math.sin(a)*1.3)});
  renderer.render(scene,camera);
  canvas.style.visibility='';
  host.dataset.renderReady='true';
 }
 renderer.setAnimationLoop(frame);instances.push({renderer,resize,observer,scene});return renderer;
}
try{create(document.querySelector('#globeScene'));create(document.querySelector('#callOrb'),true);document.body.classList.add('three-ready');document.querySelector('#sceneHint').textContent='3D 全息场景 · 拖动旋转';}catch(e){console.warn('全息场景不可用，保留静态界面',e);document.querySelector('#sceneHint').textContent='静态全息模式 · WebGL 不可用';}
window.addEventListener('beforeunload',()=>instances.forEach(({renderer,resize,observer,scene})=>{renderer.setAnimationLoop(null);resize.disconnect();observer.disconnect();scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});renderer.dispose()}));
