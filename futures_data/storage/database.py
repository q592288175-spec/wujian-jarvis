from __future__ import annotations
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, Float, UniqueConstraint, select, event
from sqlalchemy.engine import Engine
from sqlalchemy.dialects.sqlite import insert

metadata = MetaData()
quotes = Table('futures_quotes', metadata, Column('id', Integer, primary_key=True), Column('product', String, index=True), Column('contract', String), Column('exchange', String), Column('latest', Float), Column('bid', Float), Column('ask', Float), Column('bid_volume', Float), Column('ask_volume', Float), Column('volume', Float), Column('open_interest', Float), Column('open', Float), Column('high', Float), Column('low', Float), Column('previous_settlement', Float), Column('source_time', String), Column('quote_date', String), Column('collected_at', String), Column('source', String), Column('quality', String))
spots = Table('spot_prices', metadata, Column('id', Integer, primary_key=True), Column('product', String), Column('date', String), Column('price', Float), Column('unit', String), Column('scope', String), Column('source', String), Column('collected_at', String), UniqueConstraint('product', 'date', 'source'))
basis = Table('basis_daily', metadata, Column('id', Integer, primary_key=True), Column('product', String), Column('date', String), Column('contract', String), Column('spot_price', Float), Column('futures_price', Float), Column('basis', Float), Column('basis_rate', Float), Column('quote_time', String), Column('quality', String), Column('collected_at', String), UniqueConstraint('product', 'date'))
rolls = Table('contract_rolls', metadata, Column('id', Integer, primary_key=True), Column('product', String), Column('previous_contract', String), Column('new_contract', String), Column('observed_at', String), Column('rule', String))

def connect(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine('sqlite:///' + str(path), connect_args={'timeout': 30})
    @event.listens_for(engine, 'connect')
    def pragma(connection: Any, record: Any) -> None:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('PRAGMA busy_timeout=30000')
    metadata.create_all(engine)
    return engine

def upsert(engine: Engine, table: Table, row: dict[str, Any], keys: list[str]) -> None:
    stmt = insert(table).values(**row)
    with engine.begin() as c:
        c.execute(stmt.on_conflict_do_update(index_elements=keys, set_={k: stmt.excluded[k] for k in row if k not in keys}))

def save_quote(engine: Engine, row: dict[str, Any]) -> None:
    with engine.begin() as c:
        previous = c.execute(select(quotes.c.contract).where(quotes.c.product == row['product']).order_by(quotes.c.id.desc()).limit(1)).scalar_one_or_none()
        if previous and previous != row['contract']:
            c.execute(rolls.insert().values(product=row['product'], previous_contract=previous, new_contract=row['contract'], observed_at=row['collected_at'], rule='max(volume+open_interest), tie: open_interest, volume, contract'))
        c.execute(quotes.insert().values(**row))

def query(engine: Engine, table: Table, product: str, days: int | None = None) -> list[dict[str, Any]]:
    stmt = select(table).where(table.c.product == product.lower())
    if days is not None:
        cutoff = (datetime.now() - timedelta(days=days)).date().isoformat()
        stmt = stmt.where((table.c.date if 'date' in table.c else table.c.quote_date) >= cutoff)
    stmt = stmt.order_by(table.c.id.desc()).limit(1000 if days else 1)
    with engine.connect() as c:
        return [dict(row) for row in c.execute(stmt).mappings()]

inventory = Table('inventory', metadata, Column('id', Integer, primary_key=True), Column('product', String), Column('date', String), Column('value', Float), Column('change', Float), Column('unit', String), Column('scope', String), Column('source', String), Column('collected_at', String), UniqueConstraint('product','date','source','scope'))
warehouse = Table('warehouse_receipt', metadata, Column('id', Integer, primary_key=True), Column('product', String), Column('date', String), Column('value', Float), Column('change', Float), Column('unit', String), Column('exchange', String), Column('source', String), Column('collected_at', String), UniqueConstraint('product','date','exchange'))
holdings = Table('holdings_rank', metadata, Column('id', Integer, primary_key=True), Column('product', String), Column('date', String), Column('contract', String), Column('rank', Integer), Column('side', String), Column('member', String), Column('value', Float), Column('change', Float), Column('source', String), Column('collected_at', String), UniqueConstraint('product','date','contract','rank','side'))
