"""Configure the official OpenAI API locally; never print the credential."""
from pathlib import Path
from getpass import getpass
import re, os
root = Path(__file__).resolve().parent.parent
path = root / '.env'
value = getpass('OpenAI 项目 API Key（隐藏输入，留空取消）: ').strip()
if not value:
    raise SystemExit('已取消，未修改配置。')
if not re.fullmatch(r'[A-Za-z0-9_-]+', value):
    raise SystemExit('密钥格式无效，未修改配置。')
content = path.read_text() if path.exists() else ''
lines = [line for line in content.splitlines() if not re.match(r'^\s*(?:export\s+)?OPENAI_API_KEY\s*=', line)]
lines.append('OPENAI_API_KEY=' + value)
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as out:
    out.write('\n'.join(lines) + '\n')
path.chmod(0o600)
print('已在本机保存。退出并重新打开工作台后，点击 GPT-Live 全双工进行验收。')
