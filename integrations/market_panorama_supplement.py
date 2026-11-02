"""Public, display-only contract/spot evidence stored in the existing panorama cache."""
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

def date_text(value):
    s=str(value or ""); m=re.search(r"(20\d\d)[-/]?(\d\d)[-/]?(\d\d)",s)
    return "-".join(m.groups()) if m else None

def contract_code(value,day):
    s=str(value or "").upper().strip(); m=re.fullmatch(r"([A-Z]+)(\d{3,4})",s)
    if not m:return None
    code,num=m.groups()
    if len(num)==3:
        year=int(day[:4])//10*10+int(num[0])
        if year<int(day[:4])-1:year+=10
        num=str(year)[2:]+num[1:]
    return code+num

def normalize_contracts(rows,exchange,day):
    result=[]
    for r in rows:
        contract=contract_code(r.get("合约代码"),day)
        if not contract:continue  # options and spread contracts are outside this view
        last=date_text(r.get("到期日") or r.get("最后交易日") or next((v for k,v in r.items() if k.startswith("最后交易日")),None))
        listed=date_text(r.get("上市日") or r.get("开始交易日") or r.get("第一交易日"))
        query_day=date_text(r.get("交易日") or r.get("查询交易日"))
        if not last or last<day or listed and listed>day or query_day and query_day!=day:continue
        result.append({"contract":contract,"rawContract":r.get("合约代码"),"exchange":exchange,"listed":listed,"lastTrade":last,"firstDelivery":date_text(r.get("开始交割日")),"lastDelivery":date_text(r.get("最后交割日")),"dataDate":query_day or day,"dateBasis":"接口交易日" if query_day else "查询批次日；接口未给出资料发布日期","basis":"交易所公开合约信息；交割权限与账户限制另行核对"})
    return result

def normalize_basis(rows,day):
    result=[]
    for r in rows:
        stamp=date_text(r.get("date"));code=str(r.get("symbol") or "").upper()
        if stamp!=day or not code:continue
        spot=r.get("spot_price");future=r.get("dominant_contract_price");contract=contract_code(r.get("dominant_contract"),day)
        if not contract or not isinstance(spot,(int,float)) or not isinstance(future,(int,float)) or spot<=0 or future<=0:continue
        result.append({"code":code,"dataDate":stamp,"spot":spot,"future":future,"contract":contract,"rawContract":r.get("dominant_contract"),"basis":round(spot-future,8),"sourceBasis":r.get("dom_basis"),"unit":"元/吨" if code in ("CU","MA") else "源单位待核验","basisDefinition":"本页基差=现货−供应商主力期货；源dom_basis为期货−现货，符号相反"})
    return result

def store_result(db,key,rows,day,save,checked_at):
    if key=='contract_dce_public':
        items=rows
        for r in items:save(db,'contract-info',r['contract'],day,r,'OpenCTP公开合约字典（大商所备用，非交易所直连）')
    elif key.startswith("contract_"):
        exchange=key.split("_")[1].upper();items=normalize_contracts(rows,exchange,day)
        for r in items:save(db,"contract-info",r["contract"],day,{**r,"checkedAt":checked_at},exchange+"交易所公开合约信息 / AKShare")
    elif key=="spot_price":
        items=normalize_basis(rows,day)
        for r in items:save(db,"basis",r["code"],day,{**r,"checkedAt":checked_at},"生意社现货及供应商主力期货 / AKShare")
    else:items=[]
    return len(items)

def supplement(db,catalog,day,ak_call,save,now):
    config=json.loads((ROOT/"data/panorama-sources.json").read_text("utf-8")); count=0; failures=[]
    from market_panorama_extras import collect_extras
    extra=collect_extras(db,catalog,day,ak_call,save,now,{s['key'] for s in config['sources'] if s.get('enabled')})
    count+=extra['rows'];failures.extend(extra['failures'])
    for s in config["sources"]:
        key=s["key"]
        if not s.get("enabled") or key in ('warrant_history','roll_yield'):continue
        cached=db.execute("SELECT body FROM records WHERE kind='supplement-status' AND key=? AND day=?",(key,day)).fetchone()
        if cached and json.loads(cached[0]).get("checkedAt","")[:10]==now()[:10]:continue
        args={"date":day.replace("-","")} if key.startswith("contract_") and key!="contract_gfex" else {}
        if key=="spot_price":args={"date":day.replace("-",""),"vars_list":[p["code"] for p in catalog if p["exchange"]!="CFFEX"]}
        if key=='contract_dce_public':args={'day':day,'checked_at':now(),'allowed_codes':[p['code'] for p in catalog if p['exchange']=='DCE']}
        checked_at=now()
        try:
            rows=ak_call(s["interface"],args,timeout=40);n=store_result(db,key,rows,day,save,checked_at)
            status={"status":"ok" if n else "empty","rows":n,"checkedAt":checked_at,"reason":"" if n else "无当日有效合约或现货记录"};count+=n
            if key=='contract_dce_public':status.update(recordDay=checked_at[:10],reason='公开备用字典，查询批次日；源未给资料发布日期，不采用其账户费率或保证金')
        except Exception as e:status={"status":"unavailable","rows":0,"checkedAt":checked_at,"reason":str(e)[:180]}
        if status["status"]!="ok":failures.append({"product":key,"day":day,"error":status["reason"]})
        save(db,"supplement-status",key,day,status,s["source"])
    db.commit();return {"rows":count,"failures":failures}
