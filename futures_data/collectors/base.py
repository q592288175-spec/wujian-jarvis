from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
class Collector(ABC):
    """Read-only collector boundary. No broker/account/order implementation."""
    @abstractmethod
    def collect(self, **kwargs: Any) -> list[dict[str, Any]]:
        raise NotImplementedError
