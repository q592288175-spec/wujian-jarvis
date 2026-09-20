from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo
from loguru import logger
from futures_data.collectors.client import AkClient

class SpotPrice:
    def __init__(self, client: AkClient) -> None:
        self.client = client
    def collect(self) -> list[dict[str, Any]]:
        today = datetime.now(ZoneInfo('Asia/Shanghai')).date()
        for offset in range(int(self.client.config.values['spot_lookback_days'])):
            day = today - timedelta(days=offset)
            if day.weekday() >= 5:
                continue
            try:
                rows = self.client.call('futures_spot_price', date=day.strftime('%Y%m%d'))
                if rows:
                    return rows
            except Exception as exc:
                logger.warning('现货 {} 未取到: {}', day, str(exc)[:180])
        return []
