"""Independent market observations. Never writes the trading databases."""
from __future__ import annotations

import argparse
import contextlib
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
TZ = ZoneInfo("Asia/Shanghai")


def number(v):
    try:
        if v is None or str(v).strip() in ("", "-", "--", "nan", "None"):
            return None
        n = float(str(v).replace(",", "").replace("%", ""))
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def now():
    return datetime.now(TZ).isoformat()


def ak_call(name, kwargs, timeout=28):
    p = subprocess.run([sys.executable, str(Path(__file__)), "ak"], input=json.dumps({"name": name, "args": kwargs}),
                       text=True, encoding="utf-8", capture_output=True, timeout=timeout,
                       env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    try:
        result = json.loads(p.stdout)
    except ValueError:
        raise RuntimeError((p.stderr or "接口没有返回数据")[-220:]) from None
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "接口失败"))
    return result["data"]


def worker():
    request = json.load(sys.stdin)
    import requests
    original = requests.sessions.Session.request
    def timed(self, method, url, **kwargs):
        kwargs.setdefault("timeout", 9)
        return original(self, method, url, **kwargs)
    requests.sessions.Session.request = timed
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            import akshare as ak
            if request["name"].startswith("xiaomu_"):
                from market_panorama_extras import fetch_warrant_history, fetch_exchange_daily, fetch_dce_contracts
                from dce_public import instruments
                adapters={"xiaomu_warrant_history":fetch_warrant_history,"xiaomu_exchange_daily":fetch_exchange_daily,"xiaomu_dce_contracts":fetch_dce_contracts,"xiaomu_dce_contracts_public":instruments}
                value=adapters[request["name"]](**request["args"])
            else:
                value = getattr(ak, request["name"])(**request["args"])
        def serialize(v):
            if hasattr(v, "to_json"):
                return json.loads(v.to_json(orient="records", date_format="iso", force_ascii=False))
            if isinstance(v, dict):
                return {str(k): serialize(x) for k, x in v.items()}
            return v
        print(json.dumps({"ok": True, "data": serialize(value)}, ensure_ascii=False, allow_nan=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": type(e).__name__ + ": " + str(e)[:200]}, ensure_ascii=False))


def connect(folder):
    folder.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(folder / "market.sqlite", timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS records(kind TEXT, key TEXT, day TEXT, body TEXT, source TEXT, updated TEXT,
        PRIMARY KEY(kind,key,day));
      CREATE TABLE IF NOT EXISTS bars(product TEXT, contract TEXT, period TEXT, stamp TEXT, day TEXT,
        open REAL, high REAL, low REAL, close REAL, volume REAL, interest REAL, source TEXT, complete INTEGER,
        PRIMARY KEY(product,contract,period,stamp));
      CREATE INDEX IF NOT EXISTS bars_lookup ON bars(product,period,day);
      CREATE TABLE IF NOT EXISTS seats(product TEXT, contract TEXT, day TEXT, member TEXT, side TEXT,
        value REAL, change REAL, source TEXT, PRIMARY KEY(product,contract,day,member,side));
      CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT);
    """)
    return db


def save(db, kind, key, day, body, source):
    db.execute("INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?)", (kind, key, day, json.dumps(body, ensure_ascii=False, allow_nan=False), source, now()))


def save_bars(db, product, contract, period, rows, source):
    count = 0
    for r in rows:
        stamp = str(r.get("datetime", r.get("date", "")))[:19]
        if not stamp or len(stamp) < 10:
            continue
        day = stamp[:10]
        values = [number(r.get(k)) for k in ("open", "high", "low", "close")]
        if any(v is None or v <= 0 for v in values):
            continue
        o, h, l, c = values
        if h < max(o, c) or l > min(o, c) or l > h:
            continue
        complete = bool(r.get("complete", True))
        if period != "1d":
            # Sina timestamps label bar ends. Never call an unfinished bar completed.
            complete = datetime.fromisoformat(stamp).replace(tzinfo=TZ) <= datetime.now(TZ)
        db.execute("INSERT OR REPLACE INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            product, contract, period, stamp, day, o, h, l, c, number(r.get("volume")),
            number(r.get("openInterest", r.get("hold"))), source, int(complete)))
        count += 1
    return count


def seed(db, catalog):
    path = ROOT / ".runtime/market.json"
    data = json.loads(path.read_text("utf-8")) if path.exists() else {}
    for q in data.get("quotes", []):
        product = re.sub(r"\d+$", "", q["symbol"]).upper()
        rows = []
        for b in q.get("bars", []):
            if not b.get("complete", True):
                continue
            b = dict(b)
            if b.get("timeNs"):
                b["date"] = datetime.fromtimestamp(int(b["timeNs"]) / 1e9, TZ).date().isoformat()
            rows.append(b)
        save_bars(db, product, q["symbol"], "1d", rows, data.get("source", "小木盘后主连"))
        save(db, "eod", product, q.get("tradingDay", ""), {k: v for k, v in q.items() if k != "bars"}, data.get("source", "小木盘后主连"))
    db.commit()
    return len(data.get("quotes", []))


def quotes(db, catalog):
    import requests
    selected = [c for c in catalog if re.fullmatch(r"[A-Z]+\d{3,4}", c.get("contract") or "")]
    total = 0
    for start in range(0, len(selected), 35):
        batch = selected[start:start + 35]
        def provider(c):
            contract = c["contract"]
            match = re.fullmatch(r"([A-Z]+)(\d)(\d{2})", contract)
            if c.get("exchange") == "CZCE" and match:
                year = datetime.now(TZ).year
                delivery = year // 10 * 10 + int(match[2])
                if delivery < year - 5:
                    delivery += 10
                contract = match[1] + str(delivery)[-2:] + match[3]
            return contract
        response = requests.get("https://hq.sinajs.cn/list=" + ",".join("nf_" + provider(c) for c in batch),
                                headers={"Referer": "https://finance.sina.com.cn/", "User-Agent": "Mozilla/5.0"}, timeout=12)
        response.raise_for_status()
        response.encoding = "gb18030"
        raw = dict(re.findall(r'var\s+hq_str_nf_([A-Za-z0-9]+)="([^"]*)";', response.text))
        for c in batch:
            fields = next(csv.reader([raw.get(provider(c), "")]))
            if len(fields) < 18:
                continue
            financial = c.get("exchange") == "CFFEX"
            if financial:
                if len(fields) < 39:
                    continue
                last, volume, interest = number(fields[3]), number(fields[4]), number(fields[6])
                prev = number(fields[13])
                clock = fields[37].replace(":", "").zfill(6)
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fields[36]):
                    continue
                source_time = f"{fields[36]} {clock[:2]}:{clock[2:4]}:{clock[4:6]}"
            else:
                last, volume, interest = number(fields[8]), number(fields[14]), number(fields[13])
                prev = number(fields[10])
                clock = fields[1].zfill(6)
                source_time = f"{fields[17]} {clock[:2]}:{clock[2:4]}:{clock[4:6]}"
            if not last or last <= 0:
                continue
            day = source_time[:10]
            q = {"product": c["code"], "contract": c["contract"], "last": last, "volume": volume,
                 "interest": interest, "previousSettlement": prev, "quoteAt": source_time,
                 "receivedAt": now(), "changePct": (last / prev - 1) * 100 if prev and prev > 0 else None,
                 "changeBasis": "前结算价", "seriesType": "specific", "source": "新浪公开具体合约报价"}
            save(db, "quote", c["code"], day, q, q["source"])
            total += 1
        db.commit()
    if not total:
        raise ValueError("未取得有效具体合约报价")
    return total


def minutes(db, catalog, product=None):
    selected = [c for c in catalog if (not product or c["code"] == product) and c.get("contract")]
    tasks = [(c, period) for c in selected for period in ("30", "120")]
    errors, count = [], 0
    def fetch(item):
        c, period = item
        rows = ak_call("futures_zh_minute_sina", {"symbol": c["contract"], "period": period})
        return c, period, rows
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch, item): item for item in tasks}
        for future in as_completed(futures):
            c, period = futures[future]
            try:
                c, period, rows = future.result()
                if not rows:
                    raise ValueError("返回空数据")
                count += save_bars(db, c["code"], c["contract"], period + "m", rows, "AKShare/新浪分钟K线")
                db.commit()
            except Exception as e:
                errors.append({"product": c["code"], "period": period, "error": str(e)[:200]})
    return {"bars": count, "failures": errors}


def holdings(db, catalog, days):
    interfaces = {"SHFE": "get_shfe_rank_table", "INE": "get_shfe_rank_table", "DCE": "futures_dce_position_rank",
                  "CZCE": "get_rank_table_czce", "GFEX": "futures_gfex_position_rank", "CFFEX": "get_cffex_rank_table"}
    failures, count = [], 0
    for day in days:
        for exchange, interface in interfaces.items():
            products = {c["code"] for c in catalog if c.get("exchange") == exchange}
            if not products:
                continue
            args = {"date": day.replace("-", "")}
            if exchange != "CZCE":
                args["vars_list"] = sorted(products)
            try:
                daily = ak_call("get_futures_daily", {"start_date": day.replace("-", ""), "end_date": day.replace("-", ""), "market": exchange}, timeout=32)
                for row in daily:
                    contract = str(row.get("symbol", "")).upper()
                    price = number(row.get("settle"))
                    if re.fullmatch(r"[A-Z]+\d{3,4}", contract) and price and price > 0:
                        save(db, "settle", contract, day, {"price": price, "interest": number(row.get("open_interest")), "volume": number(row.get("volume")), "basis": "同日合约结算价"}, "AKShare/交易所日行情")
                db.commit()
            except Exception as e:
                failures.append({"exchange": exchange, "day": day, "kind": "price", "error": str(e)[:160]})
            try:
                raw = ak_call(interface, args, timeout=38)
                found = 0
                for contract, rows in (raw or {}).items():
                    contract = contract.upper()
                    if not re.fullmatch(r"[A-Z]+\d{3,4}", contract):
                        continue
                    product = re.sub(r"\d+$", "", contract)
                    if product not in products:
                        continue
                    for row in rows:
                        rank = number(row.get("rank"))
                        if rank is None or not 1 <= rank <= 20:
                            continue
                        for side, key, member in (("long", "long_open_interest", "long_party_name"), ("short", "short_open_interest", "short_party_name")):
                            name = str(row.get(member, "")).strip()
                            val = number(row.get(key))
                            if name in ("", "合计", "总计", "nan", "None") or val is None:
                                continue
                            db.execute("INSERT OR REPLACE INTO seats VALUES(?,?,?,?,?,?,?,?)", (product, contract, day, name, side, val, number(row.get(key + "_chg")), "AKShare/" + interface))
                            found += 1
                if not found:
                    raise ValueError("未取得该所可解析的具体合约持仓排名")
                count += found
                db.commit()
                save(db, "coverage", exchange, day, {"exchange": exchange, "day": day, "rows": found, "status": "available"}, interface)
            except Exception as e:
                failures.append({"exchange": exchange, "day": day, "error": str(e)[:200]})
                save(db, "coverage", exchange, day, {"exchange": exchange, "day": day, "rows": 0, "status": "failed", "error": str(e)[:200]}, interface)
                if exchange == "DCE":
                    fallback = dce_fallback(db, catalog, [day])
                    count += fallback["rows"]
                    failures.extend(fallback["failures"])
            db.commit()
    return {"rows": count, "failures": failures}


def dce_fallback(db, catalog, days):
    selected = [c for c in catalog if c.get("exchange") == "DCE" and c.get("contract")]
    failures, found = [], 0
    def fetch(c):
        daily = ak_call("futures_zh_daily_sina", {"symbol": c["contract"]})
        ranks = []
        for day in days:
            for side, label in (("long", "多单持仓"), ("short", "空单持仓")):
                rows = ak_call("futures_hold_pos_sina", {"symbol": label, "contract": c["contract"], "date": day.replace("-", "")})
                ranks.extend((day, side, label, r) for r in rows)
        return c, daily, ranks
    day_counts = {d: 0 for d in days}
    with ThreadPoolExecutor(max_workers=3) as pool:
        tasks = {pool.submit(fetch, c): c for c in selected}
        for future in as_completed(tasks):
            c = tasks[future]
            try:
                c, daily, ranks = future.result()
                for r in daily:
                    price = number(r.get("settle"))
                    if price and price > 0 and r.get("date") in days:
                        save(db, "settle", c["contract"], r["date"], {"price": price, "interest": number(r.get("hold")), "volume": number(r.get("volume")), "basis": "同日具体合约结算价"}, "AKShare/新浪转载日行情")
                for day, side, label, r in ranks:
                    rank, value = number(r.get("名次")), number(r.get(label))
                    member = str(r.get("会员简称", "")).strip()
                    if rank and 1 <= rank <= 20 and value is not None and member and member not in ("合计", "总计"):
                        db.execute("INSERT OR REPLACE INTO seats VALUES(?,?,?,?,?,?,?,?)", (c["code"], c["contract"], day, member, side, value, number(r.get("比上交易增减")), "AKShare/新浪转载大商所当前核验主力排名"))
                        found += 1
                        day_counts[day] += 1
                db.commit()
            except Exception as e:
                failures.append({"exchange": "DCE", "product": c["code"], "error": str(e)[:180]})
    for day, count in day_counts.items():
        save(db, "coverage", "DCE", day, {"exchange": "DCE", "day": day, "rows": count, "status": "partial" if count else "failed", "error": "备用转载来源，仅当前核验主力合约，非全月份覆盖"}, "AKShare/新浪转载")
    db.commit()
    return {"rows": found, "failures": failures}


def fees(db):
    source = "AKShare/九期网费用参考"
    try:
        rows = ak_call("futures_comm_info", {"symbol": "所有"}, timeout=38)
        if not rows:
            raise ValueError("返回空表")
    except Exception:
        raw = ak_call("futures_fees_info", {}, timeout=38)
        source = "OpenCTP账户费用参考（可能含其账户加收，非交易所标准）"
        rows = []
        for r in raw:
            rows.append({**r, "现价": r.get("最新价"), "手续费更新时间": r.get("更新时间"), "价格更新时间": r.get("更新时间"),
                         "保证金-买开": number(r.get("做多保证金率")) * 100 if number(r.get("做多保证金率")) is not None else None,
                         "保证金-卖开": number(r.get("做空保证金率")) * 100 if number(r.get("做空保证金率")) is not None else None,
                         "费用来源类型": "OpenCTP账户参考"})
    if not rows:
        raise ValueError("手续费接口返回空表")
    count = 0
    for r in rows:
        contract = str(r.get("合约代码", "")).upper()
        if not re.fullmatch(r"[A-Z]+\d{3,4}", contract):
            continue
        day = str(r.get("手续费更新时间", ""))[:10]
        save(db, "fee", contract, day, r, source)
        count += 1
    db.commit()
    return count


def prices(db, catalog):
    days = [r[0] for r in db.execute("SELECT DISTINCT day FROM bars WHERE period='1d' ORDER BY day DESC LIMIT 5")]
    count, failures = 0, []
    for exchange in ("SHFE", "INE", "CZCE", "GFEX", "CFFEX"):
        try:
            rows = ak_call("get_futures_daily", {"start_date": min(days).replace("-", ""), "end_date": max(days).replace("-", ""), "market": exchange}, timeout=60)
            for r in rows:
                contract = str(r.get("symbol", "")).upper()
                date = str(r.get("date", ""))[:10]
                if "-" not in date and len(date) == 8:
                    date = date[:4] + "-" + date[4:6] + "-" + date[6:]
                price = number(r.get("settle"))
                if re.fullmatch(r"[A-Z]+\d{3,4}", contract) and date in days and price and price > 0:
                    save(db, "settle", contract, date, {"price": price, "interest": number(r.get("open_interest")), "volume": number(r.get("volume")), "basis": "同日合约结算价"}, "AKShare/交易所日行情")
                    count += 1
            db.commit()
        except Exception as e:
            failures.append({"exchange": exchange, "error": str(e)[:180]})
    for c in [c for c in catalog if c.get("exchange") == "DCE" and c.get("contract")]:
        try:
            rows = ak_call("futures_zh_daily_sina", {"symbol": c["contract"]})
            for r in rows:
                if r.get("date") in days and number(r.get("settle")):
                    save(db, "settle", c["contract"], r["date"], {"price": number(r["settle"]), "interest": number(r.get("hold")), "volume": number(r.get("volume")), "basis": "同日具体合约结算价"}, "AKShare/新浪转载日行情")
                    count += 1
            db.commit()
        except Exception as e:
            failures.append({"product": c["code"], "error": str(e)[:180]})
    return {"rows": count, "failures": failures}


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["seed", "quotes", "closes", "minutes", "holdings", "fees", "full", "dce", "prices", "supplement"])
    parser.add_argument("--folder", required=True)
    parser.add_argument("--product")
    args = parser.parse_args()
    folder = Path(args.folder).resolve()
    if not folder.is_relative_to(ROOT):
        raise ValueError("市场缓存必须保存在小木项目内")
    catalog = json.loads((folder / "catalog.json").read_text("utf-8"))
    db = connect(folder)
    results, errors = {}, []
    started = now()
    modes = ["seed", "quotes", "closes", "fees", "supplement", "holdings", "minutes"] if args.mode == "full" else [args.mode]
    try:
        for mode in modes:
            print(json.dumps({"stage": mode, "startedAt": started}), flush=True)
            try:
                if mode == "seed":
                    result = seed(db, catalog)
                elif mode == "quotes":
                    result = quotes(db, catalog)
                elif mode == "closes":
                    from overview_closes import collect_closes
                    result = collect_closes(db, catalog, ak_call, save, now, args.product)
                elif mode == "fees":
                    result = fees(db)
                elif mode == "supplement":
                    from market_panorama_supplement import supplement
                    target = db.execute("SELECT MAX(day) FROM bars WHERE period='1d'").fetchone()[0]
                    result = supplement(db, catalog, target, ak_call, save, now) if target else 0
                elif mode == "minutes":
                    result = minutes(db, catalog, args.product)
                elif mode == "dce":
                    days = [r[0] for r in db.execute("SELECT DISTINCT day FROM bars WHERE period='1d' ORDER BY day DESC LIMIT 5")]
                    result = dce_fallback(db, catalog, list(reversed(days)))
                elif mode == "prices":
                    result = prices(db, catalog)
                else:
                    days = [r[0] for r in db.execute("SELECT DISTINCT day FROM bars WHERE period='1d' ORDER BY day DESC LIMIT 5")]
                    result = holdings(db, catalog, list(reversed(days)))
                results[mode] = result
            except Exception as e:
                errors.append({"stage": mode, "error": str(e)[:230]})
            db.commit()
            print(json.dumps({"stage": mode, "result": results.get(mode), "errors": errors}, ensure_ascii=False), flush=True)
    finally:
        db.close()
    print(json.dumps({"finishedAt": now(), "startedAt": started, "results": results, "errors": errors}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "ak":
        worker()
    else:
        run()
