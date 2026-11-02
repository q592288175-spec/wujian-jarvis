"""Project-local compatibility for the read-only scanner's dynamic month."""
from datetime import date, timedelta
from functools import wraps
import importlib.util
import os
import re
import sqlite3
from pathlib import Path
from threading import local

import pandas as pd


def bridge_current_month(frame, snapshot, as_of):
    if not snapshot or frame.empty:
        return frame
    try:
        day = pd.Timestamp(snapshot["date"])
        if day.date() != as_of:
            return frame
        period = day.to_period("M")
        if period in frame["date"].dt.to_period("M").values:
            return frame
    except (KeyError, ValueError, TypeError):
        return frame
    return pd.concat([frame, pd.DataFrame([{**snapshot, "date": day}])], ignore_index=True).sort_values("date").reset_index(drop=True)


def install_month_bridge(scanner):
    from eod_sources import valid_bar

    context = local()
    analyze = scanner.analyze
    aggregate = scanner.aggregate_bars
    merge = scanner.merge_close

    @wraps(merge)
    def merge_close(frame, contract, snapshot, cache_dir, as_of):
        merged = merge(frame, contract, snapshot, cache_dir, as_of)
        if not merged.empty:
            latest = valid_bar(merged.iloc[-1].to_dict())
            if latest:
                context.snapshot = {**latest, "symbol": contract, "source": latest.get("source") if isinstance(latest.get("source"), str) else "新浪历史日K"}
        return merged

    @wraps(aggregate)
    def aggregate_bars(daily, frequency, completed_only, as_of):
        snapshot = getattr(context, "snapshot", None)
        if frequency == "M" and not completed_only and snapshot:
            bridged = bridge_current_month(daily, snapshot, as_of)
            if bridged is not daily:
                context.bridge = {"date": pd.Timestamp(snapshot["date"]).date().isoformat(), "source": snapshot.get("source"), "symbol": snapshot["symbol"]}
                daily = bridged
        return aggregate(daily, frequency, completed_only, as_of)

    @wraps(analyze)
    def analyze_with_month(product, main_contract, config, as_of, closing_snapshot=None, cache_dir=None, no_trade_source=None):
        snapshot = valid_bar(closing_snapshot) if closing_snapshot else None
        context.snapshot = {**snapshot, "symbol": main_contract} if snapshot and (not snapshot.get("symbol") or str(snapshot["symbol"]).upper() == str(main_contract).upper()) else None
        context.bridge = None
        try:
            result = analyze(product, main_contract, config, as_of, closing_snapshot, cache_dir, no_trade_source)
            if context.bridge and result.get("ok"):
                result["dynamic_month_bridge"] = context.bridge
            return result
        finally:
            context.snapshot = None
            context.bridge = None

    scanner.aggregate_bars = aggregate_bars
    scanner.merge_close = merge_close
    scanner.analyze = analyze_with_month


def wenhua_mains(db_path, today=None, max_age_days=20):
    """读取盘后刷新按文华主力规则维护的具体主力；郑商所三位月份补成四位，过期映射不用。"""
    if not Path(db_path).exists():
        return {}
    cutoff = ((today or date.today()) - timedelta(days=max_age_days)).isoformat()
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = connection.execute("SELECT product, contract, date FROM actual_main WHERE rule='wenhua'").fetchall()
    except sqlite3.Error:
        return {}
    finally:
        connection.close()
    mapping = {}
    for product, contract, day in rows:
        matched = re.match(r"([A-Za-z]+)(\d{3,4})$", str(contract or ""))
        if matched and str(day) >= cutoff:
            digits = matched.group(2)
            mapping[product.upper()] = matched.group(1).upper() + ("2" + digits if len(digits) == 3 else digits)
    return mapping


def install_wenhua_mains(scanner, db_path):
    """2026-10-11本人确认：具体主力按文华规则认定。文华映射优先，取不到的品种沿用原AkShare映射，人工补充映射最后生效。"""
    @wraps(scanner.resolve_main_contracts)
    def resolve_main_contracts(config, retries=3):
        import akshare as ak
        import contextlib
        import io
        import time

        wenhua = wenhua_mains(db_path)
        mapping = {}
        # A failed exchange must not erase mappings already fetched elsewhere.
        for exchange in ("shfe", "dce", "czce", "cffex", "gfex"):
            contracts = ""
            for attempt in range(retries):
                try:
                    with contextlib.redirect_stdout(io.StringIO()):
                        contracts = ak.match_main_contract(exchange)
                    if contracts.strip():
                        break
                except Exception:
                    pass
                time.sleep(0.5 * (attempt + 1))
            if not contracts.strip():
                print(f"[缺口] {exchange}主力映射暂未取得，保留其他交易所及已核验文华映射", flush=True)
            for contract in contracts.split(","):
                matched = re.fullmatch(r"([A-Za-z]+)(\d{3,4})", contract.strip())
                if matched:
                    mapping[matched.group(1).upper()] = contract.strip().upper()
        mapping.update(wenhua)
        mapping.update({key.upper(): value.upper() for key, value in config.get("main_contract_overrides", {}).items()})
        return mapping

    scanner.resolve_main_contracts = resolve_main_contracts


def load_scanner():
    project = Path(__file__).resolve().parents[1]
    bundle = Path(os.environ.get("WUJIAN_BUNDLE_ROOT", project.parent / "资料包"))
    skill = Path(os.environ.get("WUJIAN_FIRE_SKILL_ROOT", bundle / "技能包" / "wujian-futures-multi-cycle-scan"))
    spec = importlib.util.spec_from_file_location("wujian_readonly_scan", skill / "scripts" / "scan.py")
    scanner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scanner)
    install_month_bridge(scanner)
    install_wenhua_mains(scanner, Path(os.environ.get("WUJIAN_EOD_DB", project / ".runtime" / "eod-market.sqlite")))
    return scanner


if __name__ == "__main__":
    raise SystemExit(load_scanner().main())
