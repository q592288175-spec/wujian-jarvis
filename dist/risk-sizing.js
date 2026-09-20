import {contractName} from './contract-name.js';
export function sizePosition({direction,entry,stop,multiplier,budget,cost}){
 if(!['long','short'].includes(direction)||![entry,stop,multiplier,budget,cost].every(Number.isFinite)||Math.min(entry,stop,multiplier,budget)<=0||cost<0)return {error:'请填写有效价格、合约乘数、风险预算及成本'};
 if(direction==='long'?stop>=entry:stop<=entry)return {error:'多单止损必须低于入场价；空单止损必须高于入场价'};
 const perLot=Math.abs(entry-stop)*multiplier+cost,lots=Math.floor(budget/perLot);
 return {lots,perLot,plannedLoss:lots*perLot,remaining:budget-lots*perLot};
}
export function installSizing(){
 let quote=null;document.addEventListener('jarvis:quote',e=>{quote=e.detail.quote});
 const button=document.createElement('button');button.className='quiet';button.textContent='止损与仓位计算';document.querySelector('.decision-panel').append(button);
 button.onclick=()=>{
 const dialog=document.createElement('dialog');dialog.className='sizing-dialog';
 dialog.innerHTML='<form method="dialog"><button style="float:right">关闭</button></form><h2>以损定量 · 人工决策</h2><p class="sizing-symbol"></p><form class="sizing-form"><label>方向<select name="direction"><option value="long">做多</option><option value="short">做空</option></select></label>'+[['entry','计划入场价'],['stop','止损价'],['multiplier','合约乘数（元/点/手）'],['budget','本笔最大风险预算（元）'],['cost','每手手续费与滑点预算（元）']].map(([name,title])=>'<label>'+title+'<input name="'+name+'" type="number" step="any" required min="0"></label>').join('')+'<button class="primary">计算手数</button></form><output aria-live="polite"></output><p>这是计划止损损失，不是最大可能损失。跳空、涨跌停及滑点可能使实际损失超过预算。保证金与可用资金未核验，不代表可开仓手数。</p>';
 dialog.querySelector('.sizing-symbol').textContent=quote?contractName(quote):'未选择合约';
 if(Number.isFinite(quote?.volumeMultiple))dialog.querySelector('[name=multiplier]').value=quote.volumeMultiple;
 dialog.querySelector('form.sizing-form').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target),args=Object.fromEntries([...form].map(([k,v])=>[k,k==='direction'?v:Number(v)])),result=sizePosition(args);dialog.querySelector('output').textContent=result.error||('风险预算允许 '+result.lots+' 手；每手计划风险 '+result.perLot.toFixed(2)+' 元；合计 '+result.plannedLoss.toFixed(2)+' 元。'+(!result.lots?'预算不足一手，保持等待。':''))};
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 };
}
