"""Independent read-only market collector. No broker account or order tools."""
import os, json, math, time
from pathlib import Path
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / '.runtime/market.json'
def finite(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def change(last, settlement):
    a, b = finite(last), finite(settlement)
    return (a-b)/b*100 if a is not None and b is not None and b > 0 else None

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
    symbols=[s.strip() for s in os.getenv('TQ_SYMBOLS','KQ.m@SHFE.cu,KQ.m@SHFE.au,KQ.m@SHFE.rb').split(',') if s.strip()]
    if len(symbols)>20: raise ValueError('最多订阅20个合约')
    delay=1
    while True:
        api=None
        try:
            write('connecting',[])
            api=TqApi(TqSim(),auth=TqAuth(user,password),debug=False,disable_print=True)
            quotes={s:api.get_quote(s) for s in symbols}; actual={}; series={}; received={}; last_write=0
            while True:
                api.wait_update(deadline=time.time()+1)
                output=[]
                for requested,q in quotes.items():
                    symbol=q.underlying_symbol if requested.startswith('KQ.') else requested
                    if not symbol: continue
                    if actual.get(requested)!=symbol:
                        actual[requested]=symbol
                        series[requested]=api.get_kline_serial(symbol,86400,data_length=120)
                    live=api.get_quote(symbol)
                    if not live.datetime: continue
                    if api.is_changing(live) or requested not in received: received[requested]=datetime.now(timezone.utc).isoformat()
                    candles=[]
                    rows=list(series[requested].iterrows())
                    for i,(_,r) in enumerate(rows):
                        stamp=finite(r['datetime'])
                        if not stamp or stamp<=0: continue
                        candles.append(dict(timeNs=str(int(stamp)),open=finite(r['open']),high=finite(r['high']),low=finite(r['low']),close=finite(r['close']),volume=finite(r['volume']),complete=i<len(rows)-1))
                    output.append(dict(symbol=symbol,requestedSymbol=requested,exchange=symbol.split('.')[0],quoteTime=live.datetime,receivedAt=received[requested],tradingDay=None,tradingDayStatus='unknown',last=finite(live.last_price),preSettlement=finite(live.pre_settlement),changePct=change(live.last_price,live.pre_settlement),volume=finite(live.volume),openInterest=finite(live.open_interest),bid=finite(live.bid_price1),ask=finite(live.ask_price1),upperLimit=finite(live.upper_limit),lowerLimit=finite(live.lower_limit),bars=candles))
                if time.monotonic()-last_write>=1:
                    write('observing' if output else 'waiting',output)
                    last_write=time.monotonic()
                delay=1
        except KeyboardInterrupt:
            write('stopped',[]);return
        except Exception:
            # Never put vendor exception text (possibly credentials) into logs or UI.
            write('disconnected',[], '行情连接失败，请核对凭据、权限、合约和网络')
            time.sleep(delay);delay=min(delay*2,30)
        finally:
            if api: api.close()
if __name__=='__main__': run()
