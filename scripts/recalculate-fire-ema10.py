"""Recalculate a saved closing snapshot without replacing its original evidence.

Only the ten-period indicator changes. Prices, liquidity, structures and breakout
evidence stay at the original completed trading day. Continuous monthly fallback
is downloaded and snapshotted only when the concrete contract lacks 11 months.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
from pathlib import Path

import pandas as pd
from fire_scan import INDICATOR, load_scanner


def recalculate(path, root):
    source = json.loads(path.read_text(encoding="utf-8"))
    cutoff = source.get("data_date") or source["scan_date"]
    scanner = load_scanner()
    folder = root / ".runtime" / "ema10-recalculation" / datetime.now().strftime("%Y%m%d-%H%M%S")
    folder.mkdir(parents=True, exist_ok=False)
    evidence = []

    def transform(original):
        row = {**original, "indicator": INDICATOR}
        if not row.get("ok"):
            return row
        try:
            saved = root / ".runtime/fire-scan/contract-bars" / (row["main_contract"] + ".json")
            raw = saved.read_bytes()
            (folder / saved.name).write_bytes(raw)
            evidence.append({"path": str(saved), "sha256": hashlib.sha256(raw).hexdigest()})
            daily = pd.DataFrame(json.loads(raw))
            daily["date"] = pd.to_datetime(daily["date"])
            daily = daily[daily["date"].dt.strftime("%Y-%m-%d") <= cutoff].sort_values("date").drop_duplicates("date", keep="last")
            if daily.empty or daily.iloc[-1]["date"].date().isoformat() != cutoff:
                raise ValueError("具体合约历史未覆盖原扫描截止")
            if float(daily.iloc[-1]["close"]) != float(row["latest_bar"]["close"]):
                raise ValueError("已存历史与原收盘快照不一致，不能静默替换")
            day = daily["close"].ewm(span=10, adjust=False, min_periods=10).mean()
            weekly = scanner.aggregate_bars(daily, "W-FRI", False, pd.Timestamp(cutoff).date())
            monthly = scanner.aggregate_bars(daily, "M", False, pd.Timestamp(cutoff).date())
            row["month_indicator_source"] = "当前具体主力月收盘序列"
            if len(monthly) < 11:
                continuous = scanner.fetch_sina(row["code"] + "0")
                continuous = continuous[continuous["date"].dt.strftime("%Y-%m-%d") <= cutoff]
                name = row["code"] + "0.json"
                text = continuous.to_json(orient="records", date_format="iso", force_ascii=False)
                (folder / name).write_text(text, encoding="utf-8")
                evidence.append({"path": name, "sha256": hashlib.sha256(text.encode()).hexdigest()})
                long_monthly = scanner.aggregate_bars(continuous, "M", False, pd.Timestamp(cutoff).date())
                # Correct the dynamic month before recomputing its EMA recurrence.
                long_monthly.loc[monthly.index[-1], "close"] = float(monthly.iloc[-1]["close"])
                long_monthly["ma10"] = long_monthly["close"].ewm(span=10, adjust=False, min_periods=10).mean()
                monthly = long_monthly
                row["month_indicator_source"] = "具体合约不足11个月，沿用原扫描的主力连续月线回退并校正动态当月；换月需复核"
            for period, values in [("day", day), ("week", weekly["ma10"]), ("month", monthly["ma10"])]:
                if len(values) < 11 or pd.isna(values.iloc[-2]):
                    raise ValueError(period + " EMA10相邻样本不足")
                current, previous = float(values.iloc[-1]), float(values.iloc[-2])
                row[period + "_ma10"] = current
                row["previous_" + period + "_ma10"] = previous
                row[period + "_direction"] = scanner.direction(current, previous)
            row["technical_modes"] = scanner.classify_modes(row)
            row["modes"] = row["technical_modes"] if row.get("liquidity_ok") else scanner.apply_liquidity(row["technical_modes"])
            # Old strength annotations used SMA. The current UI computes rankings anew.
            row.pop("attention", None)
            return row
        except Exception as error:
            row.update(ok=False, error="EMA10重算失败：" + str(error), technical_modes={}, modes={})
            for period in ["month", "week", "day"]:
                row[period + "_ma10"] = None
                row["previous_" + period + "_ma10"] = None
                row[period + "_direction"] = "数据不足"
            return row

    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(transform, source["rows"]))
    if not any(r.get("ok") for r in rows):
        raise RuntimeError("EMA重算全部失败，原结果保留")
    result = {**source, "rows": rows, "indicator": INDICATOR,
              "indicator_rule_version": "2026-11-04-ema10-v1",
              "recalculatedAt": datetime.now().astimezone().isoformat(),
              "recalculatedFrom": str(path), "indicatorEvidence": str(folder)}
    # Original counts and attention summaries must never masquerade as EMA results.
    for key in ["counts", "attention_counts", "attention_parameters"]:
        result.pop(key, None)
    output = path.with_name(path.stem.split("_ema10")[0] + "_ema10.json")
    if output.exists():
        raise FileExistsError("已有EMA快照，保留原文件：" + str(output))
    (folder / "manifest.json").write_text(json.dumps({"source": str(path), "files": evidence}, ensure_ascii=False, indent=2), encoding="utf-8")
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"output": str(output), "date": cutoff, "success": sum(bool(r.get("ok")) for r in rows),
                      "failures": [{"code": r["code"], "error": r.get("error")} for r in rows if original_ok(source, r) and not r.get("ok")]}, ensure_ascii=False))


def original_ok(source, row):
    return any(r["code"] == row["code"] and r.get("ok") for r in source["rows"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    recalculate(args.snapshot.resolve(), Path(__file__).resolve().parents[1])
