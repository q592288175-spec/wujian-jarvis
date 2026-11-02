import importlib.util
from pathlib import Path
from datetime import datetime
import unittest

spec = importlib.util.spec_from_file_location('monitor_market', Path(__file__).parents[1] / 'integrations' / 'monitor_market.py')
market = importlib.util.module_from_spec(spec)
spec.loader.exec_module(market)

class SessionTests(unittest.TestCase):
    times = {'day': [['09:00:00', '10:15:00'], ['10:30:00', '11:30:00'], ['13:30:00', '15:00:00']], 'night': [['21:00:00', '26:30:00']]}
    dates = ['2026-09-30', '2026-10-09', '2026-10-12', '2026-10-13']

    def check(self, value):
        return market.session_info(datetime.fromisoformat(value), self.times, self.dates)

    def test_day_and_breaks(self):
        self.assertTrue(self.check('2026-10-12T09:00:00')['sessionActive'])
        for value in ['2026-10-12T10:20:00', '2026-10-12T12:00:00', '2026-10-12T15:00:00', '2026-10-10T09:00:00']:
            self.assertFalse(self.check(value)['sessionActive'])

    def test_friday_and_midnight(self):
        for value in ['2026-10-09T21:30:00', '2026-10-10T01:00:00']:
            result = self.check(value)
            self.assertTrue(result['sessionActive'])
            self.assertEqual(result['tradingDay'], '2026-10-12')
        self.assertFalse(self.check('2026-10-10T02:30:00')['sessionActive'])
        self.assertFalse(self.check('2026-10-11T21:00:00')['sessionActive'])

    def test_holiday_eve_and_contract_case(self):
        self.assertFalse(self.check('2026-09-30T21:00:00')['sessionActive'])
        self.assertEqual(market.provider_symbol('SHFE.CU2611'), 'SHFE.cu2611')
        self.assertEqual(market.provider_symbol('CZCE.MA701'), 'CZCE.MA701')
        self.assertEqual(market.provider_symbol('CZCE.MA2701'), 'CZCE.MA701')

    def test_permission_errors_and_network_errors_differ(self):
        for message in ['用户权限认证失败', '您的账户不支持查看 SHFE.au2701 的行情数据，需要购买后才能使用', 'invalid credentials']:
            self.assertTrue(market.permission_error(Exception(message)))
        self.assertFalse(market.permission_error(Exception('connection timed out')))

    def test_one_denied_contract_does_not_block_another(self):
        from contextlib import redirect_stdout
        from io import StringIO
        class Api:
            def get_quote(self, symbol):
                if symbol == 'SHFE.au2701':
                    raise Exception('您的账户不支持查看该合约，需要购买')
                return {'last_price': 3000}
        blocked, output = set(), StringIO()
        with redirect_stdout(output):
            self.assertIsNone(market.permitted_quote(Api(), 'SHFE.au2701', blocked))
            self.assertIsNone(market.permitted_quote(Api(), 'SHFE.au2701', blocked))
            self.assertEqual(market.permitted_quote(Api(), 'SHFE.fu2701', blocked)['last_price'], 3000)
        self.assertEqual(len(output.getvalue().splitlines()), 1)
        self.assertIn('permission-denied', output.getvalue())



