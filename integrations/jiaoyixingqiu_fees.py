"""Read public fee tables; never treats third-party rates as account permissions."""
from datetime import datetime
import math
import re
from bs4 import BeautifulSoup

SOURCE = '交易星球（网站标示交易所标准，第三方参考）'
SOURCE_URL = 'https://www.jiaoyixingqiu.com/shouxufei/all'
HOME_URL = 'https://www.jiaoyixingqiu.com/shouxufei'
STAMP = r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'


def numeric(value):
    try:
        n = float(str(value).replace(',', '').replace('%', '').strip())
        return n if math.isfinite(n) and n >= 0 else None
    except (ValueError, TypeError):
        return None


def fee_rule(text):
    text = re.sub(r'\s+', '', text)
    rate = re.fullmatch(r'万分之(\d+(?:\.\d+)?)(?:\([\d.]+元\))?', text)
    fixed = re.fullmatch(r'(\d+(?:\.\d+)?)元', text)
    if rate:
        return {'万分之': float(rate[1]), '元': None}
    if fixed:
        return {'万分之': None, '元': float(fixed[1])}
    return {'万分之': None, '元': None}


def contract_code(raw, exchange, reference):
    raw = raw.upper().strip()
    match = re.fullmatch(r'([A-Z]+)(\d{3,4})', raw)
    if not match or not 1 <= int(match[2][-2:]) <= 12:
        return None
    if len(match[2]) == 3:
        if exchange != 'CZCE':
            return None
        year = int(reference[:4])
        candidate = min((year // 10 * 10 + int(match[2][0]) + offset for offset in (-10, 0, 10)), key=lambda y: abs(y-year))
        return match[1] + str(candidate)[-2:] + match[2][-2:]
    return raw


def parse_table(html, checked_at):
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', id='heyuetbl')
    if table is None:
        raise ValueError('交易星球未返回公开手续费表，保留原费用缓存')
    text = soup.get_text(' ', strip=True)
    page_stamp = re.search(r'同步更新\s*[:：]\s*(' + STAMP + ')', text)
    price_stamp = re.search(r'价格更新\s*[:：]\s*(' + STAMP + ')', text)
    if not page_stamp:
        raise ValueError('交易星球未提供可核验的费率更新时间')
    datetime.fromisoformat(page_stamp[1])
    if page_stamp[1][:10] > checked_at[:10]:
        raise ValueError('交易星球费率日期晚于本次采集日期')
    rows, exchange, skipped = [], None, 0
    for tr in table.find_all('tr'):
        header = tr.select_one('.jysname a')
        if header:
            code = str(header.get('href', '')).rstrip('/').split('/')[-1]
            exchange = code if code in {'SHFE','CZCE','DCE','GFEX','INE','CFFEX'} else None
            continue
        if not tr.get('id', '').startswith('tr_'):
            continue
        cells = tr.find_all('td', recursive=False)
        if len(cells) != 14 or not exchange:
            skipped += 1
            continue
        raw = cells[1].get_text(' ', strip=True)
        contract = contract_code(raw, exchange, checked_at)
        if not contract:
            skipped += 1
            continue
        price = numeric(cells[2].get_text())
        fees = [fee_rule(cells[i].get_text(' ', strip=True)) for i in (7, 8, 9)]
        if any(all(v is None for v in rule.values()) for rule in fees) or price is None or price <= 0:
            skipped += 1
            continue
        title = ' '.join(a.get('title', '') for a in cells[0].find_all('a'))
        stamp = re.search(STAMP, title)
        fee_at = stamp[0] if stamp else page_stamp[1]
        if fee_at[:10] > checked_at[:10]:
            skipped += 1
            continue
        p_stamp = re.search(STAMP, cells[2].get('title', ''))
        row = {'合约代码': contract, '来源合约代码': raw, '合约名称': cells[0].get_text(' ', strip=True),
               '交易所': exchange, '现价': price, '成交量': numeric(cells[3].get_text()),
               '保证金-买开': numeric(cells[4].get_text()), '保证金-卖开': numeric(cells[5].get_text()),
               '手续费更新时间': fee_at, '价格更新时间': p_stamp[0] if p_stamp else price_stamp[1] if price_stamp else None,
               '费用来源类型': '交易星球公开标准参考', '来源链接': HOME_URL,
               '合约查证链接': HOME_URL + '/heyue/' + re.match(r'[A-Za-z]+', raw)[0].lower(),
               '采集时间': checked_at, '网站标注主力': '主力' in cells[13].get_text(),
               '网站每跳毛利': numeric(cells[11].get_text())}
        for prefix, rule, i in zip(('开仓', '平昨', '平今'), fees, (7,8,9)):
            row['手续费标准-' + prefix + '-元'] = rule['元']
            row['手续费标准-' + prefix + '-万分之'] = rule['万分之']
            row[prefix + '收费原文'] = cells[i].get_text(' ', strip=True)
        rows.append(row)
    if not rows:
        raise ValueError('交易星球没有可核验的期货手续费行')
    return rows, {'status': 'ok', 'source': SOURCE, 'sourceUrl': HOME_URL, 'checkedAt': checked_at,
                  'feeUpdatedAt': page_stamp[1], 'priceUpdatedAt': price_stamp[1] if price_stamp else None,
                  'rows': len(rows), 'exchanges': sorted(set(r['交易所'] for r in rows)), 'skipped': skipped}


def collect_fees(db, save, now, fetch=None):
    checked_at = now()
    day = checked_at[:10]
    try:
        if fetch is None:
            import requests
            response = requests.get(SOURCE_URL, timeout=(8, 25), headers={'User-Agent': 'Xiaomu-Workbench/0.5 public-fee-reference'})
            response.raise_for_status()
            response.encoding = 'utf-8'
            html = response.text
        else:
            html = fetch()
        rows, status = parse_table(html, checked_at)
        # Validate the whole response before touching the previous successful batch.
        for row in rows:
            save(db, 'fee-jiaoyixingqiu', row['合约代码'], day, row, SOURCE)
        save(db, 'fee-source', 'jiaoyixingqiu', day, status, SOURCE)
        db.commit()
        return status
    except Exception as exc:
        retained = bool(db.execute("SELECT 1 FROM records WHERE kind IN ('fee','fee-jiaoyixingqiu') LIMIT 1").fetchone())
        status = {'status': 'failed', 'source': SOURCE, 'sourceUrl': HOME_URL, 'checkedAt': checked_at,
                  'error': '交易星球本次未取得有效费用：' + str(exc)[:160], 'retainedPrevious': retained}
        save(db, 'fee-source', 'jiaoyixingqiu', day, status, SOURCE)
        db.commit()
        raise ValueError(status['error']) from None
