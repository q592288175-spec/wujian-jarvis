const {installTrendAlarm}=require('./trend-alarm.cjs');
const {app,ipcMain,safeStorage,Notification,Tray,Menu,nativeImage,powerMonitor,dialog}=require('electron');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const APP_ID='com.wujian.jarvis';

function installMonitor({base,project,getWindow,isQuitting,requestQuit}){
 const directory=process.env.WUJIAN_MONITOR_HOME||path.join(project,'.runtime','monitor');fs.mkdirSync(directory,{recursive:true});
 const secrets=path.join(directory,'credentials.enc'),preferences=path.join(directory,'desktop-settings.json');
 let tray,timer,busy=false,stopped=false,settings={},suspendResume=false,closingBusy=false;
 try{settings=JSON.parse(fs.readFileSync(preferences,'utf8'));}catch{}
 const notifications=new Map(),trendNotifications=new Set();
 const api=async(route,input)=>{
  const response=await fetch(base+'/api/monitor/'+route,input===undefined?{signal:AbortSignal.timeout(6000)}:{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(input),signal:AbortSignal.timeout(6000)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'提醒服务未响应');return value;
 };
 const trendAlarm=installTrendAlarm({api,getWindow,base,directory});
 const tqApi=async(route,input)=>{const response=await fetch(base+'/api/tq/'+route,{signal:AbortSignal.timeout(input===undefined?10000:60000),...(input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(input)})});const value=await response.json();if(!response.ok)throw Error(value.error||'天勤行情服务未响应');return value;};
 const reveal=event=>{const window=getWindow();if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus();if(event?.id)void window.loadURL(event.kind==='ma-turn'?base+'/market-panorama.html#market/monitor':base+'/?view=monitor&monitorEvent='+encodeURIComponent(event.id));};
 const trusted=event=>{const window=getWindow();return window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&new URL(event.senderFrame.url).origin===base;};
 ipcMain.handle('xiaomu:monitor-configure',async(event,input)=>{
  if(!trusted(event)||!input||typeof input.user!=='string'||typeof input.password!=='string'||!input.user.trim()||!input.password||input.user.length>200||input.password.length>500)throw Error('行情凭据格式无效');
  return tqApi('login',{user:input.user.trim(),password:input.password,remember:true});
 });
 ipcMain.handle('xiaomu:monitor-notification-test',async event=>{if(!trusted(event))throw Error('来源无效');return api('test',{channels:['desktop']});});
 ipcMain.handle('xiaomu:trend-alarm-test',async(event,id)=>{if(!trusted(event))throw Error('来源无效');return trendAlarm.test(id)});
 ipcMain.handle('xiaomu:trend-alarm-settings',async(event,id)=>{if(!trusted(event))throw Error('来源无效');return trendAlarm.settings(id)});
 ipcMain.handle('xiaomu:trend-alarm-active',async(event,value)=>{if(!trusted(event))throw Error('来源无效');const result=trendAlarm.setActive(value);if(!result.active)for(const id of trendNotifications){notifications.get(id)?.close();notifications.delete(id);trendNotifications.delete(id)}return result;});
 app.setAppUserModelId(APP_ID);
 if(process.platform==='win32'){
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(project,'scripts','register-monitor-notifications.ps1'),'-Executable',process.execPath,'-AppId',APP_ID],{windowsHide:true,stdio:'ignore'});
  child.on('error',()=>{});
 }
 function ensureTray(){
  if(tray)return;
  const icon=path.join(project,'desktop','assets','wujian-app.ico');let image=fs.existsSync(icon)?nativeImage.createFromPath(icon):nativeImage.createFromPath(path.join(project,'desktop','assets','wujian-app-1024.png'));
  if(image.isEmpty())image=nativeImage.createFromPath(process.execPath);
  tray=new Tray(image.resize({width:20,height:20}));tray.setToolTip('小木 · 盯盘提醒后台运行');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'打开小木',click:()=>reveal()},{label:'盯盘提醒',click:()=>reveal('')||getWindow().loadURL(base+'/?view=monitor')},{type:'separator'},{label:'退出并停止监控',click:()=>requestQuit()}]));tray.on('double-click',()=>reveal());
 }
 async function closing(event){
  if(isQuitting())return;
  event.preventDefault();if(closingBusy)return;const window=getWindow();
  if(settings.closeAction==='background'){ensureTray();window.hide();return;}
  let status;try{status=await api('status');}catch{return requestQuit();}
  if(!status.activeRules)return requestQuit();
  closingBusy=true;
  const choice=await dialog.showMessageBox(window,{type:'question',title:'小木盯盘提醒',message:'窗口关闭后如何处理已启用提醒？',detail:'后台监控需要电脑保持运行和联网。',buttons:['后台监控','退出并停止'],defaultId:0,cancelId:1,checkboxLabel:'记住本次选择',checkboxChecked:false});closingBusy=false;
  if(choice.checkboxChecked){settings.closeAction=choice.response===0?'background':'quit';fs.writeFileSync(preferences,JSON.stringify(settings));}
  if(choice.response===0){ensureTray();window.hide();}else requestQuit();
 }
 getWindow().on('close',event=>{if(settings.closeAction==='quit'&&!isQuitting()){event.preventDefault();requestQuit();return;}void closing(event).catch(()=>dialog.showErrorBox('后台监控未能启动','请保持工作台窗口打开，并检查托盘与本地服务。'));});
 async function tick(){
  if(busy||stopped)return;busy=true;
  try{
   await api('desktop/heartbeat',{supported:Notification.isSupported()});
   const {items}=await api('desktop/pending');
   for(const event of items){
    if(notifications.has(event.id))continue;
    await api('desktop/ack',{id:event.id,status:'sending'});
    if(event.kind==='ma-turn'){
     if(!trendAlarm.isActive()||!await trendAlarm.push(event)){await api('desktop/ack',{id:event.id,status:'accepted',note:'已保留页面轻提示；未启动语音弹窗或不是启动后的新信号'});continue;}
    }
    if(!Notification.isSupported()){await api('desktop/ack',{id:event.id,status:'failed',note:'Windows通知不支持，请查看工作台'});continue;}
    const body=event.kind==='announcement'?event.evidence.title:event.name+' '+(event.symbol||'')+'\n'+event.condition+(event.price!==undefined?'\n最新成交价 '+event.price:'')+'\n'+new Date(event.triggeredAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
    const notification=new Notification({title:'小木 · '+event.label,body,silent:event.kind==='ma-turn'});notifications.set(event.id,notification);if(event.kind==='ma-turn')trendNotifications.add(event.id);
    const timeout=setTimeout(()=>void api('desktop/ack',{id:event.id,status:'unknown',note:'Windows未确认接收，请查看工作台记录'}).catch(()=>{}),10000);timeout.unref();
    notification.on('show',()=>{clearTimeout(timeout);void api('desktop/ack',{id:event.id,status:'accepted',note:'Windows已接收；系统免打扰可能影响显示'}).catch(()=>{});});
    notification.on('failed',()=>{clearTimeout(timeout);notifications.delete(event.id);void api('desktop/ack',{id:event.id,status:'failed',note:'Windows未确认显示通知'}).catch(()=>{});});
    notification.on('click',()=>{reveal(event);void api('events/'+event.id+'/read',{}).catch(()=>{});});
    notification.on('close',()=>{notifications.delete(event.id);trendNotifications.delete(event.id)});notification.show();
   }
   await trendAlarm.sync();
  }catch{}finally{busy=false;}
 }
 powerMonitor.on('suspend',()=>{void api('status').then(status=>{suspendResume=status.runtime;return api('runtime',{enabled:false,reason:'电脑休眠'});}).catch(()=>{});});
 powerMonitor.on('resume',()=>{if(suspendResume)void api('runtime',{enabled:true,reason:'电脑恢复运行'}).catch(()=>{});});
 const ready=(async()=>{
  await api('runtime',{enabled:true,reason:'APP启动'});
  const tq=await tqApi('status');
  if(!tq.managed&&!tq.configured&&(await api('status')).market.provider!=='sina'&&fs.existsSync(secrets)&&safeStorage.isEncryptionAvailable()){try{const credentials=JSON.parse(safeStorage.decryptString(fs.readFileSync(secrets)));await tqApi('login',{...credentials,remember:true});}catch{}}
  timer=setInterval(()=>void tick(),2000);timer.unref();await tick();
 })();
 return {ready,async stop(){stopped=true;trendAlarm.stop();ipcMain.removeHandler('xiaomu:trend-alarm-test');ipcMain.removeHandler('xiaomu:trend-alarm-settings');ipcMain.removeHandler('xiaomu:trend-alarm-active');clearInterval(timer);tray?.destroy();ipcMain.removeHandler('xiaomu:monitor-configure');ipcMain.removeHandler('xiaomu:monitor-notification-test');await api('runtime',{enabled:false,reason:'APP退出'}).catch(()=>{});}};
}
module.exports={installMonitor};
