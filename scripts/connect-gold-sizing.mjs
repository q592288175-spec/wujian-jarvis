import {readFile,writeFile} from 'node:fs/promises';
const patch=async(path,pairs)=>{let s=await readFile(path,'utf8');for(const[a,b]of pairs){if(!s.includes(a))throw Error('未找到 '+path+': '+a.slice(0,70));s=s.replace(a,b)}await writeFile(path,s)};
await patch('dist/gold-sizing-ui.js',[
 ["accounts.filter(a=>a.status!=='disabled')","accounts.filter(a=>a.status==='active')"],
 ['<section class="gold-sizing form-section"','<form id="goldSizingForm" class="gold-sizing form-section"'],
 ['采用最新建议价格</button></section>','采用最新建议价格</button></form>'],
 ["available=next.filter(a=>a.status!=='disabled')","available=next.filter(a=>a.status==='active')"],
 ["$('#goldSizingAccount').onchange=", "$('#goldSizingForm').onsubmit=e=>{e.preventDefault();calculate(true)};$('#goldSizingAccount').oninput=()=>calculate(true);\n $('#goldSizingAccount').onchange="],
 ['return{values,calculate,setPrices,suggest,setCycle',"return{values,calculate,setPrices,suggest,previewFor(input){const account=available.find(a=>a.id===input.accountId);return simpleSizing({equity:account?.equity??null},{...input,direction:card.direction,multiplier:spec?.pointValue??null,tickSize:spec?.tickSize??null})},setCycle"]
]);
await patch('dist/gold-ui.js',[
 ["import {METHODS,GOLD_RULE}","import {mountGoldSizing} from './gold-sizing-ui.js';\nimport {METHODS,GOLD_RULE,deriveMethod}"],
 ['<div id="goldChoice"></div><div id="goldTerms">','<div id="goldChoice"></div><div id="goldSizing"></div><div id="goldTerms">'],
 [" const $=s=>node.querySelector(s);",` const $=s=>node.querySelector(s);
 const sizing=mountGoldSizing($('#goldSizing'),{card,accounts,api,onChange:applySizingToTerms});
 function updateAccountPreviews(){const form=$('#goldTermsForm');if(!form)return;const entry=Number(form.elements[card.direction==='long'?'entryMax':'entryMin'].value),stop=Number(form.elements.stop.value);for(const tr of form.querySelectorAll('[data-account]')){const result=sizing.previewFor({accountId:tr.dataset.account,entry,stop,riskPercent:Number(tr.querySelector('[name=riskPercent]').value)});tr.querySelector('[data-gold-sizing-lots]').textContent=result.lots===null?'待填写':money(result.lots)+' 手';tr.querySelector('[data-gold-sizing-loss]').textContent=result.riskPerLot===null?'':'每手止损 '+money(result.riskPerLot)+' 元';tr.querySelector('[data-gold-account-equity]').textContent=money(result.baseEquity)+' 元';}}
 function applySizingToTerms(values){const form=$('#goldTermsForm');$('#goldReview').innerHTML='';if(!form)return;for(const key of ['entryMin','entryMax'])form.elements[key].value=values.entry??'';form.elements.stop.value=values.stop??'';const row=[...form.querySelectorAll('[data-account]')].find(tr=>tr.dataset.account===values.accountId);if(row)row.querySelector('[name=riskPercent]').value=values.riskPercent??'';form.dirty=true;updateAccountPreviews();}
 function syncSizingFromTerms(){const f=$('#goldTermsForm');if(!f)return;const current=sizing.values(),row=[...f.querySelectorAll('[data-account]')].find(tr=>tr.dataset.account===current.accountId);sizing.setPrices({entry:Number(f.elements[card.direction==='long'?'entryMax':'entryMin'].value)||null,stop:Number(f.elements.stop.value)||null,riskPercent:row?Number(row.querySelector('[name=riskPercent]').value):current.riskPercent,mainCycle:f.elements.mainCycle.value},{isManual:true,notify:false});updateAccountPreviews();}
`],
 ["const form=$('#goldChoiceForm');const redraw=", "const form=$('#goldChoiceForm');const recommend=()=>{try{sizing.suggest(deriveMethod(a,{method:form.elements.method.value,start:form.elements.start.value,end:form.elements.end.value,branch:form.elements.branch.value,direction:card.direction}))}catch{}};const redraw="],
 ["}redraw()};", "}redraw();recommend()};"],
 ["form.elements.start.onchange=redraw;form.elements.end.onchange=redraw;fill();", "form.elements.start.onchange=()=>{redraw();recommend()};form.elements.end.onchange=()=>{redraw();recommend()};form.elements.branch.onchange=recommend;fill();"],
 ["methodStep=step;const d=step.derived;$('#goldReview').innerHTML='';", "methodStep=step;const d=step.derived;sizing.suggest(d);const manual=sizing.values();$('#goldReview').innerHTML='';"],
 ['<h3>审定入场、防守与账户</h3>','<h3>审定入场、防守与账户</h3><p class="muted">入场与止损和上方以损定量同步；试算账户可切换，实际参与账户以此处勾选为准。</p>'],
 ['name="entryMin" value="${d.entry??\'\'}"','name="entryMin" value="${manual.entry??d.entry??\'\'}"'],
 ['name="entryMax" value="${d.entry??\'\'}"','name="entryMax" value="${manual.entry??d.entry??\'\'}"'],
 ['name="stop" value="${d.stop}"','name="stop" value="${manual.stop??d.stop}"'],
 ['<th>风险比例%</th><th>手数</th>','<th>风险比例%</th><th>价差测算上限</th><th>审定手数（可改小）</th>'],
 ['<b>${money(a.equity)} 元</b>','<b data-gold-account-equity>${money(a.equity)} 元</b>'],
 ['value="1" aria-label="${esc(a.alias)}风险比例"','value="${a.id===manual.accountId?manual.riskPercent??1:1}" aria-label="${esc(a.alias)}风险比例"'],
 ['</td><td><input type="number" name="lots"','</td><td><b data-gold-sizing-lots>待填写</b><small data-gold-sizing-loss></small></td><td><input type="number" name="lots"'],
 ['placeholder="自动核算"','placeholder="留空按审定上限"'],
 ["form.elements.mainCycle.value==='small'?'0.5':'1';i.max=i.value})};", "form.elements.mainCycle.value==='small'?'0.5':'1';i.max=i.value});syncSizingFromTerms()};"],
 ["form.oninput=()=>{$('#goldReview').innerHTML=''};", "form.oninput=()=>{$('#goldReview').innerHTML='';syncSizingFromTerms()};updateAccountPreviews();"],
 ['    showReview(latest);','    syncSizingFromTerms();showReview(latest);']
]);
await patch('dist/market-panorama.js',[["backgroundColor:'transparent',animation:false","backgroundColor:type==='candlestick'?candlePalette.background:'transparent',animation:false"],["color:'#c62f24',color0:'#286c50',borderColor:'#c62f24',borderColor0:'#286c50'","color:candlePalette.background,color0:candlePalette.down,borderColor:candlePalette.up,borderColor0:candlePalette.down"]]);
console.log('手动以损定量、建议预填及审定同步已接通。');
