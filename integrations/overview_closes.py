"""Display-only, same-contract completed closes. Never writes trading/scan bars."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
import json
import math
import re

SOURCE = '新浪财经具体合约日K / AKShare'
SOURCE_URL = 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_V21052021_4_12=/InnerFuturesNewService.getDailyKLine'


def numeric(value):
    try:
        result = float(value)
        return result if math.isfinite(result) and not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def completed_closes(rows, contract, cutoff):
    """Only explicit close values; settlement is intentionally never read."""
    result = {}
    if not re.fullmatch(r'[A-Z]+\d{3,4}', contract or ''):
        return []
    for row in rows:
        day = str(row.get('date', ''))[:10]
        try:
            if date.fromisoformat(day).isoformat() != day or day > cutoff:
                continue
        except ValueError:
            continue
        close = numeric(row.get('close'))
        volume = numeric(row.get('volume'))
        interest = numeric(row.get('hold', row.get('open_interest')))
        if close is None or close <= 0 or row.get('complete') is False:
            continue
        result[day] = {'contract': contract, 'day': day, 'close': close,
                       'volume': volume if volume is not None and volume >= 0 else None,
                       'interest': interest if interest is not None and interest >= 0 else None,
                       'complete': True, 'sourceUrl': SOURCE_URL}
    return [result[key] for key in sorted(result)][-60:]


def reusable_pair(cached, contract, days):
    if len(cached) != 2 or not re.fullmatch(r'[A-Z]+\d{3,4}', contract or ''):
        return False
    seen = set()
    for day, body, source in cached:
        try:
            row = json.loads(body)
        except (TypeError, ValueError):
            return False
        if not isinstance(row, dict):
            return False
        close = numeric(row.get('close'))
        if (source != SOURCE or row.get('contract') != contract or row.get('day') != day
                or row.get('complete') is not True or close is None or close <= 0):
            return False
        seen.add(day)
    return seen == set(days)


def collect_closes(db, catalog, ak_call, save, now, product=None):
    # The existing completed EOD calendar fixes the date for the whole batch.
    days = [r[0] for r in db.execute("SELECT DISTINCT day FROM bars WHERE period='1d' AND complete=1 ORDER BY day DESC LIMIT 2")]
    if len(days) < 2:
        raise ValueError('缺少两个已完成交易日，请先刷新盘后日K')
    target, previous = days
    selected = [c for c in catalog if not product or c['code'] == product]
    checked_at = now()
    results = []
    pending = []
    for c in selected:
        contract = c.get('contract')
        cached = db.execute("SELECT day,body,source FROM records WHERE kind='close-daily' AND key=? AND day IN (?,?)", (contract or '', target, previous)).fetchall()
        if reusable_pair(cached, contract, (target, previous)):
            results.append({'code': c['code'], 'contract': contract, 'cached': True})
        else:
            pending.append(c)

    def fetch(c):
        contract = c.get('contract')
        if not re.fullmatch(r'[A-Z]+\d{3,4}', contract or ''):
            return c, [], '具体主力合约尚未核验'
        try:
            raw = ak_call('futures_zh_daily_sina', {'symbol': contract}, timeout=25)
            return c, completed_closes(raw, contract, target), None
        except Exception as exc:
            message = str(exc)
            if 'Length mismatch' in message:
                message = '公开日K接口返回空表，未取得该合约的收盘数据'
            elif 'timeout' in message.lower() or 'timed out' in message.lower():
                message = '公开日K接口请求超时，可稍后重试'
            else:
                message = '公开日K接口暂不可用：' + message[:140]
            return c, [], message

    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for future in as_completed([pool.submit(fetch, c) for c in pending]):
            c, rows, error = future.result()
            for row in rows:
                save(db, 'close-daily', row['contract'], row['day'], {**row, 'checkedAt': checked_at}, SOURCE)
            valid = {row['day'] for row in rows}
            reason = error or ('' if {target, previous} <= valid else '未取得同一合约两个相邻完成交易日的收盘价；最新返回 ' + (rows[-1]['day'] if rows else '无数据'))
            status = {'status': 'ok' if not reason else 'unavailable' if error else 'partial', 'contract': c.get('contract'), 'dataDate': target,
                      'previousDate': previous, 'checkedAt': checked_at, 'reason': reason, 'rows': len(rows)}
            save(db, 'supplement-status', 'overview-close:' + c['code'], target, status, SOURCE)
            if reason:
                failures.append({'product': c['code'], 'day': target, 'error': reason})
            results.append({'code': c['code'], 'contract': c.get('contract'), 'cached': False, **status})
            db.commit()
    value = {'dataDate': target, 'previousDate': previous, 'products': len(selected), 'available': len(selected) - len(failures),
             'cached': sum(bool(r.get('cached')) for r in results), 'failures': failures, 'checkedAt': checked_at}
    save(db, 'supplement-status', 'overview-closes', target, value, SOURCE)
    db.commit()
    return value
