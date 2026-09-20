export function mountChartInspect(host,bars){
 host.querySelector('.chart-readout')?.remove();
 const svg=host.querySelector('svg');if(!svg||!bars.length)return;
 const readout=document.createElement('div');readout.className='chart-readout';readout.textContent='移动查看开高低收与成交量';host.append(readout);
 const ns='http://www.w3.org/2000/svg',line=document.createElementNS(ns,'path');line.setAttribute('stroke','#cbeaff');line.setAttribute('stroke-dasharray','2 2');line.setAttribute('pointer-events','none');svg.append(line);
 const max=Math.max(...bars.map(b=>Number.isFinite(b.volume)?b.volume:0));
 if(max>0)for(let i=0;i<bars.length;i++){const b=bars[i];if(!Number.isFinite(b.volume)||b.volume<0)continue;const r=document.createElementNS(ns,'rect');r.setAttribute('x',String(8+i*344/bars.length));r.setAttribute('y',String(205-b.volume/max*13));r.setAttribute('width',String(Math.max(1,280/bars.length)));r.setAttribute('height',String(b.volume/max*13));r.setAttribute('fill',b.close>=b.open?'#ff6472':'#35d49b');r.setAttribute('opacity','.65');svg.append(r)}
 host.onpointermove=e=>{const rect=svg.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*420,y=(e.clientY-rect.top)/rect.height*220,index=Math.max(0,Math.min(bars.length-1,Math.round((x-8)/344*bars.length))),b=bars[index],cx=8+index*344/bars.length;
 line.setAttribute('d',`M${cx} 8 V205 M4 ${Math.max(8,Math.min(185,y))} H354`);readout.textContent=`第${index+1}根 开 ${b.open} 高 ${b.high} 低 ${b.low} 收 ${b.close} 量 ${Number.isFinite(b.volume)?b.volume:'未知'}`;};
 host.onpointerleave=()=>{line.setAttribute('d','');};
}
