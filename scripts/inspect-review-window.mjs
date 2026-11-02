const page=(await fetch('http://127.0.0.1:9229/json/list').then(r=>r.json())).find(p=>p.type==='page'&&p.url.startsWith('http://127.0.0.1:4318/'));
if(!page)throw Error('小木验收窗口未找到');
const ws=new WebSocket(page.webSocketDebuggerUrl);let timer;
await new Promise((resolve,reject)=>{
 timer=setTimeout(()=>reject(Error('检查超时')),15000);
 ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`JSON.stringify({url:location.href,ready:document.readyState,reviewHandler:typeof document.querySelector('#postmarketReview')?.onclick,savedHandler:typeof document.querySelector('#postmarketSaved')?.onclick,modal:document.querySelector('#modal')?.open,progress:document.querySelector('#postmarketProgress')?.textContent,result:document.querySelector('#postmarketResult')?.textContent?.slice(0,1000),body:document.body.innerText.slice(0,900)})`,returnByValue:true}}));
 ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id===1){console.log(r.result?.result?.value||JSON.stringify(r.error));clearTimeout(timer);ws.close();resolve()}};ws.onerror=reject;
});
