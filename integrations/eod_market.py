"""Free end-of-day futures collector for review; no accounts or order access."""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / ".runtime"
DB_PATH = RUNTIME / "eod-market.sqlite"
SNAPSHOT_PATH = RUNTIME / "market.json"
STATUS_PATH = RUNTIME / "eod-refresh.json"
CONFIG_PATH = ROOT / "futures_data" / "config" / "config.yaml"
SHANGHAI = ZoneInfo("Asia/Shanghai")


def finite(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def date_text(value: Any) -> str | None:
    try:
        return value.date().isoformat() if hasattr(value, "date") else date.fromisoformat(str(value)[:10]).isoformat()
    except (TypeError, ValueError):
        return None


def time_ns(day: str) -> str:
    stamp = datetime.fromisoformat(day).replace(tzinfo=SHANGHAI)
    return str(int(stamp.timestamp() * 1_000_000_000))


def normalize_continuous(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        day = date_text(row.get("date", row.get("日期")))
        values = {
            "open": finite(row.get("open", row.get("开盘价"))),
            "high": finite(row.get("high", row.get("最高价"))),
            "low": finite(row.get("low", row.get("最低价"))),
            "close": finite(row.get("close", row.get("收盘价"))),
            "volume": finite(row.get("volume", row.get("成交量"))),
            "openInterest": finite(row.get("openInterest", row.get("hold", row.get("持仓量")))),
            "settle": finite(row.get("settle", row.get("动态结算价"))),
        }
        if not day or any(values[key] is None or values[key] <= 0 for key in ("open", "high", "low", "close")):
            continue
        if values["high"] < max(values["open"], values["close"]) or values["low"] > min(values["open"], values["close"]):
            continue
        normalized.append({"date": day, **values})
    return sorted({row["date"]: row for row in normalized}.values(), key=lambda row: row["date"])


def contract_rows(rows: list[dict[str, Any]], product: str) -> dict[str, list[dict[str, Any]]]:
    code = product.upper()
    days: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        variety = str(row.get("variety", "")).upper()
        symbol = str(row.get("symbol", "")).upper()
        day = date_text(row.get("date"))
        volume, open_interest = finite(row.get("volume")), finite(row.get("open_interest"))
        if variety != code or not day or not symbol or volume is None or open_interest is None:
            continue
        days.setdefault(day, []).append({"symbol": symbol, "date": day, "close": finite(row.get("close")), "volume": volume, "openInterest": open_interest})
    return days


def select_actual_main(rows: list[dict[str, Any]], product: str, previous: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """文华主力规则（文华技术人员公布的主力切换机制）：
    1. 每个品种只有一个主力合约；
    2. 当日成交量和持仓量都最大的合约成为新主力，下一交易日切换；
    3. 未出现这样的合约之前，维持原主力；
    4. 原主力的成交量和持仓量都不是最大时让位，新主力取成交量最大的合约。
    previous 是上次处理到的状态（symbol、stateDate），只回放其后的交易日；
    没有状态时从窗口内最近一次量仓同时最大的交易日起步，窗口内没有则取首日持仓量最大合约。
    返回下一交易日生效的主力，以及它在最新交易日的收盘、成交量和持仓量。"""
    days = contract_rows(rows, product)
    leaders = {}
    for day, candidates in days.items():
        by_volume = max(candidates, key=lambda r: (r["volume"], r["openInterest"], r["symbol"]))["symbol"]
        by_interest = max(candidates, key=lambda r: (r["openInterest"], r["volume"], r["symbol"]))["symbol"]
        leaders[day] = (by_volume, by_interest)
    ordered = sorted(days)
    current = previous.get("symbol") if previous else None
    state_date = previous.get("stateDate") if previous else None
    if current is None and ordered:
        # 首次没有历史状态：从窗口内最近一次“量仓同时最大”的交易日起步；一次都没有时取首日持仓量最大合约。
        both = [day for day in ordered if leaders[day][0] == leaders[day][1]]
        start = both[-1] if both else ordered[0]
        current, state_date = (leaders[start][0], start) if both else (leaders[start][1], None)
    for day in (d for d in ordered if not state_date or d > state_date):
        by_volume, by_interest = leaders[day]
        if current not in (by_volume, by_interest):
            current = by_volume  # 第4条：原主力量仓都不是最大（含已到期退市），取成交量最大
        elif by_volume == by_interest:
            current = by_volume  # 第2条：量仓同时最大者成为主力
        # 第3条：其余情况维持原主力
        state_date = day
    if current is None:
        return None
    latest = max(days) if days else None
    today = next((r for r in days.get(latest, []) if r["symbol"] == current), None) if latest else None
    if today:
        return {**today, "stateDate": state_date, "rule": "wenhua"}
    if previous and previous.get("symbol") == current:
        return {**previous, "stateDate": state_date or previous.get("stateDate"), "rule": "wenhua"}
    return {"symbol": current, "date": latest, "close": None, "volume": None, "openInterest": None, "stateDate": state_date, "rule": "wenhua"}


def previous_main(connection: sqlite3.Connection, product: str) -> dict[str, Any] | None:
    row = connection.execute("SELECT contract,date,close,volume,open_interest,state_date FROM actual_main WHERE product=? AND rule='wenhua'", (product,)).fetchone()
    return {"symbol": row[0], "date": row[1], "close": row[2], "volume": row[3], "openInterest": row[4], "stateDate": row[5]} if row else None


def load_config() -> dict[str, Any]:
    return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))


def database() -> sqlite3.Connection:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""CREATE TABLE IF NOT EXISTS eod_bars (
        product TEXT NOT NULL, date TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL,
        low REAL NOT NULL, close REAL NOT NULL, volume REAL, open_interest REAL, settle REAL,
        source TEXT NOT NULL, collected_at TEXT NOT NULL, PRIMARY KEY(product,date)
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS actual_main (
        product TEXT PRIMARY KEY, contract TEXT NOT NULL, date TEXT NOT NULL, close REAL,
        volume REAL, open_interest REAL, source TEXT NOT NULL, collected_at TEXT NOT NULL
    )""")
    columns = {row[1] for row in connection.execute("PRAGMA table_info(actual_main)")}
    for column in ("rule", "state_date"):
        if column not in columns:
            connection.execute(f"ALTER TABLE actual_main ADD COLUMN {column} TEXT")
    return connection


def official_rows(ak: Any, exchanges: set[str], start: str, end: str) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, str]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    failures: list[dict[str, str]] = []
    for exchange in sorted(exchanges):
        try:
            frame = ak.get_futures_daily(start_date=start, end_date=end, market=exchange)
            result[exchange] = frame.to_dict("records")
        except Exception:
            failures.append({"kind": "official", "exchange": exchange, "reason": "交易所日线暂未取得"})
    return result, failures


def build_quote(product: str, product_config: dict[str, Any], bars: list[dict[str, Any]], actual: dict[str, Any] | None) -> dict[str, Any]:
    latest, previous = bars[-1], bars[-2]
    close, pre_close = latest["close"], previous["close"]
    return {
        "symbol": product.upper() + "0",
        "requestedSymbol": product.upper() + "0",
        "actualContract": actual["symbol"] if actual else None,
        "actualContractDate": actual["date"] if actual else None,
        "name": product_config["name"] + "主力连续",
        "exchange": product_config["exchange"],
        "quoteTime": latest["date"] + " 15:00:00",
        "tradingDay": latest["date"],
        "tradingDayStatus": "completed-eod",
        "last": close,
        "close": close,
        "preClose": pre_close,
        "preSettlement": previous.get("settle"),
        "changePct": (close / pre_close - 1) * 100 if pre_close else None,
        "changeBasis": "previous_completed_close",
        "volume": latest.get("volume"),
        "openInterest": latest.get("openInterest"),
        "bid": None,
        "ask": None,
        "average": None,
        "intraday": {"points": []},
        "seriesType": "main_continuous",
        "quality": {"timeStatus": "completed-eod", "priceBasis": "completed_close", "changeBasis": "previous_completed_close"},
        "bars": [{
            "timeNs": time_ns(row["date"]), "open": row["open"], "high": row["high"],
            "low": row["low"], "close": row["close"], "volume": row.get("volume"),
            "openInterest": row.get("openInterest"), "complete": True,
        } for row in bars[-1500:]],
    }


def collect(products: list[str] | None = None, pause: float = 0.2) -> dict[str, Any]:
    import akshare as ak

    config = load_config()
    selected = products or list(config["products"])
    selected = [code.lower() for code in selected if code.lower() in config["products"]]
    now = datetime.now(timezone.utc).isoformat()
    probe = database()
    try:
        known = {row[0] for row in probe.execute("SELECT product FROM actual_main WHERE rule='wenhua'")}
    finally:
        probe.close()
    # 文华主力需要历史状态；有品种首次建立状态时回看60天，以找到最近一次量仓同时最大的交易日。
    lookback = (datetime.now(SHANGHAI).date() - timedelta(days=12 if set(selected) <= known else 60)).strftime("%Y%m%d")
    today = datetime.now(SHANGHAI).date().strftime("%Y%m%d")
    exchanges = {config["products"][code]["exchange"] for code in selected}
    official, failures = official_rows(ak, exchanges, lookback, today)
    connection = database()
    quotes: list[dict[str, Any]] = []
    try:
        for code in selected:
            product_config = config["products"][code]
            try:
                frame = ak.futures_zh_daily_sina(symbol=code.upper() + "0")
                bars = normalize_continuous(frame.to_dict("records"))
                if len(bars) < 2:
                    raise ValueError("完成日K不足")
                actual = select_actual_main(official.get(product_config["exchange"], []), code, previous_main(connection, code))
                connection.executemany(
                    """INSERT INTO eod_bars(product,date,open,high,low,close,volume,open_interest,settle,source,collected_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product,date) DO UPDATE SET
                    open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,
                    volume=excluded.volume,open_interest=excluded.open_interest,settle=excluded.settle,
                    source=excluded.source,collected_at=excluded.collected_at""",
                    [(code, row["date"], row["open"], row["high"], row["low"], row["close"], row.get("volume"), row.get("openInterest"), row.get("settle"), "AKShare futures_zh_daily_sina / 新浪主力连续", now) for row in bars],
                )
                if actual:
                    connection.execute(
                        """INSERT INTO actual_main(product,contract,date,close,volume,open_interest,source,collected_at,rule,state_date)
                        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product) DO UPDATE SET contract=excluded.contract,date=excluded.date,
                        close=excluded.close,volume=excluded.volume,open_interest=excluded.open_interest,source=excluded.source,collected_at=excluded.collected_at,
                        rule=excluded.rule,state_date=excluded.state_date""",
                        (code, actual["symbol"], actual["date"], actual["close"], actual["volume"], actual["openInterest"], "AKShare get_futures_daily / 交易所公开日线；文华主力规则", now, "wenhua", actual["stateDate"]),
                    )
                quotes.append(build_quote(code, product_config, bars, actual))
            except Exception:
                failures.append({"kind": "continuous", "product": code, "reason": "主力连续日线暂未取得"})
            connection.commit()
            if pause:
                time.sleep(pause)
    finally:
        connection.close()
    snapshot = {
        "schemaVersion": 1,
        "source": "AKShare免费盘后数据（新浪主力连续 + 交易所公开日线）",
        "status": "eod-ready" if quotes else "unavailable",
        "receivedAt": now,
        "dataMode": "completed-eod",
        "quotes": quotes,
        "failures": failures,
        "error": None if quotes else "免费盘后数据暂未取得",
        "permission": False,
    }
    persist_snapshot(snapshot)
    return snapshot


def persist_snapshot(snapshot: dict[str, Any]) -> None:
    """Publish usable data only; an empty refresh must not erase the last successful snapshot."""
    RUNTIME.mkdir(parents=True, exist_ok=True)
    quotes = snapshot.get("quotes", [])
    if quotes:
        temp = SNAPSHOT_PATH.with_suffix(".tmp")
        temp.write_text(json.dumps(snapshot, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        temp.replace(SNAPSHOT_PATH)
    status = {"status": snapshot["status"], "finishedAt": datetime.now(timezone.utc).isoformat(),
              "quotes": len(quotes), "failures": len(snapshot.get("failures", [])),
              "retainedPreviousSnapshot": not quotes and SNAPSHOT_PATH.exists()}
    if not quotes:
        status["error"] = "本次未取得有效盘后行情；" + ("已保留上次缓存，行情日期以缓存标注为准" if SNAPSHOT_PATH.exists() else "尚无可用缓存")
    STATUS_PATH.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--products", default="")
    parser.add_argument("--no-pause", action="store_true")
    args = parser.parse_args()
    products = [item.strip().lower() for item in args.products.split(",") if item.strip()] or None
    try:
        snapshot = collect(products, 0 if args.no_pause else 0.2)
        print(json.dumps({"status": snapshot["status"], "quotes": len(snapshot["quotes"]), "failures": len(snapshot["failures"])}, ensure_ascii=False))
        return 0 if snapshot["quotes"] else 1
    except Exception:
        RUNTIME.mkdir(parents=True, exist_ok=True)
        STATUS_PATH.write_text(json.dumps({"status": "failed", "finishedAt": datetime.now(timezone.utc).isoformat(), "error": "盘后刷新失败，已保留最近成功缓存"}, ensure_ascii=False), encoding="utf-8")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
