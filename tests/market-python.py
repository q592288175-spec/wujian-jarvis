import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'integrations'))
from tq_market import finite,change,trading_day
from datetime import date
class Contract(unittest.TestCase):
 def test_friday_night(self):self.assertEqual(trading_day('2026-09-18 21:00:00',[date(2026,9,18),date(2026,9,21)]),date(2026,9,21))
 def test_midnight(self):self.assertEqual(trading_day('2026-09-19 00:30:00',[date(2026,9,18),date(2026,9,21)]),date(2026,9,21))
 def test_holiday(self):self.assertEqual(trading_day('2026-09-30 21:00:00',[date(2026,9,30),date(2026,10,9)]),date(2026,10,9))
 def test_nan(self):self.assertIsNone(finite(float('nan')))
 def test_missing(self):self.assertIsNone(change(None,10))
 def test_zero(self):self.assertIsNone(change(12,0))
 def test_previous_close(self):self.assertEqual(change(110,100),10)
if __name__=='__main__':unittest.main()
