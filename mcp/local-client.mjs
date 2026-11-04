// Internal chat transport. Uses the same stdio server as external MCP clients.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {availableTools,matchEndpoint,endpoints} from './catalog.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readConfig=Object.freeze({allowWrites:false,allowTrading:false,allowExpensive:false});
const allowed=new Set(availableTools(readConfig).map(t=>t.name));
export function checkChatTool(name,args={}){
 if(!allowed.has(name))throw Error('聊天仅允许读取小木和纯计算');
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('工具参数必须为对象');
 if(name==='wujian_api'||name==='wujian_endpoint'){
  let endpoint;
  if(name==='wujian_api'){
   const path=String(args.path||'');
   if(!path.startsWith('/api/')||/[?#\\]/.test(path)||/%|\.\./.test(path))throw Error('只允许已登记的小木API路径');
   endpoint=matchEndpoint(String(args.method||'GET').toUpperCase(),path);
  }else endpoint=endpoints.find(e=>e.id===args.id);
  if(!endpoint||endpoint.stream||endpoint.deprecated||!['read','calc'].includes(endpoint.access)||/\/(login|bind|verify|ticket)(\/|$)/.test(endpoint.path))throw Error('该接口不允许由聊天调用');
  for(const value of Object.values(args.pathParams||{}))if(typeof value!=='string'||/[\\/%?#]|\.\./.test(value))throw Error('路径参数无效');
 }
}

export async function openLocalMcp({baseUrl='http://127.0.0.1:'+String(process.env.PORT||4318),signal,timeoutMs=30000}={}){
 const base=new URL(baseUrl);
 if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('聊天MCP只连接本机小木服务');
 signal?.throwIfAborted();
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(key)));
 // The desktop service runs under Electron's executable; its child must also run as Node.
 Object.assign(env,{ELECTRON_RUN_AS_NODE:'1',WUJIAN_API_BASE:base.origin,WUJIAN_TIMEOUT_MS:'20000',WUJIAN_MAX_RESULT_BYTES:'100000',WUJIAN_ALLOW_WRITES:'0',WUJIAN_ALLOW_TRADING:'0',WUJIAN_ALLOW_EXPENSIVE:'0'});
 const child=spawn(process.execPath,[resolve(root,'mcp/server.mjs')],{cwd:root,env,stdio:['pipe','pipe','ignore'],windowsHide:true});
 const pending=new Map();let sequence=0,closed=false;
 const fail=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear()};
 const close=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',close);fail(Error('小木查询已结束或取消'));child.stdin.destroy();child.kill();};
 child.on('error',()=>{fail(Error('小木MCP进程未能启动'));close()});
 child.on('exit',()=>{fail(Error('小木MCP连接已关闭'));close()});
 child.stdin.on('error',()=>{fail(Error('小木MCP连接已关闭'));close()});
 const lines=createInterface({input:child.stdout});
 lines.on('line',line=>{let msg;try{msg=JSON.parse(line)}catch{return}const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error('小木MCP请求失败')):p.resolve(msg.result)});
 signal?.addEventListener('abort',close,{once:true});
 const request=(method,params={})=>new Promise((resolve,reject)=>{
  if(closed||signal?.aborted)return reject(Error('小木查询已取消'));
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('小木查询超时'))},timeoutMs);
  pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 });
 try{
  await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'xiaomu-im-chat',version:'1.0.0'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const list=await request('tools/list');
  const tools=(list.tools||[]).filter(t=>allowed.has(t.name)&&t.annotations?.readOnlyHint===true).map(t=>({name:t.name,description:t.description,parameters:t.inputSchema}));
  return{tools,close,async call(name,args={}){checkChatTool(name,args);const result=await request('tools/call',{name,arguments:args});if(result.isError)return{error:'小木工具未能取得数据，请缩小范围或检查工作台状态',tool:name};return result.structuredContent??{content:result.content}}};
 }catch(error){close();throw error}
}
