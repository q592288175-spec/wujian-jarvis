"""Fetch futures point/tick values from the broker's published trading table."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal
from hashlib import sha256
from io import StringIO
import json
from pathlib import Path
import re

import pandas as pd
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def collect(date):
    requested = datetime.strptime(date, "%Y-%m-%d").date()
    response = requests.get("https://www.gtjaqh.com/pc/calendar",
                            params={"date": requested.strftime("%Y%m%d")}, timeout=(5, 20))
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "lxml")
    text = soup.get_text(" ", strip=True)
    # The query date alone is not evidence that the site returned that day's table.
    validity = re.search(r"有效期间[：:].*?至\s*(\d{4})年(\d{1,2})月(\d{1,2})日", text)
    if not validity:
        raise ValueError("参数表没有可核验的有效日期")
    source_date = f"{int(validity[1]):04d}-{int(validity[2]):02d}-{int(validity[3]):02d}"
    if source_date != date:
        raise ValueError(f"参数表日期不符：请求{date}，返回{source_date}")
    tables = pd.read_html(StringIO(response.text), header=1)
    table = next(frame for frame in tables if {"代码", "合约乘数", "最小变动价位"} <= set(frame.columns))
    products = {}
    for row in table.to_dict("records"):
        code = str(row["代码"]).strip().upper()
        if not re.fullmatch(r"[A-Z]{1,2}", code) or "期权" in str(row["品种"]):
            continue
        point_value, tick_size = Decimal(str(row["合约乘数"])), Decimal(str(row["最小变动价位"]))
        if not point_value.is_finite() or not tick_size.is_finite() or min(point_value, tick_size) <= 0:
            raise ValueError(f"{code}的点值无效")
        if code in products:
            raise ValueError(f"{code}重复")
        products[code] = {"symbol": code, "name": str(row["品种"]), "exchange": str(row["交易所"]),
                          "pointValue": float(point_value), "tickSize": float(tick_size),
                          "tickValue": float(point_value * tick_size)}
    if len(products) < 80:
        raise ValueError("参数表覆盖异常，保留上次数据")
    return {"source": "国泰君安期货交易日历", "sourceUrl": response.url, "sourceDate": source_date,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "sourceSha256": sha256(response.content).hexdigest(), "products": products}, response.content


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--output", default=str(ROOT / ".runtime/contract-specs/current.json"))
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if not output.is_relative_to(ROOT):
        raise ValueError("输出必须在当前项目内")
    payload, raw = collect(args.date)
    archive = ROOT / ".runtime/contract-specs/snapshots" / (args.date + "-" + payload["sourceSha256"][:12])
    archive.mkdir(parents=True, exist_ok=True)
    (archive / "source.html").write_bytes(raw)
    (archive / "specs.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(output)
    print(json.dumps({"count": len(payload["products"]), "sourceDate": payload["sourceDate"], "output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
