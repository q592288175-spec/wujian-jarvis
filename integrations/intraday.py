"""Observed quote samples only; no fabricated historical VWAP or startup crossing."""
from datetime import datetime, timezone
import math
class Intraday:
    def __init__(self): self.states={}
    def update(self,symbol,day,stamp,price,average,now=None):
        now=now or datetime.now(timezone.utc)
        if not day or not stamp or not all(isinstance(v,(int,float)) and math.isfinite(v) and v>0 for v in (price,average)):
            self.states.pop(symbol,None)
            return dict(points=[],cross=None,basis='TqSdk.quote.average',status='missing')
        state=self.states.get(symbol)
        if not state or state['tradingDay']!=day:
            state=dict(tradingDay=day,points=[],cross=None,basis='TqSdk.quote.average',status='observed',lastSide=0,lastStamp=None,lastSeen=None)
            self.states[symbol]=state
        if state['lastStamp']==stamp:return state
        side=(price>average)-(price<average)
        try:
            from zoneinfo import ZoneInfo
            at=datetime.fromisoformat(stamp).replace(tzinfo=ZoneInfo('Asia/Shanghai'))
            fresh=0 <= (now-at).total_seconds() <= 30
        except ValueError:fresh=False
        contiguous=state['lastSeen'] is not None and 0 <= (now-state['lastSeen']).total_seconds() <= 15
        if fresh and contiguous and side and state['lastSide'] and side!=state['lastSide']:
            state['cross']=dict(direction='long' if side>0 else 'short',at=now.isoformat(),tradingDay=day)
        elif not contiguous:state['cross']=None
        if side:state['lastSide']=side
        state['lastSeen']=now;state['lastStamp']=stamp
        point=dict(time=stamp,price=price,average=average)
        # Retain one observation per minute plus the latest live sample.
        points=state['points']
        if points and points[-1]['time'][:16]==stamp[:16]:points[-1]=point
        else:points.append(point)
        state['points']=points[-1500:]
        return state
    def snapshot(self,*args):
        s=self.update(*args)
        return {k:v for k,v in s.items() if k not in ('lastSide','lastStamp','lastSeen')}
