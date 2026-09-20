# 小木内置免费期货采集与查询 · v0.4.4

本模块位于现有小木仓库，供文字对话、语音共用Agent和后台研究调用，
不是另建应用。新增采集仅使用AKShare，不下单、不连接CTP、不需要付费Key。
现有TqSdk图表链路仍保留，本轮没有把所有图表切换成AKShare。

## 安装与使用
在小木仓库根目录运行，Python 3.10+（实测3.12.13）：

```sh
python3.12 -m venv .venv-akshare
.venv-akshare/bin/pip install -r requirements.akshare.txt
source .venv-akshare/bin/activate
python -m futures_data run
python -m futures_data quote rb
python -m futures_data basis rb
python -m futures_data history rb --days 30
python -m futures_data daily --date 20260918
python -m futures_data serve
```

依赖锁定见根目录requirements.akshare.txt；已安装版本不会在启动时升级。
配置位于futures_data/config/config.yaml，71品种、板块、源名称均在配置中。
SQLite位于.runtime/akshare/futures.sqlite。serve前台运行，Ctrl+C停止；
新版Mac小木自动启动同一调度，锁避免重复启动服务。

Agent工具get_akshare_futures_data直接查询这份数据库。
可以问：“查询螺纹钢最新基差，说明日期和价格口径。”
后台研究也优先查询它，再查官方事件原文；缺失数据必须说明。

## 实测输出与验收
2026-09-20运行完整Phase1：71条行情、49条现货、32条可计算基差。
一轮约58秒；不承诺0.5—1秒端到端延迟。来源夜盘交易日标签与采集自然日期不同。
本次观察到的片段：

```text
RB2701 最新价 3104（来源交易日标签2026-09-21）
基差日期 2026-09-18：期货收盘3096，现货3148.34，基差52.34，基差率1.690568%
CU2610 同日：期货收盘109620，现货110235，基差615
```

Phase1通过后才执行Phase2。2026-09-18数据实取：
库存历史观察3813条、仓单25条、会员排名11580条；不是3813个库存品种。
失败列表与覆盖详情见phase1-run.json、phase2-run.json及
../../futures_data/docs/data_dict.md。Phase2属于部分覆盖，未宣称全市场完整。

原有Node测试108项通过；新增Python测试5项通过；Python编译与Node语法检查通过。
实际真人语音、开市连续运行和全部产业口径未验收。

真实/api/chat已调用get_akshare_futures_data，返回RB2701的2026-09-18基差52.34，未启动研究任务。首次模型回答对当前时点措辞不准确，工具已补充queried_at供比较；不将这次测试视为所有回答准确率验收。
