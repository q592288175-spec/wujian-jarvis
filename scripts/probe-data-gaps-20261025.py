"""Bounded public-source diagnostics; never opens business/market databases."""
import sys, json, time, io, contextlib, subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'output/data-gaps-2026-10-25';OUT.mkdir(parents=True,exist_ok=True)
CASES={
 'warehouse_m':('futures_inventory_em',{'symbol':'m'}),
 'dce_contract':('futures_contract_info_dce',{}),
 **{e+'_daily':('get_'+e.lower()+'_daily',{'date':'20261023'}) for e in ['SHFE','INE','CZCE','GFEX','CFFEX','DCE']},
 'dce_contract_https':('request',{})
}
def worker(key):
 import requests
 log=[];original=requests.sessions.Session.request
 def request(self,method,url,**kwargs):
  kwargs.setdefault('timeout',9)
  r=original(self,method,url,**kwargs)
  log.append({'method':method,'url':str(r.url),'status':r.status_code,'type':r.headers.get('Content-Type'),'prefix':r.text[:250]})
  return r
 requests.sessions.Session.request=request
 start=time.monotonic()
 try:
  with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
   import akshare as ak
   name,args=CASES[key]
   if name=='request':
    r=requests.post('https://www.dce.com.cn/dcereport/publicweb/tradepara/contractInfo',json={'lang':'zh','tradeType':'1','varietyId':'all'});r.raise_for_status();data=r.json().get('data')
   else:
    frame=getattr(ak,name)(**args)
    data=json.loads(frame.to_json(orient='records',date_format='iso',force_ascii=False))
  value={'status':'ok' if data else 'empty','data':data,'rows':len(data) if isinstance(data,list) else None}
 except Exception as e:value={'status':'unavailable','reason':type(e).__name__+': '+str(e)[:220]}
 value.update(key=key,requests=log,seconds=round(time.monotonic()-start,2));print(json.dumps(value,ensure_ascii=False))
if len(sys.argv)>1:worker(sys.argv[1])
else:
 def run(key):
  try:
   p=subprocess.run([sys.executable,'-X','utf8',str(Path(__file__)),key],capture_output=True,text=True,encoding='utf-8',timeout=40)
   result=json.loads(p.stdout)
  except Exception as e:result={'key':key,'status':'unavailable','reason':str(e)[:220]}
  (OUT/(key+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({k:v for k,v in result.items() if k!='data'},ensure_ascii=False),flush=True);return{ k:v for k,v in result.items() if k!='data'}
 with ThreadPoolExecutor(max_workers=3) as pool:results=[f.result() for f in as_completed([pool.submit(run,k) for k in CASES])]
 (OUT/'probe-summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
