import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const [phase,...words]=process.argv.slice(2),note=words.join(' ');if(!phase||!note)throw Error('需要阶段和实际结果');
const time=new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false});
const log=resolve('../../01_10月决定记录.md');const current=await readFile(log,'utf8');
await writeFile(log,current.trimEnd()+`\n\n- ${time}（北京时间）｜Windows・OpenAI Codex｜小木v2整改阶段${phase}｜${note}\n`);
await mkdir('output/redesign-2026-10-25',{recursive:true});
const ledger=resolve('output/redesign-2026-10-25/stages.json');let stages=[];try{stages=JSON.parse(await readFile(ledger,'utf8'))}catch{}
stages.push({phase,time,note});await writeFile(ledger,JSON.stringify(stages,null,2));console.log('已记录阶段'+phase);
