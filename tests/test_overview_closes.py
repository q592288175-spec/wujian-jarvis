import importlib.util
from pathlib import Path
import sqlite3
import json

spec = importlib.util.spec_from_file_location('overview_closes', Path(__file__).resolve().parents[1] / 'integrations' / 'overview_closes.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def test_only_explicit_completed_close_before_cutoff():
    rows = [{'date': '2026-10-28', 'close': '100', 'settle': 999, 'volume': 100, 'hold': 10},
            {'date': '2026-10-29', 'close': 110, 'settle': 30, 'volume': 200},
            {'date': '2026-10-30', 'close': 200}, {'date': 'bad', 'close': 90},
            {'date': '2026-10-27', 'settle': 100}, {'date': '2026-10-26', 'close': 0},
            {'date': '2026-10-25', 'close': 100, 'complete': False}]
    data = m.completed_closes(rows, 'MA2701', '2026-10-29')
    assert [r['close'] for r in data] == [100, 110]
    assert all('settle' not in r for r in data)
    assert m.completed_closes(rows, 'MA0', '2026-10-29') == []


def test_cached_pair_reuse_and_empty_response_status():
    db = sqlite3.connect(':memory:')
    db.executescript('CREATE TABLE bars(day TEXT,period TEXT,complete INTEGER); CREATE TABLE records(kind TEXT,key TEXT,day TEXT,body TEXT,source TEXT,PRIMARY KEY(kind,key,day));')
    db.executemany('INSERT INTO bars VALUES(?,?,?)', [('2026-10-28', '1d', 1), ('2026-10-29', '1d', 1), ('2026-10-30', '1d', 0)])
    def save(db, kind, key, day, body, source):
        db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)', (kind, key, day, json.dumps(body), source))
    for day in ['2026-10-28', '2026-10-29']:
        save(db, 'close-daily', 'MA2701', day, {'contract': 'MA2701', 'day': day, 'close': 100, 'complete': True}, m.SOURCE)
    calls = []
    def fetch(name, args, timeout):
        calls.append(args['symbol'])
        raise ValueError('Length mismatch: Expected axis has 0 elements')
    result = m.collect_closes(db, [{'code': 'MA', 'contract': 'MA2701'}, {'code': 'RI', 'contract': 'RI701'}, {'code': 'LR', 'contract': None}], fetch, save, lambda: '2026-10-30T00:00:00+08:00')
    assert result['dataDate'] == '2026-10-29'
    assert result['cached'] == 1
    assert calls == ['RI701']
    assert len(result['failures']) == 2
    assert any('空表' in r['error'] for r in result['failures'])
    assert db.execute('SELECT count(*) FROM bars').fetchone()[0] == 3


def test_corrupt_or_incomparable_cache_must_be_refetched():
    days = ['2026-10-28', '2026-10-29']
    def cached(extra=None, source=None):
        return [(day, json.dumps({'contract': 'MA2701', 'day': day, 'close': 100, 'complete': True, **(extra or {})}), source or m.SOURCE) for day in days]
    assert m.reusable_pair(cached(), 'MA2701', days)
    for extra in [{'close': None}, {'close': 0}, {'close': True}, {'complete': False}, {'contract': 'MA2705'}, {'day': '2026-10-27'}]:
        assert not m.reusable_pair(cached(extra), 'MA2701', days)
    assert not m.reusable_pair(cached(source='不同来源'), 'MA2701', days)
    for body in ['broken JSON', '{}', '[]', 'null']:
        assert not m.reusable_pair([(day, body, m.SOURCE) for day in days], 'MA2701', days)
    assert not m.reusable_pair(cached(), 'MA2701', ['2026-10-29', '2026-10-30'])
