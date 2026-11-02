"""Display-only public DCE fallback: OpenCTP instruments + Sina completed daily bars."""
import json,re,threading,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import date,datetime,timezone,timedelta
import requests

INSTRUMENT_URL='http://dict.openctp.cn/instruments'
DAILY_URL='https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_V21052021_4_12=/InnerFuturesNewService.getDailyKLine'
SOURCE='新浪财经具体合约完成日K（备用）；OpenCTP当期合约清单'
_local=threading.local()

def session():
    if not hasattr(_local,'session'):_local.session=requests.Session()
    return _local.session

def iso(value):
    text=str(value or '').strip()
    if re.fullmatch(r'\d{8}',text):text=text[:4]+'-'+text[4:6]+'-'+text[6:]
    try:return date.fromisoformat(text).isoformat()
    except ValueError:return None

def normalize_instruments(rows,day,checked_at,allowed_codes=None):
    result={};query_day=checked_at[:10]
    for row in rows:
        symbol=str(row.get('InstrumentID','')).upper();m=re.fullmatch(r'([A-Z]+)(\d{2})(\d{2})',symbol)
        if row.get('ExchangeID')!='DCE' or str(row.get('ProductClass'))!='1' or not m:continue
        if allowed_codes is not None and m[1] not in allowed_codes:continue
        if not 1<=int(m[3])<=12:continue
        opened=iso(row.get('OpenDate'));expiry=iso(row.get('ExpireDate'));delivery=iso(row.get('DeliveryDate'))
        if not opened or not expiry or not opened<=day<=expiry or expiry<opened:continue
        if delivery and delivery<expiry:delivery=None
        item={'code':m[1],'contract':symbol,'exchange':'DCE','listed':opened,'lastTrade':expiry,'delivery':delivery,
              'lastDelivery':None,'dataDate':query_day,'dateBasis':'查询批次日；源未给资料发布日期',
              'sourceUrl':INSTRUMENT_URL+'?types=futures&markets=DCE','checkedAt':checked_at,
              'basis':'OpenCTP公开合约字典备用；交割日使用源DeliveryDate，不冒充最后交割日；不改变主力或账户权限'}
        if symbol in result and result[symbol]!=item:raise ValueError('公开字典同一合约日期冲突：'+symbol)
        result[symbol]=item
    return list(result.values())

def instruments(day,checked_at,allowed_codes=None):
    response=session().get(INSTRUMENT_URL,params={'types':'futures','markets':'DCE'},timeout=10);response.raise_for_status()
    data=response.json()
    if data.get('rsp_code')!=0 or not isinstance(data.get('data'),list):raise ValueError('OpenCTP公开字典业务失败或缺少data')
    if len(data['data'])>5000:raise ValueError('公开字典行数异常')
    result=normalize_instruments(data['data'],day,checked_at,allowed_codes)
    if not result:raise ValueError('OpenCTP未返回目标日期适用的具体期货合约')
    return result

def normalize_daily(rows,symbol,day):
    found=[]
    for row in rows:
        if iso(row.get('d',row.get('date')))!=day:continue
        def value(key,alias):
            raw=row.get(key,row.get(alias))
            if raw is None or isinstance(raw,bool):raise ValueError('目标日K缺少'+key)
            v=float(raw)
            import math
            if not math.isfinite(v):raise ValueError('目标日K无效'+key)
            return v
        close=value('c','close');volume=value('v','volume');interest=value('p','hold')
        if close<=0 or min(volume,interest)<0:raise ValueError('目标日K价格或量仓无效')
        found.append({'symbol':symbol,'date':day,'close':close,'volume':volume,'open_interest':interest})
    if len(found)!=1:raise ValueError('目标日K缺失或重复；未用实时价/结算价补齐')
    return found[0]

def daily(symbol,day):
    if not re.fullmatch(r'[A-Z]+\d{4}',symbol):raise ValueError('具体合约代码无效')
    response=session().get(DAILY_URL,params={'symbol':symbol,'type':'2021_04_12'},timeout=9);response.raise_for_status()
    text=response.text;start=text.find('=(');end=text.rfind(');')
    if start<0 or end<=start:raise ValueError('新浪日K不是已声明的JSONP结构')
    rows=json.loads(text[start+2:end])
    if not isinstance(rows,list):raise ValueError('新浪日K没有数组')
    return normalize_daily(rows,symbol,day)

def collect(day,allowed_codes=None):
    if not iso(day):raise ValueError('目标日期无效')
    checked_at=datetime.now(timezone(timedelta(hours=8))).isoformat()
    if day>checked_at[:10]:raise ValueError('不能将未来交易日当完成日K')
    contracts=instruments(day,checked_at,set(allowed_codes) if allowed_codes is not None else None)
    if len(contracts)>400:raise ValueError('大商所期货清单行数异常，未批量请求')
    bars=[];errors=[]
    def read_one(info):
        try:return daily(info['contract'],day),None
        except Exception as e:return None,{'code':info['code'],'contract':info['contract'],'reason':type(e).__name__+': '+str(e)[:160]}
        finally:time.sleep(.08)
    with ThreadPoolExecutor(max_workers=3) as pool:
        for f in as_completed([pool.submit(read_one,c) for c in contracts]):
            row,error=f.result()
            if row:bars.append(row)
            if error:errors.append(error)
    # Missing any listed contract leaves the product's OI ranking unproven.
    incomplete={e['code'] for e in errors}
    return {'daily':[r for r in bars if re.match('[A-Z]+',r['symbol'])[0] not in incomplete],
            'contracts':contracts,'checkedContracts':len(contracts),'receivedContracts':len(bars),
            'errors':errors,'source':SOURCE,'sourceUrl':DAILY_URL,'instrumentSourceUrl':INSTRUMENT_URL,
            'dataDate':day,'checkedAt':checked_at,'coverage':'当前公开在市合约清单中，目标日已上市且未到期的合约；不是历史全月份清单',
            'incompleteProducts':sorted(incomplete)}
