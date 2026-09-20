from __future__ import annotations
from typing import Any
from futures_data.collectors.base import Collector
from futures_data.collectors.client import AkClient
from futures_data.compute.main_contract import number
class DailyCollector(Collector):
    def __init__(self,client: AkClient) -> None:
        self.client=client
    def collect(self, **kwargs: Any) -> list[dict[str, Any]]:
        product=kwargs['product']
        raw=self.client.call('futures_inventory_em',symbol=self.client.config.products[product]['inventory_symbol'])
        return [{'product':product,'date':str(r['日期'])[:10],'value':number(r['库存']),'change':number(r['增减']),'unit':'原接口未提供；待核验','scope':'东财库存页面ON_WARRANT_NUM口径，不能当社会/厂库库存','source':'akshare.futures_inventory_em / 东方财富'} for r in raw if number(r.get('库存')) is not None]
