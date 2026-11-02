import {mkdir,readFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {protectLocalSecret} from './local-secret.mjs';
import {atomicWrite} from './research-storage.mjs';

export function validateTqCredentials(input){
 if(!input||typeof input.user!=='string'||typeof input.password!=='string'||!input.user.trim()||!input.password.trim()||input.user.length>200||input.password.length>500)throw Error('请填写快期 / 天勤账号和密码');
 return {user:input.user.trim(),password:input.password};
}

// One connection shared by market pages and existing reminders. No broker login.
export class TqLogin{
 constructor({monitor,root=resolve('.'),home=process.env.WUJIAN_MONITOR_HOME||resolve(root,'.runtime/monitor'),protect=protectLocalSecret}={}){
  Object.assign(this,{monitor,protect});this.file=resolve(home,'tq-login.enc');this.legacyFile=resolve(home,'credentials.enc');this.settingsFile=resolve(home,'tq-login-settings.json');this.saved=false;this.managed=false;this.configError=null;this.busy=false;
 }
 async init(){
  try{this.managed=JSON.parse(await readFile(this.settingsFile,'utf8')).managed===true}catch{}
  try{
   const envelope=JSON.parse(await readFile(this.file,'utf8'));if(envelope.format!=='windows-dpapi-v1')throw Error('format');
   const credentials=validateTqCredentials(JSON.parse(await this.protect(envelope,'decrypt')));this.saved=true;this.managed=true;
   this.monitor.credentials=credentials;
   if(this.monitor.provider==='tqsdk'){await this.prepare();this.monitor.connect(credentials,{resume:false})}
  }catch(error){if(error.code!=='ENOENT')this.configError='本机天勤凭据无法解密，请用当前 Windows 用户重新登录';}
  return this.status();
 }
 async prepare(){this.monitor.marketSymbols=(await this.monitor.catalog()).map(c=>c.symbol);this.monitor.watchMarket=true;}
 status(){
  const m=this.monitor,selected=m.provider==='tqsdk',quotes=selected?[...m.quotes.values()].filter(q=>q.source==='TqSdk'):[];
  const heartbeatFresh=!!m.market.heartbeatAt&&m.now()-Date.parse(m.market.heartbeatAt)<=15000;
  const unavailable=selected?Object.entries(m.market.unavailableContracts||{}).map(([symbol,reason])=>({symbol,reason})):[];
  return {unavailable,managed:this.managed,saved:this.saved,canRemember:process.platform==='win32',configured:!!m.credentials,selected,status:selected?m.market.status:'inactive',message:this.configError||(selected?m.market.message:'正在使用公开行情，天勤尚未启用'),heartbeatFresh,subscribed:selected?m.subscription.split(',').filter(Boolean).length:0,quoteCount:quotes.length,lastQuoteAt:quotes.map(q=>q.quoteAt).sort().at(-1)||null,samples:quotes.slice(0,6).map(({symbol,last,quoteAt,previousSettlement,volume,interest,source})=>({symbol,last,quoteAt,previousSettlement,volume,interest,source})),notice:'使用快期服务账号认证；可用交易所、实时权限与历史范围以你的账号为准。小木仅订阅行情。'};
 }
 async login(input){
  if(this.busy)throw Error('正在处理行情登录，请稍候');
  const credentials=validateTqCredentials(input);this.busy=true;
  try{
   const remember=input.remember===true;
   // Encrypt before changing the active connection. A failure preserves the old login.
   const envelope=remember?await this.protect(JSON.stringify(credentials)):null;
   await mkdir(dirname(this.file),{recursive:true});
   if(envelope)await atomicWrite(this.file,JSON.stringify(envelope));else{await rm(this.file,{force:true});await rm(this.legacyFile,{force:true});}
   await atomicWrite(this.settingsFile,JSON.stringify({managed:true}));
   this.saved=remember;this.managed=true;this.configError=null;
   await this.prepare();this.monitor.connect(credentials,{resume:false});return this.status();
  }finally{this.busy=false}
 }
 async reconnect(){if(this.busy)throw Error('正在处理行情登录，请稍候');if(!this.monitor.credentials)throw Error('请先填写快期 / 天勤账号和密码');this.busy=true;try{await this.prepare();this.monitor.connect(this.monitor.credentials,{resume:false});return this.status()}finally{this.busy=false}}
 async logout(){
  if(this.busy)throw Error('正在处理行情登录，请稍候');
  await mkdir(dirname(this.file),{recursive:true});await rm(this.file,{force:true});await rm(this.legacyFile,{force:true});await atomicWrite(this.settingsFile,JSON.stringify({managed:true}));
  this.saved=false;this.managed=true;this.configError=null;this.monitor.watchMarket=false;this.monitor.marketSymbols=[];this.monitor.credentials=null;
  // Existing reminders keep their enable/disable states and use their public feed.
  const wasRuntime=this.monitor.runtime;await this.monitor.useProvider('sina');if(wasRuntime===false)this.monitor.setRuntime(false,'天勤退出，保留原监控停用状态');return this.status();
 }
 quotes(){return {connection:this.status(),items:this.monitor.provider==='tqsdk'?[...this.monitor.quotes.values()].filter(q=>q.source==='TqSdk'):[]};}
}
