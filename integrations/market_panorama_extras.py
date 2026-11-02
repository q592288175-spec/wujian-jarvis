"""Read-only public evidence adapters. No main-contract or trading-rule decisions."""
import math
import re
from datetime import date
from market_panorama_supplement import date_text, contract_code

EM_URL='https://datacenter-web.eastmoney.com/api/data/v1/get'
DCE_URL='http://www.dce.com.cn/dcereport/publicweb/tradepara/contractInfo'
EXCHANGE_DAILY={e:'get_'+e.lower()+'_daily' for e in ['SHFE','INE','CZCE','GFEX','CFFEX','DCE']}
ADAPTER_VERSION='2026-10-25-gaps-v3'
ROLL_ADAPTER_VERSION='2026-10-25-dce-public-v1'

def fetch_exchange_daily(exchange,day):
    import requests
    import akshare as ak
    if exchange not in EXCHANGE_DAILY:raise ValueError('交易所无效')
    original=requests.sessions.Session.request
    def checked(self,method,url,**kwargs):
        response=original(self,method,url,**kwargs)
        if response.status_code!=200:
            suffix='；返回HTML安全校验页，未绕过校验' if response.status_code==412 else ''
            raise ValueError(f'{exchange}日行情 HTTP {response.status_code}{suffix}')
        return response
    requests.sessions.Session.request=checked
    try:return getattr(ak,EXCHANGE_DAILY[exchange])(date=day.replace('-',''))
    except Exception as official_error:
        if exchange!='DCE':raise
        requests.sessions.Session.request=original
        from dce_public import collect
        try:return {**collect(day),'officialError':str(official_error)[:220]}
        except Exception as backup_error:raise ValueError(f'大商所官方：{str(official_error)[:150]}；公开备用：{str(backup_error)[:180]}') from None
    finally:requests.sessions.Session.request=original

def public_json(response,label):
    if response.status_code!=200:
        suffix='；返回HTML安全校验页，未绕过校验' if response.status_code==412 else ''
        raise ValueError(f'{label} HTTP {response.status_code}{suffix}')
    try:return response.json()
    except ValueError:raise ValueError(f'{label}返回非JSON内容（{response.headers.get("Content-Type","未标注类型")}）') from None

def fetch_dce_contracts():
    import requests
    payload=public_json(requests.post(DCE_URL,json={'lang':'zh','tradeType':'1','varietyId':'all'},timeout=10),'大商所合约接口')
    rows=payload.get('data')
    if not isinstance(rows,list):raise ValueError('大商所合约接口缺少data列表')
    return [{'合约代码':r.get('contractId'),'开始交易日':r.get('startTradeDate'),'最后交易日':r.get('endTradeDate'),'最后交割日':r.get('endDeliveryDate')} for r in rows]

def fetch_warrant_history(code,day):
    import requests
    from akshare.futures.cons import futures_inventory_em_symbol_dict
    code=str(code).upper()
    if not re.fullmatch('[A-Z]{1,3}',code):raise ValueError('品种代码无效')
    # Same RPT_FUTU_STOCKDATA / ON_WARRANT_NUM source as the existing research module.
    provider_code=next((v for v in futures_inventory_em_symbol_dict.values() if v and str(v).upper()==code),code)
    params={'reportName':'RPT_FUTU_STOCKDATA','columns':'SECURITY_CODE,TRADE_DATE,ON_WARRANT_NUM,ADDCHANGE',
            'pageNumber':'1','pageSize':'500','sortTypes':'-1','sortColumns':'TRADE_DATE','source':'WEB','client':'WEB'}
    # Some products absent from AKShare's mapping use a lowercase provider code.
    for candidate in dict.fromkeys([provider_code,code.lower()]):
        params['filter']=f'(SECURITY_CODE="{candidate}")(TRADE_DATE>=\'2020-10-28\')'
        payload=public_json(requests.get(EM_URL,params=params,timeout=10),'东方财富注册仓单')
        if payload.get('code')==9201:continue
        if not payload.get('success'):raise ValueError(str(payload.get('message') or '注册仓单接口返回失败'))
        rows=payload.get('result',{}).get('data') or []
        if rows:return rows
    return []

def number(v):
    if v is None or isinstance(v,bool):return None
    try:
        x=float(str(v).replace(',',''));return x if math.isfinite(x) else None
    except (TypeError,ValueError):return None

