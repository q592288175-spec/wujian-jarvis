import importlib.util
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pandas as pd

spec = importlib.util.spec_from_file_location("fire_runner", Path(__file__).resolve().parents[1] / "scripts" / "fire_scan.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
DAY = date(2026, 10, 8)


def bars():
    days = pd.bdate_range("2025-01-01", "2026-09-30")
    return pd.DataFrame([{"date": day, "open": 100 + i, "high": 102 + i, "low": 99 + i, "close": 101 + i, "volume": 30000, "open_interest": 40000} for i, day in enumerate(days)])


def close(symbol="AA2611", value=600, day="2026-10-08"):
    return {"symbol": symbol, "date": pd.Timestamp(day), "open": value, "high": value + 2, "low": value - 1, "close": value + 1, "volume": 35000, "open_interest": 45000, "source": "isolated fixture", "provisional": False}


class MonthBridgeTests(unittest.TestCase):
    def setUp(self):
        self.scanner = runner.load_scanner()
        self.history = bars()
        self.scanner.fetch_sina = lambda symbol: self.history.copy()
        self.product = {"code": "AA", "name": "fixture", "sector": "fixture", "exchange": "SHFE"}

    def analyze(self, snapshot=None):
        return self.scanner.analyze(self.product, "AA2611", {}, DAY, snapshot)

    def test_missing_month_is_reproduced_without_close(self):
        result = self.analyze(close(day="2026-09-30"))
        self.assertFalse(result["ok"])

    def test_current_close_recovers_month_week_day(self):
        result = self.analyze(close())
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["month_period"], "2026-10")
        self.assertEqual(result["day_period"], "2026-10-08")
        self.assertEqual(result["latest_bar"]["close"], 601)
        self.assertIn("dynamic_month_bridge", result)

    def test_complete_continuous_history_produces_same_result(self):
        bridged = self.analyze(close())
        self.history = runner.bridge_current_month(self.history, close(), DAY)
        complete = self.analyze(close())
        bridged.pop("dynamic_month_bridge")
        self.assertEqual(bridged, complete)
        self.assertNotIn("dynamic_month_bridge", complete)

    def test_wrong_contract_cannot_bridge(self):
        result = self.analyze(close(symbol="BB2611"))
        self.assertFalse(result["ok"])
        self.assertIn("主力连续缺少当前月数据", result["error"])

    def test_invalid_close_cannot_bridge(self):
        result = self.analyze({**close(), "close": -1})
        self.assertFalse(result["ok"])

    def test_merged_specific_close_bridges_without_snapshot(self):
        current = runner.bridge_current_month(self.history, close(), DAY)
        self.scanner.fetch_sina = lambda symbol: (self.history if symbol == "AA0" else current).copy()
        root = Path(__file__).resolve().parents[1] / ".runtime" / "test-fire-month"
        root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=root) as cache:
            result = self.scanner.analyze(self.product, "AA2611", {}, DAY, cache_dir=Path(cache))
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["dynamic_month_bridge"]["date"], "2026-10-08")

    def test_quote_without_symbol_uses_callers_contract_mapping(self):
        snapshot = close()
        snapshot.pop("symbol")
        self.assertTrue(self.analyze(snapshot)["ok"])

    def test_historical_months_and_input_unchanged(self):
        before = self.history.copy(deep=True)
        bridged = runner.bridge_current_month(self.history, close(), DAY)
        pd.testing.assert_frame_equal(before, self.history)
        pd.testing.assert_frame_equal(before, bridged.iloc[:-1].drop(columns=["symbol", "source", "provisional"]))

    def test_stale_or_future_snapshot_not_used(self):
        for day in ["2026-09-30", "2026-10-09"]:
            self.assertIs(runner.bridge_current_month(self.history, close(day=day), DAY), self.history)

    def test_parallel_contracts_do_not_share_context(self):
        def analyze(symbol):
            product = {**self.product, "code": symbol[:2]}
            return self.scanner.analyze(product, symbol, {}, DAY, close(symbol=symbol))
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(analyze, ["AA2611", "BB2611", "CC2611", "DD2611"] * 3))
        for result in results:
            self.assertTrue(result["ok"], result)
            self.assertEqual(result["dynamic_month_bridge"]["symbol"], result["main_contract"])


class MainMappingTests(unittest.TestCase):
    def test_one_failed_exchange_does_not_drop_others(self):
        import akshare as ak
        scanner = runner.load_scanner()
        def contracts(exchange):
            if exchange == "dce":
                raise ValueError("isolated exchange failure")
            return {"shfe": "cu2611", "czce": "MA2701", "cffex": "IF2610", "gfex": "LC2611"}[exchange]
        with patch.object(ak, "match_main_contract", side_effect=contracts), patch.object(runner, "wenhua_mains", return_value={"MA": "MA2611"}), patch("time.sleep"):
            mapping = scanner.resolve_main_contracts({"main_contract_overrides": {"LC": "LC2701"}}, retries=1)
        self.assertEqual(mapping, {"CU": "CU2611", "MA": "MA2611", "IF": "IF2610", "LC": "LC2701"})


if __name__ == "__main__":
    unittest.main()
