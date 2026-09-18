"""Read-only external context, never a domestic contract execution quote."""
import json,sys,contextlib,logging,datetime
logging.disable(logging.CRITICAL)
kind=sys.argv[1]
now=datetime.datetime.now(datetime.timezone.utc)
result={'provider':kind,'fetchedAt':now.isoformat(),'mode':'external_context','items':[], 'failures':[],'executionEligible':False}
with contextlib.redirect_stdout(sys.stderr):
 if kind=='yfinance':
  import yfinance as yf
  yf.config.debug.hide_exceptions=False
  yf.set_tz_cache_location(str(__import__('pathlib').Path(__file__).resolve().parent.parent/'.runtime/yf-cache'))
  for symbol,name,unit in [('GC=F','COMEX黄金参考序列','USD/金衡盎司'),('CL=F','WTI原油参考序列','USD/桶'),('HG=F','COMEX铜参考序列','USD/磅')]:
   try:
    ticker=yf.Ticker(symbol)
    h=ticker.history(period='1mo',interval='1d',auto_adjust=False,timeout=12)
    h=h.dropna(subset=['Close'])
    if h.empty: raise ValueError('empty')
    rows=[{'date':i.isoformat(),'close':float(r['Close'])} for i,r in h.iterrows()]
    result['items'].append({'symbol':symbol,'name':name,'unit':unit,'value':rows[-1]['close'],'observedAt':rows[-1]['date'],'history':rows,'source':'https://finance.yahoo.com/quote/'+symbol.replace('=','%3D')+'/','timing':'Yahoo日线末值，可能含未完成当日柱；不是实时可成交报价','contract':'供应商期货参考序列；换月与复权口径未审计'})
   except Exception as e:result['failures'].append({'symbol':symbol,'reason':type(e).__name__})
 elif kind=='fred':
  from pandas_datareader.fred import FredReader
  for symbol,name,unit in [('DGS10','美国10年期国债收益率','%'),('DTWEXBGS','广义美元指数','指数（2006年1月=100）')]:
   try:
    h=FredReader(symbol,start=(now-datetime.timedelta(days=90)).date(),end=now.date(),retry_count=0,timeout=12).read().dropna()
    if h.empty:raise ValueError('empty')
    rows=[{'date':i.date().isoformat(),'close':float(r[symbol])} for i,r in h.tail(30).iterrows()]
    result['items'].append({'symbol':symbol,'name':name,'unit':unit,'value':rows[-1]['close'],'observedAt':rows[-1]['date'],'history':rows,'source':'https://fred.stlouisfed.org/series/'+symbol,'timing':'宏观公布数据；观测日期不等于发布日期，可能修订'})
   except Exception as e:result['failures'].append({'symbol':symbol,'reason':type(e).__name__})
 else:raise ValueError('unsupported provider')
result['status']='ok' if result['items'] and not result['failures'] else 'partial' if result['items'] else 'unavailable'
print(json.dumps(result,ensure_ascii=False,allow_nan=False))