def normalize_warrants(rows,code,day):
    data={}
    for r in rows:
        stamp=date_text(r.get('TRADE_DATE') or r.get('日期'))
        if not stamp or stamp>day or str(r.get('SECURITY_CODE',code)).upper()!=code:continue
        value=number(r.get('ON_WARRANT_NUM',r.get('库存')))
        if value is None or value<0:continue
        data[stamp]={'date':stamp,'receipts':value,'change':number(r.get('ADDCHANGE',r.get('增减')))}
    history=[data[k] for k in sorted(data)]
    if not history:return None
    return {'code':code,'dataDate':history[-1]['date'],'firstDate':history[0]['date'],'history':history,'samples':len(history),
            'unit':'来源未标注单位','definition':'注册仓单，不是社会库存；只在同一品种、同一来源内比较；未声称覆盖全部历史',
            'endpoint':EM_URL,'sourceField':'ON_WARRANT_NUM'}

def calculate_rolls(rows,exchange,day,allowed_codes=None):
    groups={};gaps=[]
    for r in rows:
        stamp=date_text(r.get('date'));symbol=contract_code(r.get('symbol'),day)
        if stamp!=day or not symbol:continue
        m=re.fullmatch(r'([A-Z]+)(\d{2})(\d{2})',symbol)
        if not m or not 1<=int(m[3])<=12:continue
        code=m[1]
        if allowed_codes is not None and code not in allowed_codes:continue
        oi=number(r.get('open_interest'));close=number(r.get('close'));vol=number(r.get('volume'))
        if oi is None or oi<=0:continue
        groups.setdefault(code,{})[symbol]={'contract':symbol,'close':close,'interest':oi,'volume':vol,'monthIndex':int(m[2])*12+int(m[3])}
    results=[]
    for code,contracts in groups.items():
        top=sorted(contracts.values(),key=lambda r:(-r['interest'],-(r['volume'] or 0),r['contract']))[:2]
        if len(top)<2 or any(r['close'] is None or r['close']<=0 or r['volume'] is None or r['volume']<=0 for r in top):
            gaps.append({'code':code,'reason':'同日持仓前二合约不足，或其中合约无有效成交/收盘价'});continue
        near,far=sorted(top,key=lambda r:r['monthIndex']);months=far['monthIndex']-near['monthIndex']
        if months<=0:continue
        rate=math.log(near['close']/far['close'])*12/months
        results.append({'code':code,'exchange':exchange,'dataDate':day,'near':near,'far':far,'monthGap':months,'rate':rate,
                        'selection':'同日公开日行情持仓量前二；不改变小木文华主力认定',
                        'formula':'ln(近月收盘价/远月收盘价)×12/相隔月份数',
                        'definition':'年化对数价差率；使用同日收盘价，不是实际持有收益或下次展期收益承诺'})
    return results,gaps

