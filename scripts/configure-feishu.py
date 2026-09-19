"""Local credential setup. No credentials printed or committed."""
from getpass import getpass
from pathlib import Path
import os, re, tempfile
root=Path(__file__).resolve().parent.parent
print('飞书企业自建机器人。留空取消，不修改现有配置。')
app_id=input('App ID: ').strip()
secret=getpass('App Secret（隐藏）: ').strip()
users=input('允许使用的本人 Open ID（ou_ 开头，多个用逗号）: ').strip()
kind=input('推送目标类型 open_id 或 chat_id [open_id]: ').strip() or 'open_id'
target=input('推送目标 ID（私聊填本人 Open ID）: ').strip()
if not all([app_id,secret,users,target]): raise SystemExit('已取消，未写入。')
if not re.fullmatch(r'cli_[0-9a-fA-F]{16}',app_id) or not re.fullmatch(r'[A-Za-z0-9_-]+',secret): raise SystemExit('应用配置格式不正确，未写入。')
user_list=[s.strip() for s in users.split(',')]
if not all(re.fullmatch(r'ou_[A-Za-z0-9_-]+',u) for u in user_list): raise SystemExit('用户Open ID格式不正确。')
if kind not in ('open_id','chat_id'): raise SystemExit('无效目标类型。')
if kind=='open_id' and target not in user_list: raise SystemExit('私聊目标必须在本人授权列表中。')
if kind=='chat_id' and not re.fullmatch(r'oc_[A-Za-z0-9_-]+',target): raise SystemExit('群ID格式不正确。')
bot=input('群聊需填机器人 Open ID；仅私聊可留空: ').strip() if kind=='chat_id' else ''
if kind=='chat_id' and not re.fullmatch(r'ou_[A-Za-z0-9_-]+',bot): raise SystemExit('群聊需要有效的机器人Open ID。')
values={'FEISHU_APP_ID':app_id,'FEISHU_APP_SECRET':secret,'FEISHU_ALLOWED_OPEN_IDS':','.join(user_list),'FEISHU_ALLOWED_CHAT_IDS':target if kind=='chat_id' else '', 'FEISHU_BOT_OPEN_ID':bot,'FEISHU_RECEIVE_ID':target,'FEISHU_RECEIVE_ID_TYPE':kind}
path=root/'.env';lines=path.read_text().splitlines() if path.exists() else []
lines=[line for line in lines if not any(re.match(r'^\s*(?:export\s+)?'+k+r'\s*=',line) for k in values)]
lines += [k+'='+v for k,v in values.items()]
fd,temp=tempfile.mkstemp(prefix='.env.feishu-',dir=root)
try:
    with os.fdopen(fd,'w') as f: f.write('\n'.join(lines)+'\n')
    os.replace(temp,path);path.chmod(0o600)
finally:
    if os.path.exists(temp): os.unlink(temp)
print('配置已保存在本机。重新打开工作台，在“数据来源→飞书”预览报告、设置时间并启用推送。')
