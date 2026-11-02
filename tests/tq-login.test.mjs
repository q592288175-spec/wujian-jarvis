import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {TqLogin,validateTqCredentials} from '../integrations/tq-login.mjs';
import {tqQuoteFor} from '../integrations/tq-panorama.mjs';
import {MonitorService} from '../integrations/monitor-service.mjs';
import {protectLocalSecret} from '../integrations/local-secret.mjs';

const output=resolve('output/tq-login-20261028/tests');await mkdir(output,{recursive:true});
const credentials={user:'fixture-account',password:'fixture-password'};
const protect=async(v,mode)=>mode==='decrypt'?Buffer.from(v.data,'base64').toString():{format:'windows-dpapi-v1',data:Buffer.from(v).toString('base64')};
function fakeMonitor(){return {provider:'sina',market:{status:'idle'},quotes:new Map(),subscription:'',now:Date.now,credentials:null,async catalog(){return [{symbol:'SHFE.FU2701'}]},connect(c){this.credentials=c;this.provider='tqsdk';this.market={status:'connecting',message:'正在核验'};this.subscription=this.marketSymbols.join(',')},async useProvider(p){this.provider=p;this.quotes.clear()}}}

test('登录校验、会话登录、密文恢复与退出，不回传密码',async()=>{
 assert.throws(()=>validateTqCredentials(null),/账号和密码/);assert.throws(()=>validateTqCredentials({user:'',password:'x'}),/账号和密码/);
 const home=await mkdtemp(join(output,'session-')),monitor=fakeMonitor(),login=new TqLogin({monitor,home,protect});
 await login.init();assert.equal(login.status().configured,false);
 let result=await login.login({...credentials,remember:true});assert.equal(result.status,'connecting');assert.equal(result.saved,true);assert.equal(result.subscribed,1);assert.equal(monitor.watchMarket,true);
 assert.ok(!JSON.stringify(result).includes(credentials.user));assert.ok(!JSON.stringify(result).includes(credentials.password));
 const envelope=await readFile(login.file,'utf8');assert.ok(!envelope.includes(credentials.password));
 const nextMonitor=fakeMonitor();nextMonitor.provider='tqsdk';const restored=new TqLogin({monitor:nextMonitor,home,protect});await restored.init();assert.equal(restored.status().configured,true);assert.equal(nextMonitor.credentials.password,credentials.password);
 await restored.login({...credentials,remember:false});assert.equal(restored.status().saved,false);await assert.rejects(()=>readFile(login.file),{code:'ENOENT'});
 await writeFile(restored.legacyFile,'fixture-legacy-ciphertext');await restored.logout();assert.equal(restored.status().configured,false);assert.equal(nextMonitor.provider,'sina');assert.equal(nextMonitor.watchMarket,false);await assert.rejects(()=>readFile(restored.legacyFile),{code:'ENOENT'});
 assert.equal(JSON.parse(await readFile(login.settingsFile)).managed,true);
});

test('加密失败保留旧账号；解密失败明确提示，禁止明文回退',async()=>{
 const home=await mkdtemp(join(output,'broken-')),monitor=fakeMonitor(),login=new TqLogin({monitor,home,protect:async()=>{throw Error('encryption unavailable')}});
 monitor.credentials={user:'old',password:'old'};await assert.rejects(()=>login.login({...credentials,remember:true}),/encryption unavailable/);assert.equal(monitor.credentials.user,'old');assert.equal(monitor.provider,'sina');
 await writeFile(login.file,'{"format":"plain","password":"fixture"}');await login.init();assert.match(login.status().message,/无法解密/);
});

test('Windows 实际 DPAPI 往返成功，保存文件不含账号密码',async()=>{
 if(process.platform!=='win32')return;
 const home=await mkdtemp(join(output,'dpapi-')),monitor=fakeMonitor(),login=new TqLogin({monitor,home,protect:protectLocalSecret});await login.login({...credentials,remember:true});
 const text=await readFile(login.file,'utf8');assert.ok(!text.includes(credentials.user));assert.ok(!text.includes(credentials.password));const reopened=new TqLogin({monitor:fakeMonitor(),home});await reopened.init();assert.equal(reopened.status().saved,true);await reopened.logout();
});

