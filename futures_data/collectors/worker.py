"""Isolated AKShare call with per-request timeout. Parent also enforces wall time."""
from __future__ import annotations
import contextlib
import io
import json
import sys
import signal
from typing import Any

def main() -> None:
    request: dict[str, Any] = json.loads(sys.stdin.read())
    signal.setitimer(signal.ITIMER_REAL,float(request.get('deadline',35)))
    import requests
    original = requests.sessions.Session.request
    def timed(self: requests.Session, method: str, url: str, **kwargs: Any) -> requests.Response:
        if kwargs.get('timeout') is None:
            kwargs['timeout'] = float(request['timeout'])
        return original(self, method, url, **kwargs)
    requests.sessions.Session.request = timed
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            import akshare as ak
            result = getattr(ak, request['name'])(**request['kwargs'])
        def serialize(value: Any) -> Any:
            if hasattr(value, 'to_json'):
                return json.loads(value.to_json(orient='records', date_format='iso', force_ascii=False))
            if isinstance(value, dict):
                return {str(k): serialize(v) for k, v in value.items()}
            return value
        print(json.dumps({'ok': True, 'data': serialize(result)}, ensure_ascii=False, allow_nan=False))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': type(exc).__name__ + ': ' + str(exc)[:300]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
