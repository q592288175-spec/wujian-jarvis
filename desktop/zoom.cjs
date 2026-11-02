const fs=require('node:fs'),path=require('node:path');
const levels=[.5,.67,.75,.8,.9,1,1.1,1.25,1.5,1.75,2];
function nextZoom(current,direction){return direction>0?(levels.find(v=>v>current+.001)||levels.at(-1)):([...levels].reverse().find(v=>v<current-.001)||levels[0])}
function installZoom(window,{file,ipcMain}){
 let factor=1;try{const saved=JSON.parse(fs.readFileSync(file,'utf8')).factor;if(Number.isFinite(saved)&&saved>=.5&&saved<=2)factor=saved}catch{}
 const contents=window.webContents;
 function set(value){factor=Math.min(2,Math.max(.5,value));contents.setZoomFactor(factor);try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({factor}))}catch{}return factor}
 const change=direction=>set(nextZoom(contents.getZoomFactor(),direction));
 const wheel=(event,direction)=>{if(event.sender!==contents||event.senderFrame!==contents.mainFrame||![1,0,-1].includes(direction))return;direction===0?set(1):change(direction)};
 ipcMain.on('xiaomu:zoom-step',wheel);window.once('closed',()=>ipcMain.removeListener('xiaomu:zoom-step',wheel));
 contents.on('before-input-event',(event,input)=>{if(input.type!=='keyDown'||!(input.control||input.meta))return;const key=String(input.key);if(['+','=','Add'].includes(key)){event.preventDefault();change(1)}else if(['-','Subtract'].includes(key)){event.preventDefault();change(-1)}else if(key==='0'){event.preventDefault();set(1)}});
 contents.on('did-finish-load',()=>contents.setZoomFactor(factor));
 return{increase:()=>change(1),decrease:()=>change(-1),reset:()=>set(1)};
}
module.exports={installZoom,nextZoom};
