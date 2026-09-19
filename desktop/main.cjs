const {app,BrowserWindow,Menu,shell,dialog,session}=require('electron');
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'project.json'),'utf8'));
const base='http://127.0.0.1:4318';let window,quitting=false;const children=[];
async function health(){try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1500)});if(!r.ok)return 'foreign';const j=await r.json();return j.app==='wujian-jarvis'?'ready':'foreign'}catch(e){return e.cause?.code==='ECONNREFUSED'?'offline':'unknown'}}
function launch(script){const child=spawn(process.execPath,['--env-file-if-exists=.env',script],{cwd:config.project,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'ignore'});children.push(child);child.on('error',()=>{if(!quitting)dialog.showErrorBox('服务启动失败','请检查项目目录及本地运行环境。')});return child}
async function boot(){
 if(!fs.existsSync(path.join(config.project,'server.mjs')))throw Error('项目目录不可用，请从项目重新构建应用。');
 let state=await health();if(state==='foreign'||state==='unknown')throw Error('4318端口无法确认属于本工作台，请检查现有服务。');
 if(state==='offline'){launch('server.mjs');for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));state=await health();if(state==='ready')break}if(state!=='ready')throw Error('本地服务未能启动，请使用项目中的启动脚本检查。')}
 const market=await fetch(base+'/api/live-market',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('行情服务状态读取失败，请重新启动工作台。');return r.json()});
 // The collector owns an exclusive file lock; a fresh snapshot does not prove a live process.
 launch('integrations/start-market.mjs');
 await window.loadURL(base+'/');
}
function external(url){try{const u=new URL(url);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)shell.openExternal(url)}catch{}}
if(!app.requestSingleInstanceLock()){app.quit()}else{
 app.on('second-instance',()=>{window?.show();window?.focus()});
 app.whenReady().then(async()=>{
  window=new BrowserWindow({width:1500,height:980,minWidth:1100,minHeight:720,backgroundColor:'#030b15',title:'五简 JARVIS',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'五简 JARVIS',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'quit'}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'工作台',submenu:[{label:'稳定版',click:()=>window.loadURL(base+'/')},{label:'预览版',click:()=>window.loadURL(base+'/cockpit.html')},{role:'reload'},{role:'togglefullscreen'},{label:'在浏览器打开',click:()=>shell.openExternal(base+'/')}]}]));
  session.defaultSession.setPermissionCheckHandler((contents,permission,origin)=>permission==='media'&&origin===base&&contents===window.webContents);
  session.defaultSession.setPermissionRequestHandler(async(contents,permission,callback,details)=>{if(contents!==window.webContents||!contents.getURL().startsWith(base+'/')||permission!=='media'||!details.mediaTypes?.length||details.mediaTypes.some(t=>t!=='audio'))return callback(false);const result=await dialog.showMessageBox(window,{type:'question',message:'允许本次语音使用麦克风？',detail:'音频将交给你选择的语音服务处理。',buttons:['不允许','允许'],defaultId:0,cancelId:0});callback(result.response===1)});
  window.webContents.setWindowOpenHandler(({url})=>{external(url);return{action:'deny'}});
  window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==base){event.preventDefault();external(url)}});
  window.webContents.on('will-attach-webview',e=>e.preventDefault());
  window.on('close',event=>{if(!quitting){event.preventDefault();window.hide()}});
  try{await window.loadFile(path.join(__dirname,'loading.html'));await boot()}catch(e){dialog.showErrorBox('JARVIS 启动提示',e.message);app.quit()}
 });
 app.on('activate',()=>window?.show());
 app.on('before-quit',()=>{quitting=true;for(const child of children)child.kill('SIGTERM')});
}
