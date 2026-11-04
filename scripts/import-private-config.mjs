// Used only by the owner's private migration ZIP. No credentials belong in Git.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hostname,userInfo} from 'node:os';
import {protectLocalSecret} from '../integrations/local-secret.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(root,'.runtime/migration/credentials.json'),marker=resolve(root,'.runtime/migration/imported.json');
let payload;try{payload=JSON.parse(await readFile(source,'utf8'))}catch(e){if(e.code==='ENOENT'){console.log('没有待导入的迁移配置');process.exit(0)}throw Error('迁移配置不可读')}
const owner=hostname()+'\\'+userInfo().username;let previous;try{previous=JSON.parse(await readFile(marker,'utf8'))}catch{}
const allowed=new Set(['.runtime/private/voice.enc','.runtime/private/weixin-connection.enc','.runtime/feishu/connection.enc','.runtime/monitor/tq-login.enc']);
if(previous?.owner!==owner){
 const encrypted=[];for(const entry of payload.entries||[]){if(!allowed.has(entry.path)||typeof entry.value!=='string')throw Error('迁移凭据目标无效');encrypted.push({path:entry.path,envelope:await protectLocalSecret(entry.value)})}
 for(const entry of encrypted){const target=resolve(root,entry.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(entry.envelope))}
 await writeFile(marker,JSON.stringify({owner,importedAt:new Date().toISOString(),entries:encrypted.map(e=>e.path)},null,2));
}
const envPath=resolve(root,'.env');let text=await readFile(envPath,'utf8').catch(()=>''),values={...(payload.extraEnv||{}),TQ_PYTHON:resolve(root,'.runtime/python313/python.exe'),WUJIAN_BUNDLE_ROOT:resolve(root,'../资料包'),WUJIAN_KNOWLEDGE_ROOT:resolve(root,'../资料包/资料实验基地')};
if(payload.imaClientIncluded)values.WUJIAN_IMA_CLIENT=resolve(root,'vendor/ima-client/ima_api.cjs');
for(const [key,value] of Object.entries(values)){if(!/^[A-Z][A-Z0-9_]+$/.test(key)||typeof value!=='string')throw Error('环境配置无效');const line=key+'='+JSON.stringify(value),pattern=new RegExp('^'+key+'=.*$','m');text=pattern.test(text)?text.replace(pattern,()=>line):text+'\n'+line}
await writeFile(envPath,text);console.log('API配置已就绪；凭据按当前Windows用户加密，未输出密钥。');