def collect_extras(db,catalog,day,ak_call,save,now,enabled_keys):
    from concurrent.futures import ThreadPoolExecutor,as_completed
    count=0;failures=[];stamp=now()
    def cached(key):
        row=db.execute("SELECT body FROM records WHERE kind='supplement-status' AND key=? AND day=?",(key,day)).fetchone()
        if not row:return None
        import json
        expected=ROLL_ADAPTER_VERSION if key=='roll_yield' else ADAPTER_VERSION
        item=json.loads(row[0]);return item if item.get('checkedAt','')[:10]==stamp[:10] and item.get('adapterVersion')==expected else None
    for key in ('warrant_history','roll_yield'):
        old=cached(key) if key in enabled_keys else None
        if old and old.get('status')!='ok':
            failures.extend(old.get('failures') or [{'product':key,'day':day,'error':old.get('reason','缓存中仍有来源缺口')}])
    if 'warrant_history' in enabled_keys and not cached('warrant_history'):
        eligible=[p for p in catalog if p['exchange']!='CFFEX'];success=0;rows_count=0;warehouse_gaps=[];dates=[]
        def fetch_one(p):
            try:return p,ak_call('xiaomu_warrant_history',{'code':p['code'],'day':day},timeout=20),None
            except Exception as e:return p,[],str(e)[:220]
        with ThreadPoolExecutor(max_workers=2) as pool:
            for future in as_completed([pool.submit(fetch_one,p) for p in eligible]):
                p,raw,error=future.result();item=normalize_warrants(raw,p['code'],day)
                if item:
                    save(db,'warrant-history',p['code'],day,{**item,'checkedAt':stamp},'东方财富注册仓单 / RPT_FUTU_STOCKDATA');success+=1;rows_count+=item['samples'];dates.append(item['dataDate'])
                reason=error or ('' if item else '来源未返回该品种截至查询日的注册仓单记录')
                status='ok' if item and item['dataDate']==day else 'stale' if item else 'empty' if not error else 'unavailable'
                if status=='stale':reason='最新公布日期为'+item['dataDate']+'，未冒充查询日数据'
                save(db,'supplement-status','warrant:'+p['code'],day,{'status':status,'rows':item['samples'] if item else 0,'reason':reason,'checkedAt':stamp},'东方财富注册仓单')
                if status!='ok':warehouse_gaps.append({'product':p['code'],'day':day,'error':reason})
        note=f'取得{success}/{len(eligible)}个品种、{rows_count}条；源单位未标注；未取得品种在详情说明'
        save(db,'supplement-status','warrant_history',day,{'status':'ok' if not warehouse_gaps else 'partial' if success else 'unavailable','rows':rows_count,'products':success,'reason':note,'checkedAt':stamp,'adapterVersion':ADAPTER_VERSION,'failures':warehouse_gaps},'东方财富注册仓单（与既有来源相同）')
        count+=rows_count;failures.extend(warehouse_gaps)
    if 'roll_yield' in enabled_keys and not cached('roll_yield'):
        total=0;markets=0;market_gaps=[]
        def fetch_market(exchange,name):
            try:return exchange,ak_call('xiaomu_exchange_daily',{'exchange':exchange,'day':day},timeout=180 if exchange=='DCE' else 30),None
            except Exception as e:return exchange,[],str(e)[:220]
        with ThreadPoolExecutor(max_workers=3) as pool:
            for future in as_completed([pool.submit(fetch_market,e,n) for e,n in EXCHANGE_DAILY.items()]):
                exchange,raw,error=future.result()
                allowed={p['code'] for p in catalog if p['exchange']==exchange} if catalog else None
                backup=raw if exchange=='DCE' and isinstance(raw,dict) else None
                if backup:
                    raw=backup['daily'];contracts=[r for r in backup['contracts'] if allowed is None or r['code'] in allowed]
                    for contract in contracts:save(db,'contract-info',contract['contract'],day,contract,'OpenCTP公开合约字典（大商所备用，非交易所直连）')
                    count+=len(contracts)
                    save(db,'supplement-status','contract_dce_public',day,{'status':'ok' if contracts else 'empty','rows':len(contracts),'recordDay':backup['checkedAt'][:10],'reason':'当前公开字典；查询批次日，源未给资料发布日期；仅展示日期，不采用其费率或保证金；官方：'+backup['officialError'],'checkedAt':backup['checkedAt']},'OpenCTP公开合约字典（大商所备用）')
                items,gaps=calculate_rolls(raw,exchange,day,allowed)
                if backup:
                    for code in backup['incompleteProducts']:
                        if allowed is None or code in allowed:
                            failed=[e['contract'] for e in backup['errors'] if e['code']==code]
                            gaps.append({'code':code,'reason':'备用源合约日K不完整，无法确认持仓前二，未计算：'+','.join(failed)})
                if items:
                    markets+=1
                    for item in items:
                        provider=backup['source'] if backup else exchange+'交易所同日公开日行情 / AKShare；小木计算年化对数价差率'
                        extra={'coverage':backup['coverage'],'sourceUrl':backup['sourceUrl'],'instrumentSourceUrl':backup['instrumentSourceUrl'],'officialError':backup['officialError']} if backup else {}
                        save(db,'roll-yield',item['code'],day,{**item,**extra,'checkedAt':stamp},provider)
                        save(db,'supplement-status','roll-product:'+item['code'],day,{'status':'ok','rows':1,'reason':'','checkedAt':stamp},provider)
                    total+=len(items)
                reason=error or ('' if items else '无可比同日期货合约')
                if backup:reason='官方：'+backup['officialError']+'；公开备用已取得'+str(len(items))+'品种；'+backup['coverage']+('；'+str(len(gaps))+'品种资料不完整，未计算' if gaps else '')
                save(db,'supplement-status','roll:'+exchange,day,{'status':'partial' if backup and gaps else 'ok' if items else 'unavailable','rows':len(items),'reason':reason,'checkedAt':stamp,'productGaps':gaps},backup['source'] if backup else exchange+'交易所同日公开日行情')
                if reason:market_gaps.append({'exchange':exchange,'day':day,'error':reason})
                for gap in gaps:save(db,'supplement-status','roll-product:'+gap['code'],day,{'status':'empty','rows':0,'reason':gap['reason'],'checkedAt':stamp},backup['source'] if backup else exchange+'公开日行情')
        save(db,'supplement-status','roll_yield',day,{'status':'ok' if markets==len(EXCHANGE_DAILY) and not market_gaps else 'partial' if total else 'unavailable','rows':total,'reason':f'{markets}/6个交易所、{total}个品种；'+('；'.join(g['error'] for g in market_gaps)),'checkedAt':stamp,'failures':market_gaps,'adapterVersion':ROLL_ADAPTER_VERSION},'交易所日行情 / AKShare；大商所失败时采用新浪日K与OpenCTP公开字典备用')
        count+=total;failures.extend(market_gaps)
    db.commit();return {'rows':count,'failures':failures}
