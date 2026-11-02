import {readFileSync} from 'node:fs';
import {saveVoiceConfig} from '../integrations/voice-config.mjs';
try{
 const value=JSON.parse(readFileSync(0,'utf8'));
 await saveVoiceConfig(value);
 console.log('语音配置已本机加密保存。请退出并重新打开小木，再点击接通语音；保存不等于鉴权或真人通话已验收。');
}catch{console.error('语音配置未保存。请核对 API Key，或 APP ID 与 Access Token。');process.exitCode=1}
