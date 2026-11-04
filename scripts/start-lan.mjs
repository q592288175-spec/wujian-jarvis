import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createLanGateway,passwordRecord,lanAddresses} from '../integrations/lan-gateway.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),configPath=resolve(root,'.runtime/private/lan-access.json'),instructions=resolve(root,'局域网访问口令.txt');
await mkdir(dirname(configPath),{recursive:true});let config;
try{config=JSON.parse(await readFile(configPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('局域网口令配置不可读，未启动');const password=randomBytes(18).toString('base64url');config={...passwordRecord(password),port:4321};await writeFile(configPath,JSON.stringify(config));await writeFile(instructions,'小木局域网访问口令（请私下保管）\r\n\r\n'+password+'\r\n\r\n访问地址以启动窗口或部署文档显示为准；主机IP可能变化。\r\n')}
const app=createLanGateway({credentials:config,port:config.port||4321,targetPort:Number(process.env.PORT||4318)});await app.listen();
const addresses=lanAddresses().map(ip=>'http://'+ip+':'+(config.port||4321));console.log('小木局域网入口：'+addresses.join(' / '));console.log('访问口令保存在：'+instructions+'；主机上的小木需要保持运行。');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));