test('天勤报价仅进入同日同合约，不把昨日、未来、换月或公开报价冒充天勤',()=>{
 const now=Date.parse('2026-10-28T10:00:00+08:00'),product={exchange:'CZCE',contract:'MA2701'},monitor={provider:'tqsdk',watchMarket:true,quotes:new Map()},quote={source:'TqSdk',symbol:'CZCE.MA701',last:2000,quoteAt:'2026-10-28T10:00:00+08:00',tradingDay:'2026-10-28'};
 monitor.quotes.set(quote.symbol,quote);assert.equal(tqQuoteFor(product,'2026-10-28',monitor,now).last,2000);
 assert.equal(tqQuoteFor(product,'2026-10-27',monitor,now),null);assert.equal(tqQuoteFor({...product,contract:'MA2705'},'2026-10-28',monitor,now),null);
 quote.quoteAt='2026-10-29T10:00:00+08:00';assert.equal(tqQuoteFor(product,'2026-10-28',monitor,now),null);
 quote.quoteAt='2026-10-28T11:00:00+08:00';assert.equal(tqQuoteFor(product,'2026-10-28',monitor,now),null);
 quote.quoteAt='2026-10-27T10:00:00+08:00';quote.tradingDay='2026-10-27';assert.equal(tqQuoteFor(product,'2026-10-28',monitor,now),null);
 quote.quoteAt='2026-10-28T10:00:00+08:00';quote.source='新浪';assert.equal(tqQuoteFor(product,'2026-10-28',monitor,now),null);
});

test('真实 Python 采集器协议：无提醒也订阅、接收量价仓；认证失败不泄露凭据',async()=>{
 const root=await mkdtemp(join(output,'collector-'));await mkdir(join(root,'integrations'));await mkdir(join(root,'.runtime/monitor-deps/tqsdk'),{recursive:true});
 await copyFile('integrations/monitor_market.py',join(root,'integrations/monitor_market.py'));await copyFile('tests/helpers/tq-sdk-fixture.py',join(root,'.runtime/monitor-deps/tqsdk/__init__.py'));
 const previous=process.env.TQ_PYTHON;process.env.TQ_PYTHON=resolve('.runtime/python313/python.exe');
 const monitor=new MonitorService({root,path:':memory:',getCatalog:async()=>[]}),login=new TqLogin({monitor,home:join(root,'secrets'),protect});
 const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100))}throw Error(JSON.stringify(login.status()))};
 try{
  monitor.setRuntime(false,'fixture paused');await login.login({...credentials,remember:false});await wait(()=>login.status().quoteCount===1);const state=login.status();assert.equal(state.status,'connected');assert.equal(state.heartbeatFresh,true);assert.equal(monitor.store.rules().length,0);assert.equal(monitor.runtime,false);
  const quote=login.quotes().items[0];assert.equal(quote.last,3000);assert.equal(quote.previousSettlement,2900);assert.equal(quote.volume,12345);assert.equal(quote.interest,67890);assert.ok(quote.changePct>3);
  assert.equal(quote.sessionActive,false);assert.deepEqual(state.unavailable,[{symbol:'SHFE.AU2701',reason:'行情权限不足'}]);
  await new Promise(r=>setTimeout(r,300));assert.equal(login.quotes().items[0].sequence,quote.sequence,'休市快照不伪造持续跳价');
  await login.login({user:'invalid',password:credentials.password,remember:false});await wait(()=>login.status().status==='permission-denied');assert.equal(login.status().quoteCount,0);assert.ok(!JSON.stringify(login.status()).includes(credentials.password));
 }finally{monitor.stop();monitor.store.close();if(previous===undefined)delete process.env.TQ_PYTHON;else process.env.TQ_PYTHON=previous;}
});

test('重启后恢复保存账号并自动订阅；不会启用原来暂停的监控',async()=>{
 const home=await mkdtemp(join(output,'restart-')),first=fakeMonitor();
 const login=new TqLogin({monitor:first,home,protect});await login.login({...credentials,remember:true});
 const next=fakeMonitor();next.provider='tqsdk';next.runtime=false;
 const restored=new TqLogin({monitor:next,home,protect});await restored.init();
 assert.equal(restored.status().saved,true);assert.equal(next.watchMarket,true);assert.equal(next.subscription,'SHFE.FU2701');assert.equal(next.runtime,false);
});
