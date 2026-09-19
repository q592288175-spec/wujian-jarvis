import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
const project=resolve('.'),stage=resolve('.runtime/desktop-stage');
await mkdir(stage,{recursive:true});
await copyFile('desktop/main.cjs',resolve(stage,'main.cjs'));
await copyFile('desktop/preload.cjs',resolve(stage,'preload.cjs'));
await copyFile('desktop/loading.html',resolve(stage,'loading.html'));
await writeFile(resolve(stage,'project.json'),JSON.stringify({project},null,2));
await writeFile(resolve(stage,'package.json'),JSON.stringify({name:'wujian-jarvis-desktop',version:'0.3.0',main:'main.cjs',private:true}));
const zipDir=resolve('.runtime/electron-download'),zip=resolve(zipDir,'electron-v44.4.3-darwin-arm64.zip');
if(existsSync(zip)){const expected=JSON.parse(readFileSync('node_modules/electron/checksums.json','utf8'))['electron-v44.4.3-darwin-arm64.zip'];if(createHash('sha256').update(readFileSync(zip)).digest('hex')!==expected)throw Error('Electron下载校验失败');}
const output=await packager({dir:stage,...(existsSync(zip)?{electronZipDir:zipDir}:{}),name:'小木',icon:resolve('desktop/assets/wujian-app.icns'),platform:'darwin',arch:'arm64',electronVersion:'44.4.3',out:resolve(process.env.WUJIAN_DESKTOP_OUT||'.runtime/desktop-build'),overwrite:true,asar:true,appBundleId:'com.wujian.jarvis',appVersion:'0.3.0',extendInfo:{NSMicrophoneUsageDescription:'用于你主动发起的 小木 语音通话。'}});
console.log(output.join('\n'));
