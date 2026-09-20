from __future__ import annotations
from typing import Any
from futures_data.collectors.base import Collector
from futures_data.collectors.client import AkClient
from futures_data.compute.main_contract import number
class DailyCollector(Collector):
    def __init__(self,client: AkClient) -> None:
        self.client=client
    def collect(self, **kwargs: Any) -> list[dict[str, Any]]:
        raw=self.client.call('get_receipt',start_date=kwargs['date'],end_date=kwargs['date'],vars_list=kwargs['products'])
        return [{'product':str(r['var']).lower(),'date':kwargs['date'],'value':number(r['receipt']),'change':number(r.get('receipt_chg')),'unit':'交易所原始仓单单位，待品种级核验','exchange':kwargs['exchange'],'source':'akshare.get_receipt / 交易所'} for r in raw if number(r.get('receipt')) is not None]
