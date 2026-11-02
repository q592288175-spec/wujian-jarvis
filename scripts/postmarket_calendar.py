"""Reuse the scanner's AKShare trading calendar without fetching quotations."""
import json
from akshare.futures.cons import get_calendar

if __name__ == "__main__":
    days = sorted({str(value).replace("-", "") for value in get_calendar()})
    print(json.dumps({"days": [f"{d[:4]}-{d[4:6]}-{d[6:]}" for d in days],
                      "source": "现有扫描使用的AKShare交易日历"}, ensure_ascii=False))
