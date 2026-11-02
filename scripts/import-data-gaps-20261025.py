"""Import only verified supplementary records; keep all trading/price/seat data intact."""
import sys,json,sqlite3,hashlib,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'output/data-gaps-2026-10-25'
fixture=Path(json.loads((ROOT/'output/redesign-2026-10-25/fixture.json').read_text('utf-8'))['root']).resolve()
if not fixture.is_relative_to(ROOT):raise ValueError('测试路径越界')
source=sqlite3.connect(f'file:{fixture.as_posix()}/panorama/market.sqlite?mode=ro',uri=True)
rows=source.execute("SELECT * FROM records WHERE day='2026-10-23' AND (kind IN ('warrant-history','roll-yield') OR (kind='supplement-status' AND (key IN ('warrant_history','roll_yield') OR key LIKE 'warrant:%' OR key LIKE 'roll:%' OR key LIKE 'roll-product:%'))) ").fetchall();source.close()
catalog=json.loads((fixture/'panorama/catalog.json').read_text('utf-8'));exchanges={p['code']:p['exchange'] for p in catalog}
states={key:json.loads(body) for kind,key,day,body,provider,updated in rows if kind=='supplement-status'}
assert all(states[k].get('adapterVersion')=='2026-10-25-gaps-v3' for k in ['warrant_history','roll_yield'])
stats={'commodityProducts':len([p for p in catalog if p['exchange']!='CFFEX']),'warehouseFetchedProducts':states['warrant_history']['products'],'warehouseFetchedRows':states['warrant_history']['rows'],'warehouseProducts':0,'warehouseRows':0,'fresh':0,'stale':[],'empty':[],'rollProducts':0,'rollExchanges':{}}
for kind,key,day,body,provider,updated in rows:
    r=json.loads(body)
    if kind=='warrant-history':
        assert r['dataDate']<=day and all(h['date']<=day and h['receipts']>=0 for h in r['history'])
        stats['warehouseProducts']+=1;stats['warehouseRows']+=len(r['history']);stats['fresh']+=r['dataDate']==day
        if r['dataDate']<day:stats['stale'].append({'code':key,'date':r['dataDate']})
    if kind=='roll-yield':
        assert r['exchange']==exchanges[key],f'{key}交易所归属不一致'
        assert r['dataDate']==day and abs(r['rate']-math.log(r['near']['close']/r['far']['close'])*12/r['monthGap'])<1e-10
        stats['rollProducts']+=1;stats['rollExchanges'][r['exchange']]=stats['rollExchanges'].get(r['exchange'],0)+1
    if kind=='supplement-status' and key.startswith('warrant:') and r['status'] in ('empty','unavailable'):stats['empty'].append({'code':key[8:],'reason':r['reason']})
if '--import' not in sys.argv:
    (OUT/'coverage.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(stats,ensure_ascii=False));sys.exit(0)
target=ROOT/'.runtime/market-panorama/market.sqlite';backup=ROOT/'.runtime/ui-history/2026-10-25-data-gaps-before/market-panorama/market.sqlite';backup.parent.mkdir(parents=True,exist_ok=True)
db=sqlite3.connect(target);db.execute('PRAGMA busy_timeout=10000')
if not backup.exists():
    b=sqlite3.connect(backup);db.backup(b);b.close()
def unchanged_evidence(d):
    old=d.execute("SELECT * FROM records WHERE kind NOT IN ('warrant-history','roll-yield','supplement-status') ORDER BY kind,key,day").fetchall()
    return {'records':hashlib.sha256(json.dumps(old,ensure_ascii=False).encode()).hexdigest(),'bars':d.execute('SELECT COUNT(*) FROM bars').fetchone()[0],'seats':d.execute('SELECT COUNT(*) FROM seats').fetchone()[0]}
db.execute('BEGIN IMMEDIATE');before=unchanged_evidence(db)
db.executemany('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?)',rows);after=unchanged_evidence(db);assert before==after;db.commit();db.close()
(OUT/'production-import.json').write_text(json.dumps({'importedRecords':len(rows),'coverage':stats,'before':before,'after':after,'backup':str(backup),'businessDatabaseWritten':False},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'importedRecords':len(rows),**stats},ensure_ascii=False))
