"""Create a source-only checkpoint; never include runtime records or credentials."""
import tarfile, datetime
from pathlib import Path
root = Path(__file__).resolve().parent.parent
entries = ['integrations', 'dist', 'data', 'research-skills', 'tests', 'docs', 'desktop', 'scripts', 'vendor', 'server.mjs', 'finance.mjs', 'package.json', 'package-lock.json', 'README.md', '.gitignore']
entries += [p.name for p in root.glob('*.command')]
out = root / '.runtime/checkpoints' / (datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '-source.tar.gz')
out.parent.mkdir(parents=True, exist_ok=True)
def allowed(info):
    parts = Path(info.name).parts
    if info.issym() or info.islnk() or any(p.startswith('.env') or p in ('__pycache__', 'node_modules', '.runtime', '.git') for p in parts):
        return None
    return info
with tarfile.open(out, 'w:gz') as archive:
    for name in entries:
        if (root / name).exists():
            archive.add(root / name, arcname=name, filter=allowed)
out.chmod(0o600)
print(out)
