"""Independent read-only market collector. No broker account or order tools."""
import os, json, math, time, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / '.runtime/market.json'
def finite(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def change(last, previous_close):
    a, b = finite(last), finite(previous_close)
    return (a-b)/b*100 if a is not None and b is not None and b > 0 else None

def trading_day(quote_time, dates):
    try:
        local=datetime.fromisoformat(quote_time)
        if local.tzinfo: local=local.astimezone(ZoneInfo('Asia/Shanghai'))
        day=local.date() + (timedelta(days=1) if local.hour>=18 else timedelta())
        return next((d for d in dates if d>=day),None)
    except (ValueError,TypeError): return None

def write(status, quotes, error=None):
    TARGET.parent.mkdir(exist_ok=True)
    payload = dict(schemaVersion=1, source='TqSdk', status=status, receivedAt=datetime.now(timezone.utc).isoformat(), quotes=quotes, error=error)
    temp=TARGET.with_suffix('.tmp')
    temp.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False))
    temp.replace(TARGET)

def run():
    user,password=os.getenv('TQ_USER'),os.getenv('TQ_PASSWORD')
    if not user or not password:
        write('unconfigured', [], '请在本机 .env 配置 TQ_USER 和 TQ_PASSWORD')
        return
    from tqsdk import TqApi,TqAuth,TqSim
    configured_symbols=os.getenv('TQ_SYMBOLS','').strip()
    delay=1
    while True:
        api=None
        try:
            write('connecting',[])
            api=TqApi(TqSim(),auth=TqAuth(user,password),debug=False,disable_print=True)
            # Resolve the provider's current main contract universe, then retain continuous
            # subscriptions so the existing rollover logic tracks changes.
            if configured_symbols and configured_symbols != 'ALL':
                symbols=[s.strip() for s in configured_symbols.split(',') if s.strip()]
            else:
                main_contracts=api.query_cont_quotes()
                exchanges={'SHFE','INE','DCE','CZCE','GFEX','CFFEX'}
                symbols=sorted({'KQ.m@'+re.sub(r'\d+$','',s) for s in main_contracts if s.split('.')[0] in exchanges})
            if not symbols: raise ValueError('未取得主力品种列表')
            today=datetime.now(ZoneInfo('Asia/Shanghai')).date()
            try:
                calendar=api.get_trading_calendar(today-timedelta(days=40),today+timedelta(days=40))
                dates=sorted(r['date'].date() for _,r in calendar.iterrows() if r['trading'])
            except Exception: dates=[]
            if dates:
                calendar_path=TARGET.parent/'trading-calendar.json'
                temp_calendar=calendar_path.with_suffix('.tmp')
                temp_calendar.write_text(json.dumps(dict(source='TqSdk.get_trading_calendar',updatedAt=datetime.now(timezone.utc).isoformat(),dates=[d.isoformat() for d in dates])))
                temp_calendar.replace(calendar_path)
            quotes={s:api.get_quote(s) for s in symbols}; actual={}; series={}; live_quotes={}; received={}; last_write=0
            while True:
                api.wait_update(deadline=time.time()+1)
                output=[]
                for requested,q in quotes.items():
                    symbol=q.underlying_symbol if requested.startswith('KQ.') else requested
                    if not symbol: continue
                    if actual.get(requested)!=symbol:
                        actual[requested]=symbol
                        live_quotes[requested]=api.get_quote(symbol)
                        received.pop(requested,None)
                        series[requested]=api.get_kline_serial(symbol,86400,data_length=1000)
                    live=live_quotes[requested]
                    if not live.datetime: continue
                    if api.is_changing(live) or requested not in received: received[requested]=datetime.now(timezone.utc).isoformat()
                    candles=[]
                    rows=list(series[requested].iterrows())
                    for i,(_,r) in enumerate(rows):
                        stamp=finite(r['datetime'])
                        if not stamp or stamp<=0: continue
                        candles.append(dict(timeNs=str(int(stamp)),open=finite(r['open']),high=finite(r['high']),low=finite(r['low']),close=finite(r['close']),volume=finite(r['volume']),openInterest=finite(r.get('close_oi')),openOpenInterest=finite(r.get('open_oi')),complete=i<len(rows)-1))
                    output.append(dict(symbol=symbol,name=live.instrument_name or symbol,requestedSymbol=requested,exchange=symbol.split('.')[0],quoteTime=live.datetime,receivedAt=received[requested],tradingDay=(trading_day(live.datetime,dates).isoformat() if trading_day(live.datetime,dates) else None),tradingDayStatus='calendar-derived' if trading_day(live.datetime,dates) else 'unknown',last=finite(live.last_price),close=finite(live.close),closeBasis="provider_quote_close",preSettlement=finite(live.pre_settlement),preClose=finite(live.pre_close),changeBasis="previous_close",changePct=change(live.last_price,live.pre_close),volume=finite(live.volume),openInterest=finite(live.open_interest),bid=finite(live.bid_price1),ask=finite(live.ask_price1),upperLimit=finite(live.upper_limit),lowerLimit=finite(live.lower_limit),bars=candles))
                if time.monotonic()-last_write>=1:
                    write('observing' if output else 'waiting',output)
                    last_write=time.monotonic()
                delay=1
        except KeyboardInterrupt:
            write('stopped',[]);return
        except Exception as exc:
            # Authentication rejection is terminal: never repeatedly retry bad credentials.
            if "用户权限认证失败" in str(exc):
                write("disconnected", [], "天勤 SDK 登录被拒绝，请在本机重新配置快期／天勤用户名和密码后启动行情")
                return
            # Never put vendor exception text (possibly credentials) into logs or UI.
            write('disconnected',[], '行情连接失败，请核对凭据、权限、合约和网络')
            time.sleep(delay);delay=min(delay*2,30)
        finally:
            if api: api.close()
if __name__=='__main__':
    import fcntl
    TARGET.parent.mkdir(exist_ok=True)
    with (TARGET.parent/'collector.lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise SystemExit('行情采集器已在运行，不重复启动')
        run()
