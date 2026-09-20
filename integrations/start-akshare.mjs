import {spawn} from 'node:child_process';
const child=spawn('.venv-akshare/bin/python',['-m','futures_data','serve'],{stdio:'inherit',env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:process.env.LANG||'zh_CN.UTF-8',PYTHONUNBUFFERED:'1'}});
child.on('error',()=>{console.error('AKShare环境不可用，请安装requirements.akshare.txt');process.exitCode=1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code||0});
