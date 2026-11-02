import sys,json,math,sqlite3
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'integrations'))
import dce_public as d
DAY='2026-10-23';STAMP='2026-10-25T13:00:00+08:00'

def instrument(symbol='m2701',**kwargs):return {'ExchangeID':'DCE','ProductClass':'1','InstrumentID':symbol,'OpenDate':'20260119','ExpireDate':'20270115','DeliveryDate':'20270120',**kwargs}
def row(symbol='M2701',close=100,oi=100):return {'symbol':symbol,'date':DAY,'close':close,'volume':10,'open_interest':oi}

def test_contracts_keep_explicit_dates_query_batch_and_delivery_semantics():
    r=d.normalize_instruments([instrument(),instrument('M2701-C-3000'),instrument('m2701F'),instrument('m2713'),instrument('m2705',OpenDate='20261026'),instrument('m2610',ExpireDate='20261022'),instrument('m2707',ExpireDate='20270230')],DAY,STAMP,{'M'})
    assert len(r)==1;c=r[0];assert c['listed']=='2026-01-19';assert c['lastTrade']=='2027-01-15';assert c['delivery']=='2027-01-20';assert c['lastDelivery'] is None;assert c['dataDate']=='2026-10-25';assert '资料发布日期' in c['dateBasis']

def test_daily_uses_exact_completed_date_close_not_settlement_or_future_quote():
    rows=[{'d':DAY,'c':'3276','s':'3272','v':'865874','p':'2225768'},{'d':'2026-10-26','c':'3280','v':1,'p':2}]
    r=d.normalize_daily(rows,'M2701',DAY);assert r['close']==3276;assert r['open_interest']==2225768;assert r['date']==DAY

def test_daily_rejects_absent_duplicate_missing_and_nonfinite_fields():
    valid={'d':DAY,'c':100,'v':0,'p':0}
    assert d.normalize_daily([valid],'M2701',DAY)['volume']==0
    for rows in [[],[valid,valid],[{**valid,'c':None}],[{**valid,'p':math.nan}],[{**valid,'v':-1}]]:
        with pytest.raises(ValueError):d.normalize_daily(rows,'M2701',DAY)

def test_incomplete_contract_set_blocks_product_ranking_without_discarding_other_product(monkeypatch):
    monkeypatch.setattr(d,'instruments',lambda *args:[{'contract':s,'code':s[:1]} for s in ['M2701','M2705','I2701','I2705']])
    def daily(symbol,day):
        if symbol=='M2705':raise ValueError('目标日K缺失')
        return row(symbol)
    monkeypatch.setattr(d,'daily',daily);r=d.collect(DAY,['M','I']);assert r['incompleteProducts']==['M'];assert len(r['daily'])==2;assert all(v['symbol'].startswith('I') for v in r['daily'])

def test_official_failure_uses_public_fallback_and_restores_request_wrapper(monkeypatch):
    import akshare as ak,requests
    from market_panorama_extras import fetch_exchange_daily
    original=requests.sessions.Session.request
    def failed(**kwargs):raise ValueError('DCE HTTP 412')
    monkeypatch.setattr(ak,'get_dce_daily',failed);monkeypatch.setattr(d,'collect',lambda day:{'daily':[row()],'source':'新浪备用'})
    r=fetch_exchange_daily('DCE',DAY);assert '412' in r['officialError'];assert r['source']=='新浪备用';assert requests.sessions.Session.request is original

def test_supplement_caches_public_dates_and_source_without_changing_rules():
    from market_panorama_extras import collect_extras
    db=sqlite3.connect(':memory:');db.execute('CREATE TABLE records(kind TEXT,key TEXT,day TEXT,body TEXT,source TEXT,PRIMARY KEY(kind,key,day))')
    def save(db,kind,key,day,body,source):db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)',(kind,key,day,json.dumps(body),source))
    info=d.normalize_instruments([instrument()],DAY,STAMP)
    bundle={'daily':[row('M2701',110,900),row('M2705',100,800)],'contracts':info,'source':d.SOURCE,'sourceUrl':d.DAILY_URL,'instrumentSourceUrl':d.INSTRUMENT_URL,'checkedAt':STAMP,'coverage':'当前在市清单，非历史全覆盖','officialError':'HTTP 412','incompleteProducts':['BB'],'errors':[{'code':'BB','contract':'BB2705'}]}
    def call(name,args,timeout):return bundle if args['exchange']=='DCE' else []
    collect_extras(db,[{'code':'M','exchange':'DCE'},{'code':'BB','exchange':'DCE'}],DAY,call,save,lambda:STAMP,{'roll_yield'})
    r=db.execute("SELECT body,source FROM records WHERE kind='roll-yield' AND key='M'").fetchone();assert '新浪财经' in r[1];assert json.loads(r[0])['coverage'].startswith('当前')
    assert json.loads(db.execute("SELECT body FROM records WHERE key='roll-product:BB'").fetchone()[0])['status']=='empty'
    assert json.loads(db.execute("SELECT body FROM records WHERE kind='contract-info'").fetchone()[0])['lastDelivery'] is None
