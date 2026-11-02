import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'integrations'))
from market_panorama_extras import normalize_warrants,calculate_rolls,public_json
DAY='2026-10-23'
def bar(symbol,close,oi,volume=10,day=DAY):return {'symbol':symbol,'close':close,'open_interest':oi,'volume':volume,'date':day}
def test_receipts_case_missing_future_zero_and_foreign_product():
    rows=[{'SECURITY_CODE':'m','TRADE_DATE':DAY,'ON_WARRANT_NUM':0,'ADDCHANGE':None},{'SECURITY_CODE':'CU','TRADE_DATE':DAY,'ON_WARRANT_NUM':900},{'SECURITY_CODE':'M','TRADE_DATE':'2026-10-24','ON_WARRANT_NUM':800},{'SECURITY_CODE':'M','TRADE_DATE':'2026-10-22','ON_WARRANT_NUM':None}]
    r=normalize_warrants(rows,'M',DAY);assert r['samples']==1;assert r['history'][0]['receipts']==0;assert r['history'][0]['change'] is None;assert '未标注' in r['unit']
def test_receipts_stale_is_not_relabelled_today():
    r=normalize_warrants([{'日期':'2026-10-20','库存':123,'增减':-4}],'MA',DAY);assert r['dataDate']=='2026-10-20'
def test_roll_contract_months_sign_and_equal_dates():
    rows=[bar('CU2611',110,900),bar('CU2701',100,800),bar('CU2612',120,10)]
    result,gaps=calculate_rolls(rows,'SHFE',DAY);r=result[0];assert r['monthGap']==2;assert math.isclose(r['rate'],math.log(1.1)*6);assert r['near']['contract']=='CU2611';assert r['far']['contract']=='CU2701';assert not gaps
def test_roll_contango_and_three_digit_alias_cross_year():
    rows=[bar('MA701',110,900),bar('MA611',100,800)]
    r=calculate_rolls(rows,'CZCE',DAY)[0][0];assert r['near']['contract']=='MA2611';assert r['far']['contract']=='MA2701';assert r['rate']<0
def test_roll_does_not_fill_missing_quotes_or_choose_third_contract():
    for bad in [None,0,-1]:
        result,gaps=calculate_rolls([bar('CU2611',bad,900),bar('CU2612',100,800),bar('CU2701',101,10)],'SHFE',DAY);assert not result;assert gaps
    assert not calculate_rolls([bar('CU2611',100,900,0),bar('CU2612',110,800)],'SHFE',DAY)[0]
def test_roll_excludes_wrong_day_tas_and_zero_open_interest():
    rows=[bar('CU2611TAS',130,9999),bar('CU2610',100,9999,day='2026-10-22'),bar('CU2611',120,0),bar('CU2612',100,900),bar('CU2701',110,800)]
    r=calculate_rolls(rows,'SHFE',DAY)[0][0];assert r['near']['contract']=='CU2612';assert r['far']['contract']=='CU2701'

def test_shared_shfe_feed_does_not_double_count_ine_products():
    rows=[bar('CU2611',110,900),bar('CU2612',100,800),bar('SC2611',710,900),bar('SC2612',700,800)]
    result,_=calculate_rolls(rows,'SHFE',DAY,{'CU'})
    assert [r['code'] for r in result]==['CU']
    result,_=calculate_rolls(rows,'INE',DAY,{'SC'})
    assert [r['code'] for r in result]==['SC']
def test_http_failure_retains_actual_status():
    class R:status_code=412;headers={'Content-Type':'text/html'}
    import pytest
    with pytest.raises(ValueError,match='HTTP 412'):public_json(R(),'大商所')
def test_one_exchange_failure_keeps_other_results_and_new_adapter_does_not_reuse_old_failure():
    import sqlite3,json
    from market_panorama_extras import collect_extras,ROLL_ADAPTER_VERSION
    db=sqlite3.connect(':memory:');db.execute('CREATE TABLE records(kind TEXT,key TEXT,day TEXT,body TEXT,source TEXT,PRIMARY KEY(kind,key,day))')
    def save(db,kind,key,day,body,source):db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)',(kind,key,day,json.dumps(body),source))
    stamp='2026-10-25T08:00:00+08:00'
    save(db,'supplement-status','roll_yield',DAY,{'status':'unavailable','checkedAt':stamp},'旧适配器失败')
    calls=[]
    def call(name,args,timeout):
        calls.append(args['exchange'])
        if args['exchange']=='DCE':raise ValueError('DCE HTTP 412')
        return [bar('CU2611',110,900),bar('CU2612',100,800)] if args['exchange']=='SHFE' else []
    result=collect_extras(db,[],DAY,call,save,lambda:stamp,{'roll_yield'});assert result['rows']==1;assert len(calls)==6
    assert db.execute("SELECT count(*) FROM records WHERE kind='roll-yield'").fetchone()[0]==1
    status=json.loads(db.execute("SELECT body FROM records WHERE key='roll_yield'").fetchone()[0]);assert status['status']=='partial';assert status['adapterVersion']==ROLL_ADAPTER_VERSION
    collect_extras(db,[],DAY,call,save,lambda:stamp,{'roll_yield'});assert len(calls)==6
