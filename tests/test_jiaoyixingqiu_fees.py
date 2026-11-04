import importlib.util
import json
from pathlib import Path
import sqlite3
import pytest

spec = importlib.util.spec_from_file_location('jy_fees', Path(__file__).parents[1]/'integrations/jiaoyixingqiu_fees.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
NOW = '2026-11-04T12:00:00+08:00'


def page(rule='万分之0.5<br>(2.39元)', contract='fu2701', exchange='SHFE'):
    cells = ['燃料油2701',contract,'4774','889827','20%','20%','9548',rule,'3元','万分之0<br>(0.00元)','2.39','10','7.6','主力']
    return '<p>同步更新 :2026-11-03 22:59:49，价格更新:2026-11-04 11:31:53</p><table id="heyuetbl"><tr><td class="jysname"><a href="/jiaoyisuo/'+exchange+'">交易所</a></td></tr><tr id="tr_'+contract+'">'+''.join('<td>'+v+'</td>' for v in cells)+'</tr></table>'


def test_fixed_ratio_free_and_unknown_rules_are_distinct():
    assert m.fee_rule('3元') == {'元':3.0,'万分之':None}
    assert m.fee_rule('万分之0 (0.00元)') == {'元':None,'万分之':0.0}
    assert m.fee_rule('万分之0.5 (2.39元)')['万分之'] == .5
    assert m.fee_rule('未知')['元'] is None
    assert m.fee_rule('未知')['万分之'] is None


def test_public_table_keeps_real_rate_and_price_dates_and_original_rule():
    rows, status = m.parse_table(page(), NOW)
    row = rows[0]
    assert row['合约代码'] == 'FU2701'
    assert row['手续费更新时间'] == '2026-11-03 22:59:49'
    assert row['价格更新时间'] == '2026-11-04 11:31:53'
    assert row['采集时间'] == NOW
    assert row['手续费标准-开仓-万分之'] == .5
    assert row['手续费标准-平昨-元'] == 3
    assert row['手续费标准-平今-万分之'] == 0
    assert '万分之0.5' in row['开仓收费原文']
    assert status['feeUpdatedAt'] != status['checkedAt']


def test_czce_normalization_and_future_options_exclusion():
    rows, _ = m.parse_table(page(contract='MA701',exchange='CZCE'), NOW)
    assert rows[0]['合约代码'] == 'MA2701'
    assert rows[0]['来源合约代码'] == 'MA701'
    for code in ['v2701F','m2701-C-3000','MA713']:
        with pytest.raises(ValueError): m.parse_table(page(contract=code), NOW)


def test_missing_table_rate_date_or_unknown_fee_must_fail():
    for html in ['验证页面',page().replace('同步更新 :','没有时间 '),page(rule='未知')]:
        with pytest.raises(ValueError): m.parse_table(html,NOW)
    with pytest.raises(ValueError): m.parse_table(page().replace('2026-11-03','2027-11-03'),NOW)


def test_failed_refresh_retains_last_successful_fee_and_records_failure():
    db=sqlite3.connect(':memory:')
    db.execute('CREATE TABLE records(kind TEXT,key TEXT,day TEXT,body TEXT,source TEXT,PRIMARY KEY(kind,key,day))')
    def save(db,kind,key,day,body,source):
        db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)',(kind,key,day,json.dumps(body),source))
    success=m.collect_fees(db,save,lambda:NOW,fetch=lambda:page())
    assert success['status']=='ok'
    original=db.execute("SELECT body FROM records WHERE kind='fee-jiaoyixingqiu'").fetchone()[0]
    with pytest.raises(ValueError):m.collect_fees(db,save,lambda:NOW,fetch=lambda:'验证页面')
    assert db.execute("SELECT body FROM records WHERE kind='fee-jiaoyixingqiu'").fetchone()[0]==original
    status=json.loads(db.execute("SELECT body FROM records WHERE kind='fee-source'").fetchone()[0])
    assert status['status']=='failed' and status['retainedPrevious']
