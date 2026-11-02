"""One read-only attempt per public interface. Does not write a business/cache database."""
import sys, json, time, importlib.util
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("panorama_data", ROOT / "integrations/market-panorama-data.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
import akshare as ak
out = ROOT / "output/redesign-2026-10-25/data-probe"; out.mkdir(parents=True, exist_ok=True)
names = "futures_spot_price futures_spot_price_daily futures_spot_sys futures_rule futures_fees_info futures_comm_info futures_inventory_em futures_inventory_99 futures_contract_info_shfe futures_contract_info_ine futures_contract_info_dce futures_contract_info_czce futures_contract_info_gfex futures_contract_info_cffex get_roll_yield_bar get_roll_yield".split()
tests = [("contract_"+e, "futures_contract_info_"+e, {} if e in ("dce", "gfex") else {"date":"20261023"}) for e in ("shfe", "ine", "czce", "dce", "gfex", "cffex")]
tests += [("warrant_history","futures_inventory_em",{"symbol":"M"}), ("spot_price","futures_spot_price",{"date":"20261023","vars_list":["CU","MA"]}), ("spot_sys","futures_spot_sys",{"symbol":"铜","indicator":"市场价格"}), ("roll_yield","get_roll_yield_bar",{"type_method":"var","var":"RB","date":"20261023"}), ("futures_rule","futures_rule",{"date":"20261023"}), ("inventory_99","futures_inventory_99",{"symbol":"豆一"})]
def run(test):
    key,name,args=test; start=time.monotonic()
    try:
        data=mod.ak_call(name,args,timeout=45)
        valid=isinstance(data,list) and len(data)>0
        result={"key":key,"interface":name,"args":args,"status":"ok" if valid else "empty","rows":len(data) if isinstance(data,list) else None,"columns":list(data[0]) if valid and isinstance(data[0],dict) else [],"data":data,"checkedAt":mod.now()}
    except Exception as e: result={"key":key,"interface":name,"args":args,"status":"unavailable","reason":type(e).__name__+": "+str(e)[:250],"checkedAt":mod.now()}
    result["seconds"]=round(time.monotonic()-start,2)
    (out/(key+".json")).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in result.items() if k!="data"},ensure_ascii=False),flush=True)
    return {k:v for k,v in result.items() if k!="data"}
results=[]
with ThreadPoolExecutor(max_workers=3) as pool:
    for f in as_completed([pool.submit(run,t) for t in tests]): results.append(f.result())
(out/"summary.json").write_text(json.dumps({"version":ak.__version__,"attributes":{n:hasattr(ak,n) for n in names},"targetDay":"2026-10-23","results":results},ensure_ascii=False,indent=2),encoding="utf-8")
