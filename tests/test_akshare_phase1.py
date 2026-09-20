from pathlib import Path
import pytest
from futures_data.compute.main_contract import select_main
from futures_data.compute.basis import calculate
from futures_data.storage.database import connect, save_quote, quotes, rolls, spots, upsert
from sqlalchemy import select,func

def test_main_excludes_continuous_and_missing_volume() -> None:
    rows=[{'symbol':'RB0','trade':10,'volume':99999,'position':99999},{'symbol':'RB2701','trade':10,'volume':100,'position':200},{'symbol':'RB2705','trade':10,'volume':200,'position':101}]
    assert select_main(rows,'rb')['symbol']=='RB2705'
    with pytest.raises(ValueError):select_main([{'symbol':'RB2701','trade':10}],'rb')

def test_basis_sign_denominator_and_date_guard() -> None:
    q={'product':'rb','quote_date':'2026-09-18','latest':100,'contract':'RB2701','source_time':'time','collected_at':'now'}
    s={'price':110,'date':'2026-09-18'}
    assert calculate(q,s)['basis']==10
    assert calculate(q,s)['basis_rate']==.1
    with pytest.raises(ValueError):calculate(q,{**s,'date':'2026-09-21'})

def test_roll_atomic_and_spot_upsert(tmp_path: Path) -> None:
    e=connect(tmp_path/'test.sqlite')
    row={'product':'rb','contract':'RB2701','collected_at':'a'}
    save_quote(e,row);save_quote(e,row);save_quote(e,{**row,'contract':'RB2705'})
    s={'product':'rb','date':'2026-09-18','source':'test','price':1}
    upsert(e,spots,s,['product','date','source']);upsert(e,spots,{**s,'price':2},['product','date','source'])
    with e.connect() as c:
        assert c.scalar(select(func.count()).select_from(rolls))==1
        assert c.scalar(select(func.count()).select_from(spots))==1
        assert c.scalar(select(spots.c.price))==2
    e.dispose()

def test_holdings_keep_separate_members_and_skip_total() -> None:
    from futures_data.collectors.holdings import normalize
    raw={'RB2701':[{'rank':1,'vol_party_name':'A','vol':'1,000','long_party_name':'B','long_open_interest':200,'short_party_name':'C','short_open_interest':300},{'rank':999,'vol_party_name':'合计','vol':9999}]}
    rows=normalize(raw,'20260918','test')
    assert [r['member'] for r in rows]==['A','B','C']
    assert rows[0]['value']==1000
    assert len(rows)==3

def test_config_covers_requested_universe_and_has_no_keys() -> None:
    from futures_data.settings import load
    c=load()
    assert len(c.products)==71
    assert c.products['cf']['inventory_symbol']=='CF'
    assert c.products['tl']['quote_interface']=='futures_zh_spot'
    assert c.values['poll_minutes']>=1
    assert not any('key' in k.lower() for k in c.values)
