from __future__ import annotations
import math
import re
from typing import Any

def number(value: Any) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None

def select_main(rows: list[dict[str, Any]], product: str) -> dict[str, Any]:
    candidates = [r for r in rows if re.fullmatch(re.escape(product) + r'\d{3,4}', str(r.get('symbol', '')), re.I) and number(r.get('trade')) is not None and number(r.get('trade')) > 0 and number(r.get('volume')) is not None and number(r.get('position')) is not None and number(r.get('volume')) >= 0 and number(r.get('position')) >= 0 and number(r.get('volume')) + number(r.get('position')) > 0]
    if not candidates:
        raise ValueError('没有可核验的月份合约及成交/持仓量；不使用连续合约代替')
    return max(candidates, key=lambda r: (float(r['volume']) + float(r['position']), float(r['position']), float(r['volume']), str(r['symbol'])))
