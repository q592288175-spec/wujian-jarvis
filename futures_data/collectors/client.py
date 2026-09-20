from __future__ import annotations
import json
import subprocess
import sys
import time
from typing import Any
from tenacity import Retrying, stop_after_attempt, wait_fixed
from futures_data.settings import Settings

class AkClient:
    def __init__(self, config: Settings) -> None:
        self.config = config
        self.last_call = 0.0
    def call(self, name: str, **kwargs: Any) -> Any:
        for attempt in Retrying(stop=stop_after_attempt(int(self.config.values['retries'])), wait=wait_fixed(1), reraise=True):
            with attempt:
                time.sleep(max(0.0, float(self.config.values['request_interval_seconds']) - (time.monotonic() - self.last_call)))
                self.last_call = time.monotonic()
                result = subprocess.run([sys.executable, '-m', 'futures_data.collectors.worker'], input=json.dumps({'name': name, 'kwargs': kwargs, 'timeout': self.config.values['request_timeout_seconds'], 'deadline': self.config.values['call_timeout_seconds']}), text=True, capture_output=True, timeout=float(self.config.values['call_timeout_seconds']))
                payload = json.loads(result.stdout)
                if not payload['ok']:
                    raise RuntimeError(payload['error'])
                return payload['data']
        raise RuntimeError('No call attempt')
