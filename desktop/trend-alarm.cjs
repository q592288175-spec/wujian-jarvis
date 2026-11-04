
const {BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
function installTrendAlarm({api,getWindow,base,directory}){
 const catalog=[{id:'taiwan-female',name:'台湾女声'},{id:'clear-male',name:'清爽男声'}],settingsFile=path.join(directory,'alarm-settings.json');let voiceId='taiwan-female';
 try{const saved=JSON.parse(fs.readFileSync(settingsFile,'utf8'));if(catalog.some(c=>c.id===saved.voiceId))voiceId=saved.voiceId;}catch{}
 const voice=(id=voiceId)=>{const found=catalog.find(c=>c.id===id);if(!found)throw Error('请选择台湾女声或清爽男声');return found};
 // Deliberately session-only: opening the app never enables intrusive alerts.
 let active=false,activeSince=Infinity,generation=0;
 function settings(id){if(id!==undefined){voice(id);fs.writeFileSync(settingsFile+'.tmp',JSON.stringify({voiceId:id}));fs.renameSync(settingsFile+'.tmp',settingsFile);voiceId=id;}return{voiceId,mode:'speech',choices:catalog,active,playbackRate:1.5};}
 let window=null,ready=null;const queue=new Map(),seen=new Set();
 const publish=()=>{if(window&&!window.isDestroyed())window.webContents.send('xiaomu:alarm-items',[...queue.values()]);};
 const trusted=e=>window&&!window.isDestroyed()&&e.sender===window.webContents&&e.senderFrame===window.webContents.mainFrame;
 function open(){
  if(window&&!window.isDestroyed())return ready;
  window=new BrowserWindow({width:560,height:550,minWidth:420,minHeight:320,show:false,alwaysOnTop:true,autoHideMenuBar:true,title:'小木 · 均线拐点警报',backgroundColor:'#f5f7fc',webPreferences:{preload:path.join(__dirname,'alarm-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,autoplayPolicy:'no-user-gesture-required'}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  window.on('close',e=>{e.preventDefault();window.hide();window.webContents.send('xiaomu:alarm-silence');});
  ready=window.loadFile(path.join(__dirname,'trend-alarm.html')).then(()=>{publish();if(active&&queue.size)window.showInactive()});return ready;
 }
 function setActive(value){
  if(typeof value!=='boolean')throw Error('提醒开关必须为开启或关闭');
  if(value===active)return settings();
  active=value;activeSince=value?Date.now():Infinity;generation++;
  if(!value){queue.clear();publish();if(window&&!window.isDestroyed()){window.webContents.send('xiaomu:alarm-silence');window.hide()}getWindow()?.flashFrame(false)}
  return settings();
 }
 async function push(event){
  if(!active){if(event.id)seen.add(event.id);return false;}
  if(!Number.isFinite(Date.parse(event.triggeredAt))||Date.parse(event.triggeredAt)<activeSince){if(event.id)seen.add(event.id);return false;}
  if(event.kind!=='ma-turn'||event.readAt||seen.has(event.id)||(!event.isTest&&Date.now()-Date.parse(event.triggeredAt)>300000))return false;
  const version=generation;seen.add(event.id);queue.set(event.id,{...event,voiceId:voice(event.voiceId).id});await open();if(!active||generation!==version||!queue.has(event.id))return false;publish();window.showInactive();getWindow()?.flashFrame(true);return true;
 }
 ipcMain.handle('xiaomu:alarm-ack',async e=>{if(!trusted(e))throw Error('来源无效');const items=[...queue.values()];for(const item of items){if(!item.isTest)await api('events/'+item.id+'/read',{});queue.delete(item.id)}publish();getWindow()?.flashFrame(false);if(!queue.size)window.hide();return{ok:true};});
 ipcMain.handle('xiaomu:alarm-speech',async(e,id)=>{if(!trusted(e)||!active||typeof id!=='string'||!queue.has(id))throw Error('语音警报不存在或已取消');const event=queue.get(id),version=generation;const response=await fetch(base+'/api/trend-monitor/speech',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({voiceId:event.voiceId,...(event.isTest?{preview:true}:{eventId:id})}),signal:AbortSignal.timeout(25000)});const result=await response.json();if(!active||generation!==version||!queue.has(id))throw Error('已停止语音弹窗提醒');if(!response.ok)throw Error(result.error||'语音暂不可用');return result;});
 ipcMain.handle('xiaomu:alarm-open',async e=>{if(!trusted(e))throw Error('来源无效');const w=getWindow();if(w&&!w.isDestroyed()){if(w.isMinimized())w.restore();w.show();w.focus();await w.loadURL(base+'/market-panorama.html#market/monitor')}return{ok:true};});
 function test(id){if(!active)throw Error('请先启动语音弹窗提醒，再试听');if(id!==undefined)voice(id);for(const [key,item]of queue)if(item.isTest)queue.delete(key);return push({id:'test-'+Date.now(),kind:'ma-turn',isTest:true,voiceId:id||voiceId,name:'螺纹钢',symbol:'测试，不是交易信号',period:'30m',direction:'down',price:100,ma:101,condition:'【测试】周K、日K MA10向下；30分钟MA10向下拐头，价格下穿MA10',triggeredAt:new Date().toISOString(),source:'小木本机试听'});}
 return{push,test,settings,setActive,isActive:()=>active,async sync(){for(const [id,item]of queue){if(item.isTest)continue;const response=await api('events/'+id);if(response.event?.readAt||response.readAt)queue.delete(id)}publish();if(!queue.size&&window&&!window.isDestroyed()){window.webContents.send('xiaomu:alarm-silence');window.hide();getWindow()?.flashFrame(false)}},stop(){active=false;generation++;ipcMain.removeHandler('xiaomu:alarm-ack');ipcMain.removeHandler('xiaomu:alarm-open');ipcMain.removeHandler('xiaomu:alarm-speech');if(window&&!window.isDestroyed())window.destroy();}};
}
module.exports={installTrendAlarm};
