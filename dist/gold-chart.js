import {CANDLE_STYLE as palette} from './candle-style.js';
export function goldChartSeries(bars) {
 return bars.map((bar,i)=>({...bar,ma10:i<9?null:bars.slice(i-9,i+1).reduce((sum,b)=>sum+b.close,0)/10}));
}

export function drawGoldChart(canvas,analysis,{start,end}={}) {
 const ctx=canvas.getContext('2d'),bars=goldChartSeries(analysis.bars||[]);
 const w=canvas.width=1400,h=canvas.height=600,pad=36,top=52,bottom=h-44;
 ctx.clearRect(0,0,w,h);ctx.fillStyle=palette.background;ctx.fillRect(0,0,w,h);
 if(!bars.length)return;
 const high=Math.max(...bars.map(b=>b.high)),low=Math.min(...bars.map(b=>b.low)),span=high-low||1;
 const step=(w-2*pad)/bars.length,x=i=>pad+(i+.5)*step,y=p=>bottom-(p-low)*(bottom-top)/span;
 ctx.strokeStyle=palette.grid;ctx.lineWidth=1;ctx.setLineDash([3,5]);
 for(let i=0;i<=4;i++){const yy=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(pad,yy);ctx.lineTo(w-pad,yy);ctx.stroke()}
 ctx.setLineDash([]);
 const body=Math.max(2,Math.min(12,step*.64));ctx.lineWidth=1.6;
 for(const [i,b] of bars.entries()){
  const up=b.close>=b.open,color=up?palette.up:palette.down,xx=x(i),yy=y(Math.max(b.open,b.close)),hh=Math.max(1.6,Math.abs(y(b.open)-y(b.close)));
  ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(xx,y(b.high));ctx.lineTo(xx,y(b.low));ctx.stroke();
  ctx.fillStyle=up?palette.background:color;ctx.fillRect(xx-body/2,yy,body,hh);ctx.strokeRect(xx-body/2,yy,body,hh);
 }
 ctx.strokeStyle=palette.ma;ctx.lineWidth=2.2;ctx.beginPath();let begun=false;
 for(const [i,b] of bars.entries())if(b.ma10!==null){if(!begun){ctx.moveTo(x(i),y(b.ma10));begun=true}else ctx.lineTo(x(i),y(b.ma10))}ctx.stroke();
 ctx.font='20px Microsoft YaHei';ctx.fillStyle=palette.ma;ctx.fillText('MA10（10日均线）',pad,29);
 ctx.font='17px Microsoft YaHei';ctx.fillStyle=palette.text;ctx.textAlign='right';ctx.fillText(`${analysis.contract} · 完成日K · ${analysis.dataDate}`,w-pad,29);ctx.textAlign='left';
 const selected=bars.map((b,i)=>b.date>=start&&b.date<=end?i:-1).filter(i=>i>=0);
 if(selected.length){ctx.strokeStyle=palette.ma;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x(selected[0])-step/2,bottom+12);ctx.lineTo(x(selected.at(-1))+step/2,bottom+12);ctx.stroke()}
 ctx.fillStyle=palette.text;ctx.fillText(bars[0].date,pad,h-10);ctx.textAlign='right';ctx.fillText(bars.at(-1).date,w-pad,h-10);ctx.textAlign='left';
}
