
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('xiaomuAlarm',{onItems:fn=>ipcRenderer.on('xiaomu:alarm-items',(_,items)=>fn(items)),onSilence:fn=>ipcRenderer.on('xiaomu:alarm-silence',()=>fn()),speech:id=>ipcRenderer.invoke('xiaomu:alarm-speech',typeof id==='string'?id:''),ack:()=>ipcRenderer.invoke('xiaomu:alarm-ack'),open:()=>ipcRenderer.invoke('xiaomu:alarm-open')});
