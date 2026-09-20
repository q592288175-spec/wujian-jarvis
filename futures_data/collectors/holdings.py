from __future__ import annotations
import re
from typing import Any
from futures_data.collectors.base import Collector
from futures_data.collectors.client import AkClient
from futures_data.compute.main_contract import number

def normalize(raw: dict[str,list[dict[str,Any]]],date: str,source: str) -> list[dict[str,Any]]:
    result: list[dict[str,Any]]=[]
    for contract,rows in (raw or {}).items():
        if not re.fullmatch(r'[A-Za-z]+\d{3,4}',contract):continue
        product=re.sub(r'\d+$','',contract).lower()
        for row in rows:
            rank=number(row.get('rank'))
            if rank is None or not 1<=rank<=20 or int(rank)!=rank:continue
            for side,member,key in [('volume','vol_party_name','vol'),('long','long_party_name','long_open_interest'),('short','short_party_name','short_open_interest')]:
                value=number(str(row.get(key,'')).replace(',',''))
                name=row.get(member)
                if value is None or not name or str(name) in ('合计','总计','None','nan'):continue
                result.append({'product':product,'date':date,'contract':contract.upper(),'rank':int(rank),'side':side,'member':str(name).strip(),'value':value,'change':number(str(row.get(key+'_chg','')).replace(',','')),'source':'akshare.'+source})
    return result

class DailyCollector(Collector):
    def __init__(self,client: AkClient) -> None:self.client=client
    def collect(self,**kwargs: Any) -> list[dict[str,Any]]:
        source=kwargs['interface']
        args={'date':kwargs['date']}
        if source!='get_rank_table_czce':args['vars_list']=kwargs['products']
        return normalize(self.client.call(source,**args),kwargs['date'],source)
