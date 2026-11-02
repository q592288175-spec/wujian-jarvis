"""Import validated DCE display evidence only; never writes business or price/seat tables."""
import json,sqlite3,hashlib,math,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'output/dce-public-2026-10-25';DAY='2026-10-23'
fixture=Path(json.loads((ROOT/'output/redesign-2026-10-25/fixture.json').read_text('utf-8'))['root']).resolve()
assert fixture.is_relative_to(ROOT)
c=sqlite3.connect(f'file:{fixture.as_posix()}/panorama/market.sqlite?mode=ro',uri=True)
catalog=json.loads((fixture/'panorama/catalog.json').read_text('utf-8'));codes={p['code'] for p in catalog if p['exchange']=='DCE'}
selected=[]
for row in c.execute('SELECT * FROM records WHERE day=?',(DAY,)):
 kind,key,day,body,provider,updated=row;r=json.loads(body)
 if kind in ('contract-info','roll-yield') and r.get('exchange')=='DCE':
  assert (r.get('code') or re.match('[A-Z]+',key)[0]) in codes
  if kind=='contract-info':assert 'OpenCTP' in provider and r['listed']<=DAY<=r['lastTrade'] and r['lastDelivery'] is None
  else:assert '新浪' in provider and r['dataDate']==DAY and abs(r['rate']-math.log(r['near']['close']/r['far']['close'])*12/r['monthGap'])<1e-10
  selected.append(row)
 if kind=='supplement-status' and (key in ('contract_dce_public','roll:DCE','roll_yield') or key.startswith('roll-product:') and key[13:] in codes):selected.append(row)
c.close();assert any(r[0]=='roll-yield' for r in selected);assert any(r[0]=='contract-info' for r in selected)
keys={tuple(r[:3]) for r in selected}
def evidence(db):
 rows=[r for r in db.execute('SELECT * FROM records ORDER BY kind,key,day') if tuple(r[:3]) not in keys]
 return {'otherRecords':hashlib.sha256(json.dumps(rows,ensure_ascii=False).encode()).hexdigest(),'bars':db.execute('SELECT COUNT(*) FROM bars').fetchone()[0],'seats':db.execute('SELECT COUNT(*) FROM seats').fetchone()[0],'preferences':db.execute('SELECT * FROM preferences ORDER BY key').fetchall()}
db=sqlite3.connect(ROOT/'.runtime/market-panorama/market.sqlite');db.execute('PRAGMA busy_timeout=10000')
backup=ROOT/'.runtime/ui-history/2026-10-25-dce-public-before/market-panorama/market.sqlite';backup.parent.mkdir(parents=True,exist_ok=True)
if not backup.exists():
 b=sqlite3.connect(backup);db.backup(b);b.close()
db.execute('BEGIN IMMEDIATE');before=evidence(db);db.executemany('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?)',selected);after=evidence(db);assert before==after;db.commit();db.close()
stats={'contracts':sum(r[0]=='contract-info' for r in selected),'rollProducts':sum(r[0]=='roll-yield' for r in selected),'rows':len(selected),'before':before,'after':after,'backup':str(backup),'businessDatabaseWritten':False}
(OUT/'production-import.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in stats.items() if k not in ['before','after']},ensure_ascii=False))
