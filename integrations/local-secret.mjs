import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function protectLocalSecret(value,mode='encrypt'){
 if(process.platform!=='win32')throw Error('本机凭据加密需要Windows，未保存明文凭据');
 if(!['encrypt','decrypt'].includes(mode))throw Error('凭据操作无效');
 return new Promise((done,fail)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/protect-local-secret.ps1',import.meta.url)),mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{child.kill();fail(Error('本机加密超时，未保存新凭据'));},10000);
  child.stdin.on('error',()=>{});child.stdout.on('data',chunk=>output+=chunk.toString());child.stderr.resume();child.on('error',()=>{clearTimeout(timer);fail(Error('本机加密工具不可用'));});
  child.on('exit',code=>{clearTimeout(timer);if(code!==0)return fail(Error('本机凭据加密校验未通过'));try{const result=JSON.parse(output);done(mode==='encrypt'?{format:'windows-dpapi-v1',data:result.data}:Buffer.from(result.data,'base64').toString('utf8'));}catch{fail(Error('本机加密结果无效'));}});
  child.stdin.end(JSON.stringify({data:mode==='encrypt'?Buffer.from(value,'utf8').toString('base64'):value.data}));
 });
}
