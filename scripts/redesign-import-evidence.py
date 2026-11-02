"""Import the one-time verified response, without another source call."""
import sys,json,sqlite3,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/"integrations"))
from market_panorama_supplement import store_result
spec=importlib.util.spec_from_file_location("data",ROOT/"integrations/market-panorama-data.py");m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
folder=Path(sys.argv[1]).resolve()
if not folder.is_relative_to(ROOT):raise ValueError("缓存必须在项目内")
db=m.connect(folder);count=0
config=json.loads((ROOT/"data/panorama-sources.json").read_text("utf-8"))
for s in config["sources"]:
    if not s.get("enabled"):continue
    response=json.loads((ROOT/"output/redesign-2026-10-25/data-probe"/(s["key"]+".json")).read_text("utf-8"))
    n=store_result(db,s["key"],response["data"],"2026-10-23",m.save,response["checkedAt"]);count+=n
    m.save(db,"supplement-status",s["key"],"2026-10-23",{"status":"ok" if n else "empty","rows":n,"checkedAt":response["checkedAt"],"reason":"" if n else "无可核验的当日记录"},s["source"])
    print(s["key"],n)
db.commit();db.close();print("imported",count)
