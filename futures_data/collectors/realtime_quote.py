from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo
from futures_data.collectors.client import AkClient
from futures_data.compute.main_contract import select_main, number

class RealtimeQuote:
    def __init__(self, client: AkClient) -> None:
        self.client = client
    def collect(self, product: str, config: dict[str, str]) -> dict[str, Any]:
        if config.get('quote_interface') == 'futures_zh_spot':
            today=datetime.now(ZoneInfo('Asia/Shanghai')).date()
            daily: list[dict[str,Any]]=[]
            for offset in range(1,8):
                day=today-timedelta(days=offset)
                if day.weekday()>=5:continue
                daily=self.client.call('get_futures_daily',start_date=day.strftime('%Y%m%d'),end_date=day.strftime('%Y%m%d'),market=config['exchange'])
                if daily:break
            codes=[str(r['symbol']) for r in daily if str(r['symbol']).lower().startswith(product) and str(r['symbol'])[len(product):].isdigit()]
            if not codes:raise ValueError('月份合约目录不可用')
            ticks=self.client.call('futures_zh_spot',symbol=','.join(codes),market='FF',adjust='0')
            rows=[]
            for r in ticks:
                matches=[code for code in codes if str(r['symbol']).endswith(code[len(product):])]
                if len(matches)==1:rows.append({**r,'symbol':matches[0],'trade':r.get('current_price'),'position':r.get('hold'),'ticktime':r.get('time'),'tradedate':''})
        else:
            rows = self.client.call('futures_zh_realtime', symbol=config['sina_name'])
        raw = select_main(rows, product)
        now = datetime.now(ZoneInfo('Asia/Shanghai'))
        date = str(raw.get('tradedate') or '')[:10]
        time = str(raw.get('ticktime') or '')
        source_time = f'{date} {time}'.strip()
        return {'product': product, 'contract': str(raw['symbol']).upper(), 'exchange': config['exchange'], 'latest': number(raw.get('trade')), 'bid': number(raw.get('bidprice1')), 'ask': number(raw.get('askprice1')), 'bid_volume': number(raw.get('bidvol1')), 'ask_volume': number(raw.get('askvol1')), 'volume': number(raw.get('volume')), 'open_interest': number(raw.get('position')), 'open': number(raw.get('open')), 'high': number(raw.get('high')), 'low': number(raw.get('low')), 'previous_settlement': number(raw.get('presettlement', raw.get('prevsettlement'))), 'source_time': source_time, 'quote_date': date, 'collected_at': now.isoformat(), 'source': 'akshare.'+config.get('quote_interface','futures_zh_realtime')+' / 新浪', 'quality': '来源交易日与时钟，非已验证自然日期时间；不可用于计算精确延迟'}
