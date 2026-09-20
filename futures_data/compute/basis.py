from __future__ import annotations
from typing import Any
from futures_data.compute.main_contract import number

def calculate(quote: dict[str, Any], spot: dict[str, Any]) -> dict[str, Any]:
    if quote['quote_date'] != spot['date']:
        raise ValueError('现货日期与期货报价日期不一致，不跨日期拼接基差')
    price = number(quote['latest'])
    cash = number(spot['price'])
    if price is None or price <= 0 or cash is None or cash <= 0:
        raise ValueError('价格缺失或非正数')
    difference = cash - price
    return {'product': quote['product'], 'date': spot['date'], 'contract': quote['contract'], 'spot_price': cash, 'futures_price': price, 'basis': difference, 'basis_rate': difference / price, 'quote_time': quote['source_time'], 'quality': '公开现货口径对比所选主力；同日非同步，不等同可交割套利基差', 'collected_at': quote['collected_at']}
