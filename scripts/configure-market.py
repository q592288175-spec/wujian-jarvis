"""Interactive local setup. Never prints credentials or transmits them."""
from pathlib import Path
from getpass import getpass
import os,json
root=Path(__file__).resolve().parent.parent
print('注册网址：https://account.shinnytech.com/ （免费注册）')
print('请使用快期/天勤服务账号，不是期货实盘账号。输入内容仅保存在本机 .env。')
user=getpass('快期手机号/邮箱/用户名（隐藏输入）：').strip()
password=getpass('快期密码（隐藏输入）：')
if not user or not password: raise SystemExit('未保存：账号和密码不能为空')
if any(c in user+password for c in '\r\n\x00'): raise SystemExit('输入含非法字符，未保存')
p=root/'.env'
lines=p.read_text().splitlines() if p.exists() else []
lines=[l for l in lines if not l.startswith(('TQ_USER=','TQ_PASSWORD='))]
# Node dotenv supports quoted values. Reject quote characters to avoid ambiguous parsing.
if '"' in user+password or '\\' in user+password: raise SystemExit('当前向导不支持双引号或反斜杠，请在本机编辑 .env 并核对转义')
lines += ['TQ_USER='+json.dumps(user,ensure_ascii=False),'TQ_PASSWORD='+json.dumps(password,ensure_ascii=False)]
temp=p.with_suffix('.env.tmp')
fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:f.write('\n'.join(lines)+'\n')
os.chmod(temp,0o600);temp.replace(p)
print('已保存。运行 npm run market 启动行情进程；不要把 .env 发给别人。')
