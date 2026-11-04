"""Project-local compatibility for the read-only scanner's dynamic month."""
from datetime import date, timedelta
import ast
from functools import wraps
import importlib.util
import os
import re
import sqlite3
from pathlib import Path
from threading import local

import pandas as pd

INDICATOR = {"type": "EMA", "length": 10, "version": "ema10-v1", "alpha": 2 / 11,
             "seed": "first-close", "minPeriods": 10}


def ema_scanner_code(source, filename):
    """Adapt only the four MA10 expressions, leaving the read-only skill intact.

    Fail closed when the upstream calculation changes. Do not patch pandas globally:
    arithmetic means for volume, index weights and risk keep their own meanings.
    """
    class Ema10(ast.NodeTransformer):
        count = 0

        def visit_Call(self, node):
            node = self.generic_visit(node)
            if not (isinstance(node.func, ast.Attribute) and node.func.attr == "mean"
                    and not node.args and not node.keywords):
                return node
            rolling = node.func.value
            if not (isinstance(rolling, ast.Call) and isinstance(rolling.func, ast.Attribute)
                    and rolling.func.attr == "rolling" and len(rolling.args) == 1
                    and isinstance(rolling.args[0], ast.Constant) and rolling.args[0].value == 10
                    and len(rolling.keywords) == 1 and rolling.keywords[0].arg == "min_periods"
                    and isinstance(rolling.keywords[0].value, ast.Constant)
                    and rolling.keywords[0].value.value == 10):
                return node
            self.count += 1
            rolling.func.attr = "ewm"
            rolling.args = []
            rolling.keywords = [ast.keyword(arg="span", value=ast.Constant(10)),
                                ast.keyword(arg="adjust", value=ast.Constant(False)),
                                ast.keyword(arg="min_periods", value=ast.Constant(10))]
            return node

    adapter = Ema10()
    tree = adapter.visit(ast.parse(source, filename))
    if adapter.count != 4:
        raise RuntimeError(f"只读扫描器MA10计算入口变化：预期4处，实际{adapter.count}处；暂停EMA适配")
    return compile(ast.fix_missing_locations(tree), filename, "exec")


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
        bars = aggregate(daily, frequency, completed_only, as_of)
        if frequency == "M" and not completed_only and getattr(context, "month_counts", None) is not None:
            context.month_counts.append(len(bars))
        return bars

    @wraps(analyze)
    def analyze_with_month(product, main_contract, config, as_of, closing_snapshot=None, cache_dir=None, no_trade_source=None):
        snapshot = valid_bar(closing_snapshot) if closing_snapshot else None
        context.snapshot = {**snapshot, "symbol": main_contract} if snapshot and (not snapshot.get("symbol") or str(snapshot["symbol"]).upper() == str(main_contract).upper()) else None
        context.bridge = None
        context.month_counts = []
        try:
            result = analyze(product, main_contract, config, as_of, closing_snapshot, cache_dir, no_trade_source)
            if context.bridge and result.get("ok"):
                result["dynamic_month_bridge"] = context.bridge
            if result.get("ok") and context.month_counts:
                samples = context.month_counts[-1]
                result["specific_month_samples"] = samples
                result["month_indicator_source"] = ("当前具体主力月收盘序列" if samples >= 11 else
                    "具体合约不足11个月，沿用原扫描的主力连续月线回退并校正动态当月；换月需复核")
            return result
        finally:
            context.snapshot = None
            context.bridge = None
            context.month_counts = None

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
    exec(ema_scanner_code(Path(spec.origin).read_text(encoding="utf-8"), spec.origin), scanner.__dict__)
    install_month_bridge(scanner)
    install_wenhua_mains(scanner, Path(os.environ.get("WUJIAN_EOD_DB", project / ".runtime" / "eod-market.sqlite")))
    original_analyze = scanner.analyze

    @wraps(original_analyze)
    def analyze_ema(*args, **kwargs):
        return {**original_analyze(*args, **kwargs), "indicator": INDICATOR}

    scanner.analyze = analyze_ema
    original_report = scanner.build_report

    @wraps(original_report)
    def report_ema(*args, **kwargs):
        report, summary = original_report(*args, **kwargs)
        summary["indicator"] = INDICATOR
        summary["indicator_rule_version"] = "2026-11-04-ema10-v1"
        return report.replace("MA10", "EMA10"), summary

    scanner.build_report = report_ema
    return scanner


if __name__ == "__main__":
    raise SystemExit(load_scanner().main())
