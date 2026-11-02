import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {existsSync} from 'node:fs';
export async function backupFiles(phase,files){
 for(const f of files){const target=resolve('.runtime/ui-history/2026-10-25-'+phase+'-before',f);if(existsSync(f)&&!existsSync(target)){await mkdir(dirname(target),{recursive:true});await copyFile(f,target)}}
}
export async function replaceFile(path,replacements){let text=await readFile(path,'utf8');for(const [a,b] of replacements){if(!text.includes(a))throw Error(path+' 找不到待改片段 '+a.slice(0,100));text=text.replace(a,b)}await writeFile(path,text)}
