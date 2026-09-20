from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo
from loguru import logger
from futures_data.settings import Settings
from futures_data.collectors.client import AkClient
from futures_data.collectors.realtime_quote import RealtimeQuote
from futures_data.collectors.spot_price import SpotPrice
from futures_data.compute.basis import calculate
from futures_data.compute.main_contract import number, select_main
from futures_data.storage.database import connect, spots, basis, upsert, save_quote

def run(config: Settings, products: list[str] | None = None) -> dict[str, Any]:
    engine = connect(config.db_path)
    client = AkClient(config)
    log_dir = config.root / 'logs'; log_dir.mkdir(exist_ok=True)
    sink = logger.add(log_dir / 'collector.log', rotation='10 MB', retention=5)
    summary: dict[str, Any] = {'started_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(), 'quotes': 0, 'basis': 0, 'spots': 0, 'failures': [], 'gaps': []}
    try:
        cash = {str(r['symbol']).lower(): r for r in SpotPrice(client).collect()}
        daily_cache: dict[str, list[dict[str, Any]]] = {}
        for product in products or list(config.products):
            pc = config.products[product]
            try:
                q = RealtimeQuote(client).collect(product, pc)
                save_quote(engine, q); summary['quotes'] += 1
                logger.info('QUOTE {} {} latest={} volume={} oi={} source_time={}', product, q['contract'], q['latest'], q['volume'], q['open_interest'], q['source_time'])
                raw = cash.get(pc['spot_symbol'].lower())
                if not raw or number(raw.get('spot_price')) is None:
                    summary['gaps'].append({'product': product, 'reason': '暂无现货源或本轮未返回'})
                    continue
                # Units are source-specific; ambiguous transformations must not enter basis.
                stamp = str(raw['date'])[:8]
                date = datetime.strptime(stamp, '%Y%m%d').date().isoformat()
                s = {'product': product, 'date': date, 'price': float(raw['spot_price']), 'unit': '原始现货单位待核验' if product in ('lh','sh','jd') else pc['unit'], 'scope': '生意社商品现货参考价；接口不提供地区/牌号，非指定交割品', 'source': 'akshare.futures_spot_price / 生意社', 'collected_at': q['collected_at']}
                upsert(engine, spots, s, ['product','date','source']); summary['spots'] += 1
                if product in ('lh','sh','jd'):
                    summary['gaps'].append({'product':product,'reason':'现货单位/折百口径待核验，已存原始现货但不计算基差'});continue
                try:
                    basis_quote = q
                    if q['quote_date'] != date:
                        market = 'SHFE' if pc['exchange'] == 'INE' else pc['exchange']
                        key = market + date
                        if key not in daily_cache:
                            try:
                                daily_cache[key] = client.call('get_futures_daily', start_date=stamp, end_date=stamp, market=market)
                            except Exception:
                                daily_cache[key] = []
                        daily_rows = [{**r, 'trade': r.get('close'), 'position': r.get('open_interest')} for r in daily_cache[key] if str(r.get('date'))[:8] == stamp]
                        historical = select_main(daily_rows, product)
                        basis_quote = {**q, 'contract': str(historical['symbol']).upper(), 'latest': float(historical['close']), 'quote_date': date, 'source_time': date + ' 日收盘 / akshare.get_futures_daily'}
                    b = calculate(basis_quote,s)
                    upsert(engine,basis,b,['product','date']); summary['basis'] += 1
                    logger.info('BASIS {} date={} spot={} future={} basis={:.4f} rate={:.6f}',product,date,s['price'],basis_quote['latest'],b['basis'],b['basis_rate'])
                except (ValueError,TypeError,KeyError) as exc:
                    summary['gaps'].append({'product': product, 'reason': str(exc)})
            except Exception as exc:
                summary['failures'].append({'product': product, 'reason': str(exc)[:250]})
                logger.error('FAIL {} {}', product, str(exc)[:250])
        summary['status'] = 'ok' if not summary['failures'] and summary['basis'] else 'partial' if summary['quotes'] else 'failed'
        summary['finished_at'] = datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()
        Path('.runtime/akshare').mkdir(parents=True,exist_ok=True)
        Path('.runtime/akshare/last_run.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        return summary
    finally:
        logger.remove(sink); engine.dispose()
