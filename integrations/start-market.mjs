import {spawn} from 'node:child_process';
const defaultPython=process.platform==='win32'?'.venv-data\\Scripts\\python.exe':'.venv-data/bin/python';
const child=spawn(process.env.TQ_PYTHON||defaultPython,['integrations/tq_market.py'],{stdio:'inherit',env:process.env});
child.on('error',()=>{console.error('无法启动Python行情进程，请先安装独立环境和TqSdk');process.exitCode=1});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));
child.on('exit',code=>{process.exitCode=code||0});
