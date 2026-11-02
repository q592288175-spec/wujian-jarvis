import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {protectLocalSecret} from './local-secret.mjs';
import {atomicWrite} from './research-storage.mjs';

const file=resolve('.runtime/private/voice.enc');
let saved=null,loadError=null;
export function resolveVoiceConfig(env=process.env,local=saved){
 if(local)return {...local};
 const apiKey=env.VOLC_VOICE_API_KEY,appId=env.VOLC_VOICE_APP_ID,accessToken=env.VOLC_VOICE_ACCESS_TOKEN;
 return {protocol:env.VOLC_VOICE_PROTOCOL==='duplex'?'duplex':'legacy',...(apiKey?{apiKey}:appId&&accessToken?{appId,accessToken}:{})};
}
export function voiceConfig(){return loadError?{protocol:'duplex'}:resolveVoiceConfig()}
export function voiceConfigSummary(){const c=voiceConfig();return {configured:!!(c.apiKey||c.appId&&c.accessToken),protocol:c.protocol,auth:c.apiKey?'API Key':c.appId?'APP ID + Access Token':'未配置',configError:loadError};}
export function voiceHeaders(c,requestId=randomUUID()){
 const headers={'X-Api-Resource-Id':'volc.speech.dialog','X-Api-Connect-Id':requestId,'X-Api-Request-Id':requestId};
 if(c.apiKey)headers['X-Api-Key']=c.apiKey;
 else if(c.appId&&c.accessToken)Object.assign(headers,{'X-Api-App-Id':c.appId,'X-Api-Access-Key':c.accessToken,'X-Api-App-Key':'PlgvMymc7f3tQnJ6'});
 else throw Error('请先在本机配置火山语音 API Key，或 APP ID 与 Access Token');
 return headers;
}
export function validateVoiceConfig(value){
 if(!value||!['legacy','duplex'].includes(value.protocol))throw Error('请选择有效的语音协议');
 const token=v=>typeof v==='string'&&/^[A-Za-z0-9_=-]{16,512}$/.test(v);
 if(token(value.apiKey))return {protocol:value.protocol,apiKey:value.apiKey};
 if(typeof value.appId==='string'&&/^\d{5,20}$/.test(value.appId)&&token(value.accessToken))return {protocol:value.protocol,appId:value.appId,accessToken:value.accessToken};
 throw Error('语音配置需要 API Key，或 APP ID 与 Access Token；不使用账户级 AK/SK');
}
export async function readVoiceConfig(path=file,protect=protectLocalSecret){
 try{const envelope=JSON.parse(await readFile(path,'utf8'));if(envelope.format!=='windows-dpapi-v1')throw Error('format');return validateVoiceConfig(JSON.parse(await protect(envelope,'decrypt')))}catch(e){if(e.code==='ENOENT')return null;throw Error('本机语音配置无法解密，请用当前 Windows 用户重新配置')}
}
export async function writeVoiceConfig(value,path=file,protect=protectLocalSecret){
 const c=validateVoiceConfig(value),envelope=await protect(JSON.stringify(c));
 await mkdir(dirname(path),{recursive:true});await atomicWrite(path,JSON.stringify(envelope));return c;
}
export async function loadVoiceConfig(){try{saved=await readVoiceConfig();loadError=null}catch(e){saved=null;loadError=e.message}return voiceConfigSummary()}
export async function saveVoiceConfig(value){saved=await writeVoiceConfig(value);loadError=null;return voiceConfigSummary()}
