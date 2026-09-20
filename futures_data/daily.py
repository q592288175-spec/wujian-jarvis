from __future__ import annotations
import json
from datetime import datetime,timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo
from loguru import logger
from futures_data.settings import Settings
from futures_data.collectors.client import AkClient
from futures_data.collectors.inventory import DailyCollector as Inventory
from futures_data.collectors.warehouse_receipt import DailyCollector as Warehouse
from futures_data.collectors.holdings import DailyCollector as Holdings
from futures_data.storage.database import connect,upsert,inventory,warehouse,holdings

def run_daily(config: Settings,date: str | None = None,products: list[str] | None = None) -> dict[str,Any]:
    day=datetime.now(ZoneInfo('Asia/Shanghai')).date()
    if date:day=datetime.strptime(date,'%Y%m%d').date()
    else:
        while day.weekday()>=5:day-=timedelta(days=1)
    stamp=day.strftime('%Y%m%d');iso=day.isoformat()
    result: dict[str,Any]={'date':iso,'inventory':0,'warehouse_receipt':0,'holdings_rank':0,'failures':[]}
    selected=products or list(config.products)
    e=connect(config.db_path);client=AkClient(config);now=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()
    def save(rows: list[dict[str,Any]],table: Any,keys: list[str]) -> None:
        for r in rows:
            if r['product'] not in selected:continue
            raw_date=str(r['date']);r['date']=raw_date if '-' in raw_date else datetime.strptime(raw_date,'%Y%m%d').date().isoformat()
            if r['date']>iso:continue
            upsert(e,table,{**r,'collected_at':now},keys);result[table.name]+=1
    try:
        for p in selected:
            if config.products[p]['exchange']=='CFFEX':continue
            try:save(Inventory(client).collect(product=p),inventory,['product','date','source','scope'])
            except Exception as ex:result['failures'].append({'kind':'inventory','product':p,'reason':str(ex)[:150]})
        for exchange,interface in config.values['rank_interfaces'].items():
            codes=[p.upper() for p in selected if config.products[p]['exchange']==exchange]
            if not codes:continue
            if exchange!='CFFEX':
                try:
                    rows=Warehouse(client).collect(date=stamp,products=codes,exchange=exchange)
                    if not rows:raise ValueError('接口返回空数据')
                    save(rows,warehouse,['product','date','exchange'])
                except Exception as ex:result['failures'].append({'kind':'warehouse','exchange':exchange,'reason':str(ex)[:150]})
            try:
                rows=Holdings(client).collect(date=stamp,products=codes,interface=interface)
                if not rows:raise ValueError('接口返回空数据')
                save(rows,holdings,['product','date','contract','rank','side'])
            except Exception as ex:result['failures'].append({'kind':'holdings','exchange':exchange,'reason':str(ex)[:150]})
            logger.info('日频 {} 已处理',exchange)
        result['status']='partial' if result['failures'] else 'ok'
        path=Path('.runtime/akshare');path.mkdir(parents=True,exist_ok=True)
        (path/'last_daily.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        return result
    finally:e.dispose()
