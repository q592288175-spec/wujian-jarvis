// Expose only local encrypted quote configuration and notification testing.
const {contextBridge,ipcRenderer}=require('electron');
window.addEventListener('wheel',event=>{
 if(!event.ctrlKey||event.deltaY===0)return;
 event.preventDefault();event.stopImmediatePropagation();ipcRenderer.send('xiaomu:zoom-step',event.deltaY<0?1:-1);
},{capture:true,passive:false});
window.addEventListener('keydown',event=>{
 if(!(event.ctrlKey||event.metaKey))return;
 const direction=['+','='].includes(event.key)?1:event.key==='-'?-1:event.key==='0'?0:null;
 if(direction===null)return;event.preventDefault();ipcRenderer.send('xiaomu:zoom-step',direction);
},{capture:true});
contextBridge.exposeInMainWorld('xiaomuMonitor',{
 configure:input=>ipcRenderer.invoke('xiaomu:monitor-configure',{user:input?.user,password:input?.password}),
 testAlarm:id=>ipcRenderer.invoke('xiaomu:trend-alarm-test',typeof id==='string'?id:undefined),
 alarmSettings:id=>ipcRenderer.invoke('xiaomu:trend-alarm-settings',typeof id==='string'?id:undefined),
 alarmActivity:active=>ipcRenderer.invoke('xiaomu:trend-alarm-active',active),
 testNotification:()=>ipcRenderer.invoke('xiaomu:monitor-notification-test')
});
if(process.platform==='darwin')window.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.add('wj-desktop-macos'),{once:true});
