"""Isolated SDK double. No network, credentials, brokerage, or trading methods."""
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


class TqAuth:
    def __init__(self, user, password):
        self.user, self.password = user, password


class TqSim:
    pass


class Calendar:
    def iterrows(self):
        now = datetime.now()
        return enumerate([{'date': now + timedelta(days=i), 'trading': True} for i in range(-10, 40)])


class TqApi:
    def __init__(self, account, auth, **kwargs):
        if auth.user != 'fixture-account':
            raise Exception('auth failed: ' + auth.password)

    def query_quotes(self, **kwargs):
        return ['SHFE.fu2701', 'SHFE.au2701']

    def query_cont_quotes(self):
        return ['SHFE.fu2701', 'SHFE.au2701']

    def get_trading_calendar(self, *args):
        return Calendar()

    def get_quote(self, symbol):
        if 'au' in symbol:
            raise Exception('您的账户不支持查看 ' + symbol + ' 的行情数据，需要购买后才能使用')
        return SimpleNamespace(underlying_symbol='SHFE.fu2701', instrument_name='燃料油2701',
                               expire_datetime=1900000000, price_tick=1, expired=False,
                               datetime=datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S.%f'),
                               last_price=3000, pre_settlement=2900, volume=12345, open_interest=67890,
                               trading_time=SimpleNamespace(day=[], night=[]))

    def wait_update(self, **kwargs):
        time.sleep(.05)

    def is_changing(self, q):
        # Closed-session snapshot: no incremental updates after subscription.
        return False

    def close(self):
        pass
