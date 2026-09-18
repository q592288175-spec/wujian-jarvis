#!/bin/zsh
cd "${0:A:h}"
python3 - <<'PYCONFIG'
from pathlib import Path
from getpass import getpass
import os
print('仅配置 OpenAI 官方 API，Key 隐藏输入，仅存于本机 .env。')
key=getpass('OpenAI API Key（留空取消）：').strip()
if not key: raise SystemExit('已取消，未写入。')
if any(c.isspace() for c in key): raise SystemExit('Key 含空白，未写入。')
p=Path('.env')
lines=p.read_text().splitlines() if p.exists() else Path('.env.example').read_text().splitlines()
lines=[x for x in lines if not x.startswith('OPENAI_API_KEY=')]
lines.append('OPENAI_API_KEY='+key)
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:f.write('\n'.join(lines)+'\n')
p.chmod(0o600)
print('已保存。重启工作台服务后，在页面选择 AI 实时通话。尚未测试账户权限。')
PYCONFIG
read '?按回车关闭…'
