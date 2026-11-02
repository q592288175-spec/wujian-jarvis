import os,json,time
from pathlib import Path
root=Path.cwd();rt=root/'.runtime';out=root/'output/redesign-2026-10-25/baseline/runtime-sizes.json'
def size(folder):
 total=files=0;stack=[folder]
 while stack:
  p=stack.pop()
  try:
   with os.scandir(p) as entries:
    for e in entries:
     try:
      if e.is_symlink():continue
      if e.is_dir(follow_symlinks=False):stack.append(e.path)
      elif e.is_file(follow_symlinks=False):total+=e.stat(follow_symlinks=False).st_size;files+=1
     except OSError:pass
  except OSError:pass
 return total,files
rows=[]
for p in rt.iterdir():
 if p.is_dir() and not p.is_symlink():
  total,files=size(p);rows.append({'name':p.name,'bytes':total,'files':files,'modified':p.stat().st_mtime})
out.write_text(json.dumps(sorted(rows,key=lambda r:-r['bytes']),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'directories':len(rows),'logicalGiB':round(sum(r['bytes'] for r in rows)/2**30,2),'desktopBuilds':[{'name':r['name'],'MiB':round(r['bytes']/2**20,1)} for r in rows if r['name'].startswith('desktop-') and (rt/r['name']).joinpath('小木-win32-x64').exists()]},ensure_ascii=False))
