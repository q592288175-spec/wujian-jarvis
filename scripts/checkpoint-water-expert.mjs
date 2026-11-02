import {mkdir,cp,readdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {databaseManifest} from './system-backup.mjs';

const root=resolve('.');
const destination=resolve('.runtime/checkpoints/water-expert-'+new Date().toISOString().replace(/[:.]/g,'-'));
if(!root.startsWith('D:\\五简个人资料\\')||!destination.startsWith(root+'\\'))throw Error('备份目录越界');
await mkdir(destination,{recursive:true});
const copied=[];
for(const entry of ['integrations','dist','server.mjs','package.json','package-lock.json','.env.example','.runtime/research-reports']){
 try{await cp(resolve(entry),join(destination,entry),{recursive:true,errorOnExist:true,force:false});copied.push(entry)}catch(error){if(error.code!=='ENOENT')throw error}
}
const databases={};
for(const entry of await readdir('.runtime',{withFileTypes:true})){
 if(!entry.isFile()||!/\.(db|sqlite)$/.test(entry.name))continue;
 const path=resolve('.runtime',entry.name),target=join(destination,entry.name),db=new DatabaseSync(path,{readOnly:true});
 try{await backup(db,target)}finally{db.close()}
 databases[entry.name]=databaseManifest(target);
}
const hashes={};
async function scan(folder,prefix=''){for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name),key=prefix+entry.name;if(entry.isDirectory())await scan(path,key+'/');else hashes[key]=createHash('sha256').update(await readFile(path)).digest('hex')}}
await scan(destination);
await writeFile(join(destination,'manifest.json'),JSON.stringify({created:new Date().toISOString(),copied,databases,hashes},null,2));
console.log(JSON.stringify({destination,files:Object.keys(hashes).length,databases:Object.keys(databases)}));
