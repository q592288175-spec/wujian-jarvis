import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location("supplement",Path(__file__).resolve().parents[1]/"integrations/market_panorama_supplement.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def test_normalization_excludes_options_expired_and_future_listings():
    rows=[{"合约代码":"MA701","第一交易日":"2026-01-01","最后交易日待国家公布2025年节假日安排后进行调整":"2027-01-15"},{"合约代码":"IO2611-C-4000","最后交易日":"2026-11-20"},{"合约代码":"CU2601","到期日":"2026-01-15"},{"合约代码":"CU2801","上市日":"2027-01-01","到期日":"2028-01-15"}]
    r=m.normalize_contracts(rows,"CZCE","2026-10-23");assert len(r)==1;assert r[0]["contract"]=="MA2701";assert r[0]["lastTrade"]=="2027-01-15"
def test_basis_sign_and_specific_source_contract_are_explicit():
    row={"date":"20261023","symbol":"MA","spot_price":4000,"dominant_contract_price":3200,"dominant_contract":"MA701","dom_basis":-800}
    r=m.normalize_basis([row],"2026-10-23")[0];assert r["basis"]==800;assert r["sourceBasis"]==-800;assert r["contract"]=="MA2701"
    assert m.normalize_basis([row],"2026-10-24")==[]
def test_wrong_query_day_is_not_fresh_contract_information():
    assert m.normalize_contracts([{"合约代码":"CU2611","到期日":"2026-11-15","交易日":"2026-10-22"}],"SHFE","2026-10-23")==[]
