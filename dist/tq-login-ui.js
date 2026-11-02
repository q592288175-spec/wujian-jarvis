const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={inactive:'未启用',unconfigured:'待登录',connecting:'登录核验中',connected:'已连接',disconnected:'连接中断',stale:'心跳中断','permission-denied':'账号或权限未通过','runtime-missing':'行情环境不可用',failed:'启动失败',stopped:'已停止'};
async function api(path,input){
 let response;try{response=await fetch('/api/tq/'+path,{cache:'no-store',signal:AbortSignal.timeout(input===undefined?10000:60000),...(input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})})}catch(error){throw Error(['TimeoutError','AbortError'].includes(error.name)?'本机服务响应较慢，请核对下方连接状态后重试':error.message)}
 if(response.status===404)throw Error('新行情接口等待启用，请保存当前编辑后退出并重新打开小木');
 const result=await response.json();if(!response.ok)throw Error(result.error||'天勤行情服务未响应');return result;
}
export function mountTqLogin(){
 if(document.querySelector('#tqLoginButton'))return;
 const host=document.querySelector('.top-actions')||document.querySelector('.cockpit-header');if(!host)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href='/tq-login.css';document.head.append(style);
 const button=document.createElement('button');button.id='tqLoginButton';button.type='button';button.className='toolbar-button tq-entry';button.textContent='行情连接';button.setAttribute('aria-haspopup','dialog');host.prepend(button);
 const dialog=document.createElement('dialog');dialog.id='tqLoginDialog';dialog.className='tq-dialog';dialog.setAttribute('aria-labelledby','tqLoginTitle');
 dialog.innerHTML=`<header><div><small>天勤量化 · TqSdk</small><h2 id="tqLoginTitle">连接期货行情</h2></div><button type="button" data-tq-close aria-label="关闭行情连接">×</button></header><p>填写快期 / 天勤服务账号，登录后自动订阅行情。无需填写券商资金账号或另外申请 API Key。</p><form id="tqLoginForm"><label>快期 / 天勤账号<input name="user" autocomplete="username" maxlength="200" required placeholder="手机号、邮箱或用户名"></label><label>密码<input name="password" type="password" autocomplete="current-password" maxlength="500" required></label><label class="tq-remember"><input type="checkbox" name="remember">在这台电脑加密记住，下次自动连接</label><div class="tq-actions"><button type="submit" class="primary">登录并连接行情</button><button type="button" data-tq-reconnect hidden>重新连接</button><button type="button" data-tq-logout hidden>退出并清除保存的账号</button></div></form><p id="tqActionResult" role="alert"></p><section class="tq-state" aria-live="polite"><b id="tqStateLabel">正在读取连接状态…</b><p id="tqStateMessage"></p><p id="tqStateCounts"></p><p id="tqCoverageGaps"></p><div id="tqQuoteSamples"></div></section><p class="tq-note">连接状态与报价时间分别核对；休市时显示最后报价。天勤报价用于市场全景的最新价、涨跌幅、成交量和持仓量。历史K线、席位和基本面仍标明各自来源。</p><p class="tq-links"><a href="https://account.shinnytech.com/" target="_blank" rel="noreferrer">注册 / 管理快期账号</a><a href="https://doc.shinnytech.com/tqsdk/latest/usage/trade.html" target="_blank" rel="noreferrer">官方账号说明</a></p>`;
 document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('form');let state=null,busy=false,poll=null;
 function paint(value){
  state=value;const connected=value.selected&&value.status==='connected'&&value.heartbeatFresh;
  button.dataset.state=connected?'connected':value.selected&&['permission-denied','failed','runtime-missing','disconnected','stale'].includes(value.status)?'error':'idle';
  button.textContent=connected?'天勤行情 · 已连接':value.selected&&value.status==='connecting'?'天勤行情 · 核验中':'行情连接';
  $('#tqStateLabel').textContent=(labels[value.status]||value.status)+(connected&&value.quoteCount===0?' · 等待首笔报价':'');
  $('#tqStateMessage').textContent=connected&&value.quoteCount>0?'已收到天勤合约报价，请核对下方价格与行情时间。':value.message||'';
  $('#tqStateCounts').textContent=`订阅 ${value.subscribed} 个合约 · 收到 ${value.quoteCount} 个合约报价${value.saved?' · 已在本机加密记住':''}`;
  $('#tqCoverageGaps').textContent=value.unavailable?.length?`有 ${value.unavailable.length} 个合约不可用（${value.unavailable.slice(0,4).map(q=>q.symbol+'：'+q.reason).join('；')}），其他合约继续接收。`:'';
  $('[data-tq-reconnect]').hidden=!value.configured;$('[data-tq-logout]').hidden=!value.configured&&!value.saved;
  form.elements.remember.disabled=!value.canRemember;
  $('#tqQuoteSamples').innerHTML=value.samples?.length?`<table><thead><tr><th>合约</th><th>最新价</th><th>行情时间</th></tr></thead><tbody>${value.samples.map(q=>`<tr><td>${esc(q.symbol)}</td><td>${esc(q.last)}</td><td>${esc(new Date(q.quoteAt).toLocaleString('zh-CN',{hour12:false}))}</td></tr>`).join('')}</tbody></table>`:'';
 }
 async function refresh(){try{paint(await api('status'))}catch(error){if(dialog.open)$('#tqActionResult').textContent=error.message}}
 async function open(){await refresh();form.elements.remember.checked=state?.canRemember===true&&(state.saved||!state.managed);$('#tqActionResult').textContent='';dialog.showModal();await refresh();clearInterval(poll);poll=setInterval(()=>void refresh(),2000)}
 async function run(path,input){if(busy)return;busy=true;dialog.querySelectorAll('button:not([data-tq-close])').forEach(b=>b.disabled=true);$('#tqActionResult').textContent='正在处理…';try{paint(await api(path,input));$('#tqActionResult').textContent=path==='logout'?'天勤已退出并清除保存的账号，已切回公开行情。':'登录请求已提交，正在核验账号与实际行情权限。';window.dispatchEvent(new Event('xiaomu:market-connection'));}catch(error){$('#tqActionResult').textContent=error.message}finally{form.elements.password.value='';busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false)}}
 form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())void run('login',{user:form.elements.user.value,password:form.elements.password.value,remember:form.elements.remember.checked})};
 $('[data-tq-reconnect]').onclick=()=>void run('reconnect',{});$('[data-tq-logout]').onclick=()=>void run('logout',{});
 button.onclick=()=>void open();$('[data-tq-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearInterval(poll);form.elements.password.value=''});
 document.addEventListener('xiaomu:open-tq-login',()=>void open());
 const timer=setInterval(()=>{if(!dialog.open&&document.visibilityState==='visible')void refresh()},15000);window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(poll)},{once:true});void refresh();
}
