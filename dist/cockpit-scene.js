import * as THREE from './vendor/three.module.js';
const shell=document.querySelector('#cockpit-shell');
function fit(){const scale=Math.min(innerWidth/1536,innerHeight/1024);shell.style.transform=`translate(-50%,-50%) scale(${scale})`;}
fit();addEventListener('resize',fit);
const fallback=document.querySelector('#cockpitRenderStatus');
try{
 const canvas=document.querySelector('#cockpitCanvas');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
 renderer.setSize(1536,1024);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
 const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x020812,.027);
 const camera=new THREE.PerspectiveCamera(48,1.5,.1,140);camera.position.set(0,2.3,12);camera.lookAt(0,1.7,-2);
 const navy=new THREE.MeshStandardMaterial({color:0x091627,metalness:.88,roughness:.29});
 const metal=new THREE.MeshStandardMaterial({color:0x34475c,metalness:.92,roughness:.24});
 const glass=new THREE.MeshStandardMaterial({color:0x153449,metalness:.6,roughness:.13,transparent:true,opacity:.5});
 const lightMaterial=new THREE.MeshBasicMaterial({color:0x68c7ff});
 scene.add(new THREE.AmbientLight(0x567fac,.7));
 for(const [x,y,z,p] of [[0,7,4,100],[-6,1,3,70],[6,1,3,70],[0,-1,7,75]]){const l=new THREE.PointLight(0x53adff,p,24,2);l.position.set(x,y,z);scene.add(l)}
 const key=new THREE.DirectionalLight(0xd2e7ff,2);key.position.set(0,8,10);scene.add(key);
 function box(w,h,d,x,y,z,mat=navy,rx=0,rz=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.set(rx,0,rz);scene.add(m);return m}
 function ring(r,t,x,y,z,mat=lightMaterial,rx=Math.PI/2){const m=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,180),mat);m.position.set(x,y,z);m.rotation.x=rx;scene.add(m);return m}
 // Front canopy ribs and side pylons frame the fixed camera.
 for(const side of [-1,1]){
  box(.28,11,.55,side*8,1,-2,metal,0,side*-.13);
  box(.06,10,.07,side*7.84,1,-1.68,lightMaterial,0,side*-.13);
  box(3.4,.2,.55,side*6.6,6.1,-2,metal,0,side*.12);
  for(let j=0;j<5;j++){box(.9,.13,.6,side*7.8,-2+j*1.65,-1.8,navy,0,side*.07)}
 }
 // Overhead concentric light well, visibly solid with recessed luminous inlays.
 for(let i=0;i<6;i++){
  ring(2.2+i*.55,.06,0,7.2+i*.035,-2.5,metal);
  ring(2.22+i*.55,.014,0,7.16+i*.035,-2.5,new THREE.MeshBasicMaterial({color:i%2?0x2b6496:0x73c7ff}));
 }
 const overhead=new THREE.Mesh(new THREE.CylinderGeometry(5.15,5.3,.14,96,1,true),navy);overhead.position.set(0,7.35,-2.5);scene.add(overhead);
 // City silhouettes beyond the glass; deterministic geometry, not financial data.
 for(let i=0;i<85;i++){
  const x=(i%29-14)*.72,z=-13-Math.floor(i/29)*4,h=.7+Math.abs(Math.sin(i*9.73))*4.8;
  box(.36+(i%3)*.12,h,.65,x,-2.7+h/2,z,new THREE.MeshStandardMaterial({color:i%3?0x07111d:0x0c1b2d,roughness:.6,metalness:.5}));
  for(let j=0;j<Math.floor(h/.22);j++)if(Math.sin(i*7+j*11)>.25)box(.025,.055,.015,x-.08,-2.4+j*.22,z+.34,new THREE.MeshBasicMaterial({color:j%4?0x73a6bf:0xc7b69d}));
 }
 box(30,.1,40,0,-2.8,-9,navy);
 const grid=new THREE.GridHelper(30,40,0x30658c,0x122b43);grid.position.set(0,-2.72,-8);scene.add(grid);
 // Layered annular holographic projection base.
 for(let i=0;i<5;i++){
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(2.3-i*.24,2.38-i*.24,.075,96),i%2?metal:navy);disk.position.set(0,-1.85+i*.09,.9);scene.add(disk);
  ring(2.25-i*.24,.014,0,-1.79+i*.09,.9);
 }
 const sweep=ring(1.87,.022,0,-1.32,.9,new THREE.MeshBasicMaterial({color:0xa6e9ff,transparent:true,opacity:.85}));
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(.6,1.65,3.4,64,1,true),new THREE.MeshBasicMaterial({color:0x257dcb,transparent:true,opacity:.035,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));beam.position.set(0,.1,.9);scene.add(beam);
 // Front console is modeled from an extruded beveled profile.
 const shape=new THREE.Shape();shape.moveTo(-3.7,-.8);shape.lineTo(-3.2,.38);shape.quadraticCurveTo(0,1.1,3.2,.38);shape.lineTo(3.7,-.8);shape.lineTo(2.55,-1.17);shape.lineTo(-2.55,-1.17);shape.closePath();
 const consoleMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.38,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.15,bevelThickness:.13}),metal);consoleMesh.rotation.x=-Math.PI/2+.3;consoleMesh.position.set(0,-2.6,6.3);scene.add(consoleMesh);
 box(5.7,.15,1.45,0,-2.45,6.25,navy,.23);box(5.3,.018,.026,0,-2.21,5.56,lightMaterial,.23);
 for(const side of [-1,1]){
  const wing=box(4.7,.35,3.1,side*5.4,-2.23,4.8,metal,.14,side*.04);wing.rotation.y=side*-.3;
  const screen=box(3.65,.035,1.7,side*5.4,-1.98,4.5,glass,.14);screen.rotation.y=side*-.3;
  for(let i=0;i<8;i++)box(.025,.016,.52,side*(4+i*.32),-1.85,4.8,new THREE.MeshBasicMaterial({color:i%3?0x31678d:0x8acfff}),.14);
  const rail=box(4.2,.025,.035,side*5.5,-1.82,3.8,lightMaterial);rail.rotation.y=side*-.3;
 }
 const particles=[];for(let i=0;i<650;i++)particles.push(Math.sin(i*79.3)*10,Math.cos(i*31.2)*8,-Math.abs(Math.sin(i*11.8))*17);
 const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(particles,3));const points=new THREE.Points(pg,new THREE.PointsMaterial({color:0x6abafb,size:.018,transparent:true,opacity:.6}));scene.add(points);
 let last=0,t=0;function frame(ms){if(document.hidden||ms-last<40)return;const dt=Math.min((ms-last)/1000,.06);last=ms;const reduced=document.body.classList.contains('reduced')||matchMedia('(prefers-reduced-motion:reduce)').matches;if(!reduced)t+=dt;sweep.material.opacity=.65+Math.sin(t*.8)*.15;renderer.render(scene,camera);canvas.dataset.renderReady="true"}
 renderer.setAnimationLoop(frame);fallback.textContent='3D 驾驶舱 · 固定镜头';
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);fallback.textContent='3D场景暂停 · 可返回稳定版'});
 canvas.addEventListener('webglcontextrestored',()=>{renderer.setAnimationLoop(frame);fallback.textContent='3D 驾驶舱 · 固定镜头'});
 addEventListener('beforeunload',()=>{renderer.setAnimationLoop(null);scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()});renderer.dispose()});
}catch(e){fallback.textContent='WebGL不可用 · 界面仍可操作';console.warn('Cockpit renderer unavailable',e)}