class TrendBarTests(unittest.TestCase):
    class Serial:
        def __init__(self, rows):
            self.rows = rows
        def iterrows(self):
            return enumerate(self.rows)

    def row(self, stamp, close=100):
        return dict(datetime=int(datetime.fromisoformat(stamp).replace(tzinfo=market.SHANGHAI).timestamp()*1e9), open=100, high=102, low=98, close=close)

    def test_opt_in_subscriptions_and_per_period_permission_isolation(self):
        from contextlib import redirect_stdout
        from io import StringIO
        class Api:
            def __init__(self): self.calls=[]
            def get_kline_serial(self, symbol, seconds, data_length):
                self.calls.append((symbol, seconds, data_length))
                if seconds==3600: raise Exception('permission denied')
                return []
        api, serials, blocked = Api(), {}, set()
        market.ensure_trend_serials(api, set(), {'1d','30m'}, serials, blocked)
        self.assertEqual(api.calls, [])
        symbols, periods = market.trend_request({'trendSymbols':['CZCE.MA2701'], 'trendPeriods':['30m','60m','120m','invalid']})
        self.assertEqual(periods, {'1d','30m','60m','120m'})
        out=StringIO()
        with redirect_stdout(out):
            market.ensure_trend_serials(api, symbols, periods, serials, blocked)
            market.ensure_trend_serials(api, symbols, periods, serials, blocked)
        self.assertEqual(len(api.calls),4)
        self.assertIn(('CZCE.MA701',86400,450),api.calls)
        self.assertIn(('CZCE.MA701',1800,24),api.calls)
        self.assertIn(('CZCE.MA701',7200,24),api.calls)
        self.assertIn('trend-status',out.getvalue())
        self.assertNotIn('contract-status',out.getvalue())
        self.assertEqual(len(serials),3)

    def test_night_and_holiday_bar_uses_trading_calendar(self):
        dates=['2026-09-30','2026-10-09','2026-10-12']
        for stamp in ['2026-10-09T21:00:00','2026-10-10T01:00:00']:
            self.assertEqual(market.trading_day(datetime.fromisoformat(stamp),dates),'2026-10-12')
        self.assertEqual(market.trading_day(datetime.fromisoformat('2026-09-30T21:00:00'),dates),'2026-10-09')
        self.assertIsNone(market.trading_day(datetime.fromisoformat('2026-10-12T21:00:00'),dates))
        serial=self.Serial([self.row('2026-10-09T21:00:00'),self.row('2026-10-12T21:00:00')])
        bars=market.trend_bar_rows(serial,'1d',dates)
        self.assertEqual(len(bars),1)
        self.assertEqual(bars[0]['tradingDay'],'2026-10-12')
        self.assertTrue(bars[0]['complete'])

    def test_current_bar_keeps_incomplete_and_invalid_rows_are_not_fabricated(self):
        import math
        serial=self.Serial([dict(datetime=0,open=0,high=0,low=0,close=0),self.row('2026-10-12T09:00:00'),self.row('2026-10-12T09:30:00',math.nan),self.row('2026-10-12T10:00:00')])
        bars=market.trend_bar_rows(serial,'30m',['2026-10-12'])
        self.assertEqual(len(bars),2)
        self.assertTrue(bars[0]['complete'])
        self.assertFalse(bars[-1]['complete'])
        self.assertEqual(bars[-1]['durationSeconds'],1800)
        self.assertEqual(bars[-1]['endStamp'],'2026-10-12T10:30:00+08:00')

    def test_latest_tick_does_not_repeat_history_but_new_bar_or_previous_close_does(self):
        from contextlib import redirect_stdout
        from io import StringIO
        serial=self.Serial([self.row('2026-10-12T09:00:00'),self.row('2026-10-12T09:30:00')])
        serials={('SHFE.FU2701','30m'):serial};fingerprints={};out=StringIO();now=datetime.fromisoformat('2026-10-12T09:45:00+08:00')
        with redirect_stdout(out):
            market.publish_trend_bars({'SHFE.FU2701'},{'30m'},serials,fingerprints,['2026-10-12'],now)
            serial.rows[-1]['close']=101
            market.publish_trend_bars({'SHFE.FU2701'},{'30m'},serials,fingerprints,['2026-10-12'],now)
            serial.rows[-2]['close']=99
            market.publish_trend_bars({'SHFE.FU2701'},{'30m'},serials,fingerprints,['2026-10-12'],now)
            serial.rows.append(self.row('2026-10-12T10:00:00'))
            market.publish_trend_bars({'SHFE.FU2701'},{'30m'},serials,fingerprints,['2026-10-12'],now)
        rows=[__import__('json').loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(len(rows),3)
        self.assertTrue(all(row['type']=='trend-bars' for row in rows))
        self.assertFalse(rows[-1]['bars']['30m'][-1]['complete'])
        self.assertEqual(rows[-1]['source'],'TqSdk')



    def test_unchanged_history_does_not_convert_full_daily_rows(self):
        from contextlib import redirect_stdout
        from io import StringIO
        from unittest.mock import patch
        serial=self.Serial([self.row('2026-10-12T09:00:00'),self.row('2026-10-12T09:30:00')])
        fingerprints={};serials={('SHFE.FU2701','30m'):serial};now=datetime.fromisoformat('2026-10-12T09:45:00+08:00')
        with redirect_stdout(StringIO()), patch.object(market,'trend_bar_rows',wraps=market.trend_bar_rows) as convert:
            market.publish_trend_bars({'SHFE.FU2701'},{'30m'},serials,fingerprints,['2026-10-12'],now)
            self.assertEqual(convert.call_count,1)
            serial.rows[-1]['close']=101
            market.publish_trend_bars({'SHFE.FU2701'},{'30m'},serials,fingerprints,['2026-10-12'],now)
            self.assertEqual(convert.call_count,1)

    def test_chart_network_failure_retries_after_backoff_without_disconnecting_quotes(self):
        from contextlib import redirect_stdout
        from io import StringIO
        class Api:
            def __init__(self): self.calls=0
            def get_kline_serial(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1: raise Exception('network timeout')
                return self.calls
        api=Api();serials={};blocked=set();retry_at={};clock=[100]
        with redirect_stdout(StringIO()):
            market.ensure_trend_serials(api,{'SHFE.FU2701'},{'30m'},serials,blocked,retry_at,lambda:clock[0])
            self.assertEqual(blocked,set())
            market.ensure_trend_serials(api,{'SHFE.FU2701'},{'30m'},serials,blocked,retry_at,lambda:clock[0])
            self.assertEqual(api.calls,1)
            clock[0]+=31
            market.ensure_trend_serials(api,{'SHFE.FU2701'},{'30m'},serials,blocked,retry_at,lambda:clock[0])
        self.assertEqual(api.calls,2)
        self.assertIn(('SHFE.FU2701','30m'),serials)

if __name__ == '__main__':
    unittest.main()
