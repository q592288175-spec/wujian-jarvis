// Legacy adapter retained for rollback and tests; not imported by the server. All active model traffic uses DeepSeek.
import {spawn,execFile} from 'node:child_process';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const run=promisify(execFile),sessions=new Map();
export async function codexCapability(){try{const [{stdout:version},{stdout:features}]=await Promise.all([run(process.env.CODEX_BIN||'codex',['--version']),run(process.env.CODEX_BIN||'codex',['features','list'])]);await run(process.env.CODEX_BIN||'codex',['login','status']);return{available:features.includes('realtime_conversation'),version:version.trim(),authenticated:true,callTested:false}}catch{return{available:false,authenticated:false,error:'请安装 Codex CLI 并在本机执行 codex login；当前未启动任何通话'}}}
export class Session{
 constructor(tools,execute){this.id=randomUUID();this.tools=tools;this.execute=execute;this.pending=new Map();this.events=[];this.seq=0;this.next=0;this.calls=new Map()}
 emit(type,data={}){this.events.push({seq:++this.seq,type,...data});if(this.events.length>200)this.events.shift()}
 send(value){if(!this.child?.stdin.writable)throw Error('Codex进程不可用');this.child.stdin.write(JSON.stringify(value)+'\n')}
 request(method,params){return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Codex请求超时'))},45000);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}})}
 async handle(m){if(this.closed)return;if(m.id!=null&&this.pending.has(m.id)){const p=this.pending.get(m.id);clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error('Codex请求失败，请检查版本和账号权限')):p.resolve(m.result);return}
 if(m.id!=null){if(m.method!=='item/tool/call'||!this.tools.some(t=>t.name===m.params?.tool)){this.send({id:m.id,error:{code:-32601,message:'仅允许工作台注册的查询工具'}});return}const p=m.params;this.emit('tool.started',{name:p.tool});if(!this.calls.has(p.callId))this.calls.set(p.callId,Promise.resolve().then(()=>this.execute(p.tool,p.arguments)));try{const result=await this.calls.get(p.callId);if(this.closed)return;this.send({id:m.id,result:{success:true,contentItems:[{type:'inputText',text:JSON.stringify(result)}]}});this.emit('tool.completed',{name:p.tool})}catch{if(this.closed)return;this.send({id:m.id,result:{success:false,contentItems:[{type:'inputText',text:'工具执行失败'}]}})}return}
 if(m.method==='thread/realtime/sdp'){this.answer?.(m.params.sdp);return}
 if(m.method?.startsWith('thread/realtime/'))this.emit(m.method,{data:m.params});
 }
 async start(sdp,instructions){const cwd=resolve('.runtime/codex-live');await mkdir(cwd,{recursive:true});this.child=spawn(process.env.CODEX_BIN||'codex',['app-server','--enable','realtime_conversation','-c','shell_environment_policy.inherit="none"'],{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG},stdio:['pipe','pipe','pipe']});this.child.stdin.on('error',()=>this.close());this.child.stderr.on('data',()=>{});this.child.on('error',()=>this.close());this.child.on('exit',()=>this.close());createInterface({input:this.child.stdout}).on('line',line=>{try{void this.handle(JSON.parse(line)).catch(()=>this.emit('session.error',{error:'消息处理失败'}))}catch{}});
 await this.request('initialize',{clientInfo:{name:'wujian_jarvis',version:'0.3.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized'});
 const r=await this.request('thread/start',{cwd,environments:[],sandbox:'read-only',approvalPolicy:'never',ephemeral:true,selectedCapabilityRoots:[],baseInstructions:instructions,dynamicTools:this.tools.map(t=>({name:t.name,description:t.description,inputSchema:t.parameters})),config:{shell_environment_policy:{inherit:'none'},features:{shell_tool:false}}});this.threadId=r.thread.id;
 const answer=new Promise((resolve,reject)=>{this.answer=resolve;this.rejectAnswer=reject;this.answerTimer=setTimeout(()=>reject(Error('Codex Live SDP超时')),50000)});
 answer.catch(()=>{});await this.request('thread/realtime/start',{threadId:this.threadId,version:'v3',model:process.env.CODEX_LIVE_MODEL||'gpt-live-1-codex',outputModality:'audio',transport:{type:'webrtc',sdp},includeStartupContext:true,flushTranscriptTailOnSessionEnd:false});const result=await answer;clearTimeout(this.answerTimer);this.expiry=setTimeout(()=>this.close(),15*60*1000);return result;
 }
 close(){if(this.closed)return;this.closed=true;this.rejectAnswer?.(Error('会话已结束'));clearTimeout(this.expiry);clearTimeout(this.answerTimer);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('会话已结束'))}this.pending.clear();this.child?.kill();const child=this.child;if(child){const hardStop=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')},2000);hardStop.unref()}sessions.delete(this.id)}
}
export async function startCodex(sdp,tools,execute,instructions){if(sessions.size>=1)throw Error('已有Codex Live会话，请先挂断');const session=new Session(tools,execute);sessions.set(session.id,session);try{return{id:session.id,sdp:await session.start(sdp,instructions)}}catch(e){session.close();throw e}}
export function codexEvents(id,after=0){const s=sessions.get(id);return s?{events:s.events.filter(e=>e.seq>after)}:{error:'会话已结束',events:[]}}
export async function codexAction(id,action,text){const s=sessions.get(id);if(!s)throw Error('会话不存在');if(action==='stop'){s.close();return{ok:true}}if(action==='text'&&typeof text==='string'&&text.length<10000){await s.request('thread/realtime/appendText',{threadId:s.threadId,text});return{ok:true}}throw Error('不支持的会话操作')}
