from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import typer
from apscheduler.schedulers.blocking import BlockingScheduler
from futures_data.settings import load
from futures_data.runner import run as collect
from futures_data.storage.database import connect,query,quotes,basis as basis_table

app = typer.Typer(no_args_is_help=True)
def output(value: object) -> None:
    typer.echo(json.dumps(value,ensure_ascii=False,indent=2,default=str))
@app.command()
def run(config: Path | None = typer.Option(None), products: str | None = typer.Option(None,help='仅用于诊断，如 rb,cu；默认全量')) -> None:
    settings = load(config)
    selected = [x.strip().lower() for x in products.split(',')] if products else None
    if selected and any(x not in settings.products for x in selected):
        raise typer.BadParameter('未知品种')
    result = collect(settings,selected); output(result)
    if result['status'] == 'failed':
        raise typer.Exit(1)
@app.command()
def quote(product: str, config: Path | None = typer.Option(None)) -> None:
    engine=connect(load(config).db_path)
    try: output(query(engine,quotes,product))
    finally: engine.dispose()
@app.command()
def basis(product: str, config: Path | None = typer.Option(None)) -> None:
    engine=connect(load(config).db_path)
    try: output(query(engine,basis_table,product))
    finally: engine.dispose()
@app.command()
def history(product: str, days: int = typer.Option(30,min=1,max=3650), config: Path | None = typer.Option(None)) -> None:
    engine=connect(load(config).db_path)
    try: output({'quotes':query(engine,quotes,product,days),'basis':query(engine,basis_table,product,days)})
    finally: engine.dispose()
@app.command()
def serve(config: Path | None = typer.Option(None)) -> None:
    settings=load(config)
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import fcntl
    lock_path=settings.db_path.parent / 'scheduler.lock'
    lock_path.parent.mkdir(parents=True,exist_ok=True)
    lock=lock_path.open('a')
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        typer.echo('AKShare调度已运行，不重复启动');return
    scheduler=BlockingScheduler(timezone=settings.values['timezone'],job_defaults={'max_instances':1,'coalesce':True,'misfire_grace_time':60})
    scheduler.add_job(collect,'interval',minutes=settings.values['poll_minutes'],args=[settings],id='quotes',next_run_time=datetime.now(ZoneInfo(settings.values['timezone'])))
    if settings.values.get('phase2_enabled'):
        from futures_data.daily import run_daily
        scheduler.add_job(run_daily,'cron',hour=settings.values['daily_hour'],minute=settings.values['daily_minute'],day_of_week='mon-fri',args=[settings],id='daily')
    typer.echo('前台调度启动；轮次不重叠，慢于间隔则跳过，不积压。Ctrl+C退出。')
    try: scheduler.start()
    except (KeyboardInterrupt,SystemExit): pass
@app.command()
def data(product: str, kind: str = 'all', days: int = 30, config: Path | None = typer.Option(None)) -> None:
    settings=load(config)
    product=product.lower()
    if product not in settings.products:
        raise typer.BadParameter('未知品种')
    from futures_data.storage.database import spots
    engine=connect(settings.db_path)
    try:
        result: dict[str, object]={'queried_at':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),'source':'AKShare / 新浪行情与公开现货','product':product,'permission':False,'notice':'日期按来源交易日标记，不是采集时间；现货口径未等同指定交割品。基差率以期价为分母。'}
        if kind in ('all','quote','history'): result['quotes']=query(engine,quotes,product,days if kind=='history' else None)
        if kind in ('all','basis','history'):
            result['spots']=query(engine,spots,product,days if kind=='history' else None)
            result['basis']=query(engine,basis_table,product,days if kind=='history' else None)
        if kind in ('all','daily'):
            from futures_data.storage.database import inventory,warehouse,holdings
            result['daily']={t.name:query(engine,t,product,days) for t in [inventory,warehouse,holdings]}
        output(result)
    finally: engine.dispose()

@app.command()
def daily(date: str | None = None, products: str | None = None, config: Path | None = typer.Option(None)) -> None:
    from futures_data.daily import run_daily
    output(run_daily(load(config),date,[p.strip().lower() for p in products.split(',')] if products else None))
