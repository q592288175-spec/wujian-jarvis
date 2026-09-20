from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import yaml

@dataclass(frozen=True)
class Settings:
    values: dict[str, Any]
    root: Path
    @property
    def products(self) -> dict[str, dict[str, str]]:
        return self.values['products']
    @property
    def db_path(self) -> Path:
        path = Path(self.values['db_path'])
        return path if path.is_absolute() else self.root / path

def load(path: Path | None = None) -> Settings:
    path = path or Path(__file__).parent / 'config/config.yaml'
    values = yaml.safe_load(path.read_text(encoding='utf-8'))
    if not values.get('products') or float(values['poll_minutes']) < 1:
        raise ValueError('品种不能为空，轮询必须至少1分钟')
    if not .5 <= float(values['request_interval_seconds']) <= 10:
        raise ValueError('请求间隔须至少0.5秒')
    return Settings(values, Path.cwd())
