"""Cache public commodity index closes with their actual fetch timestamp."""
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.runtime' / 'environment' / 'commodity-index.json'


def main():
    response = requests.get(
        'http://www.ccidx.com/CCI-ZZZS/index/getDateLine',
        params={'indexId': '000001.CCI'}, timeout=(5, 15))
    response.raise_for_status()
    values = response.json()['data']['dateLineJson']
    bars = sorted([{'date': str(row['tradeDate'])[:10],
                    'close': float(row['closingPrice'])} for row in values],
                  key=lambda row: row['date'])
    if len(bars) < 11 or any(row['close'] <= 0 for row in bars):
        raise ValueError('指数日线样本不足或价格异常')
    result = {'name': '中证商品期货价格指数（文华替代）',
              'symbol': '000001.CCI', 'source': '中证商品指数公司',
              'url': response.url,
              'fetchedAt': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
              'bars': bars}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    temporary.replace(OUT)
    print(json.dumps({'status': 'ready', 'count': len(bars),
                      'dataDate': bars[-1]['date']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
