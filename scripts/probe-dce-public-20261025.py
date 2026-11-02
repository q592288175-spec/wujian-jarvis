"""Bounded probes of documented public fallbacks. No database writes or credentials."""
import sys,json,time,subprocess,io,contextlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'output/dce-public-2026-10-25';OUT.mkdir(parents=True,exist_ok=True)
CASES={'openctp_http':('get','http://dict.openctp.cn/instruments',{'types':'futures','markets':'DCE'}),
       'openctp_https':('get','https://dict.openctp.cn/instruments',{'types':'futures','markets':'DCE'}),
       'sina_contract':('ak','futures_contract_detail',{'symbol':'M2701'}),
       'em_contract':('ak','futures_contract_detail_em',{'symbol':'m2701'}),
       'sina_list':('ak','futures_zh_realtime',{'symbol':'豆粕'}),
       'sina_daily':('ak','futures_zh_daily_sina',{'symbol':'M2701'}),
       'em_list':('get','https://futsse-static.eastmoney.com/redis',{'msgid':'gnweb'}),
       **{'em_'+symbol.lower()+'_daily':('get','https://push2his.eastmoney.com/api/qt/stock/kline/get',{'secid':'114.'+symbol.lower(),'klt':'101','fqt':'1','lmt':'2','end':'20261023','fields1':'f1,f2,f3,f4,f5,f6,f7,f8','fields2':'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64','forcect':'1'}) for symbol in ['M2701','BB2705']}}
def worker(key):
 import requests
 log=[];original=requests.sessions.Session.request
 def request(self,method,url,**kwargs):
  kwargs.setdefault('timeout',10);r=original(self,method,url,**kwargs);log.append({'url':r.url,'status':r.status_code,'type':r.headers.get('Content-Type'),'serverDate':r.headers.get('Date')});return r
 requests.sessions.Session.request=request;t=time.monotonic()
 try:
  mode,name,args=CASES[key]
  with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
   if mode=='ak':
    import akshare as ak
    frame=getattr(ak,name)(**args);data=json.loads(frame.to_json(orient='records',date_format='iso',force_ascii=False))
   else:
    r=requests.get(name,params=args);r.raise_for_status();data=r.json()
  result={'status':'ok','data':data}
 except Exception as e:result={'status':'unavailable','reason':type(e).__name__+': '+str(e)[:260]}
 result.update(requests=log,seconds=round(time.monotonic()-t,2));print(json.dumps(result,ensure_ascii=False,allow_nan=False))
if len(sys.argv)>1:worker(sys.argv[1])
else:
 def run(key):
  try:
   p=subprocess.run([sys.executable,'-X','utf8',str(Path(__file__)),key],capture_output=True,text=True,encoding='utf-8',timeout=35);r=json.loads(p.stdout)
  except Exception as e:r={'status':'unavailable','reason':str(e)[:260]}
  (OUT/(key+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({'key':key,**{k:v for k,v in r.items() if k!='data'},'preview':str(r.get('data'))[:500]},ensure_ascii=False),flush=True)
 with ThreadPoolExecutor(max_workers=3) as pool:
  for f in as_completed([pool.submit(run,k) for k in CASES]):f.result()
