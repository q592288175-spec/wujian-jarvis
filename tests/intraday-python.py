import unittest,sys
from pathlib import Path
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'integrations'))
from intraday import Intraday
class Cross(unittest.TestCase):
 def test_cross_and_reset(self):
  c=Intraday();now=datetime(2026,9,21,2,tzinfo=timezone.utc)
  def step(p,seconds=0,day='2026-09-21'):
   t=now+timedelta(seconds=seconds)
   return c.update('X',day,(t+timedelta(hours=8)).replace(tzinfo=None).isoformat(),p,10,t)
  self.assertIsNone(step(11)['cross'])
  self.assertEqual(step(9,2)['cross']['direction'],'short')
  self.assertIsNone(step(11,30)['cross'])
  self.assertIsNone(step(9,31,'2026-09-22')['cross'])
 def test_unknown_clears_continuity(self):
  c=Intraday();self.assertEqual(c.update('X',None,'t',1,1)['status'],'missing')
 def test_old_tick_never_alerts(self):
  c=Intraday();now=datetime(2026,9,21,2,tzinfo=timezone.utc)
  c.update('X','2026-09-18','2026-09-18 14:59:00',11,10,now)
  self.assertIsNone(c.update('X','2026-09-18','2026-09-18 15:00:00',9,10,now)['cross'])
unittest.main()
