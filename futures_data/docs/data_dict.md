# 小木 AKShare 数据字典 · v0.4.4

验证：2026-09-20，AKShare 1.18.96。接口以安装版本与实际返回为准。
官方参考：https://akshare.akfamily.xyz/data/futures/futures.html

| 数据 | AKShare 接口 | 来源与频率 | 字段与限制 |
|---|---|---|---|
| 主力快照 | futures_zh_realtime | 新浪，默认每分钟一轮 | 代码、最新价、买卖一价量、成交量、持仓量、开高低、昨结算、来源交易日时钟、采集时间 |
| TL补充 | get_futures_daily + futures_zh_spot | 中金所合约清单与新浪报价 | 自动发现月份；来源日期、买卖量、昨结算缺失保留空值 |
| 现货 | futures_spot_price | 生意社，逐日回溯最近可用日 | 商品、报价、日期；地区、牌号未提供，不能当作指定交割品报价 |
| 同日期货收盘 | get_futures_daily | 各交易所日表，按需 | 用close，不用settle；当日重新选主力，禁止混用不同日期价格 |
| 基差 | 本地计算 | 每日每品种更新一行 | 现货减期货；基差率除以期货价。不使用来源自带的不同符号或分母口径 |
| 库存 | futures_inventory_em | 东财，工作日17:30 | date/value/change；原字段ON_WARRANT_NUM，不能冒充社会库存或厂库，单位待核验 |
| 仓单 | get_receipt | 交易所，工作日17:30 | 品种、日期、数量、增减；原始单位未统一，不能跨品种相加 |
| 会员排名 | get_shfe_rank_table / futures_dce_position_rank / get_rank_table_czce / futures_gfex_position_rank / get_cffex_rank_table | 交易所，工作日17:30 | 各合约前20会员成交、多、空分别保存；不是只取当前主力，必须按合约和日期识别 |

## 主力与时间
实际月份合约按成交量+持仓量之和最大选择，平局依次比较持仓、成交、代码。
连续合约不参与。初次观察不算换月，后续切换记录在contract_rolls。
Sina交易日和时钟不等于自然日期时间：周末看到下一交易日夜盘标签，不能解释为未来行情或测量精确延迟。
调用间隔0.75秒是采集器调用节奏，不是行情延迟保证；71品种一轮实测约58秒。
调度每分钟一轮，任务不重叠；节假日暂无完整交易日历，空返回保留缺口。

## SQLite
futures_quotes保存快照与采集时间；spot_prices按品种/日期/来源去重；
basis_daily按品种/日期更新；contract_rolls保存主力切换。
inventory按品种/日期/来源/口径去重，warehouse_receipt按品种/日期/交易所去重，
holdings_rank按品种/日期/合约/排名/方向去重。
历史查询每表最多1000行；缺失值不填零。

## 已知缺口
- 最终行情覆盖71品种，现货49条，基差32条；逐品种无现货/日期不符等记录见docs/akshare/phase1-run.json。
- 生猪、烧碱、鸡蛋的现货单位或浓度换算未核验，保存原值但不计算基差。
- 股指、国债等没有本轮可比商品现货源；不能强行生成基差。
- 库存缺口：原油、国际铜、集运欧线、原木、早籼稻、瓶片、动力煤、多晶硅。
- 上期所及INE仓单：接口报20号胶映射错误；替代接口也未成功。
- 大商所仓单返回JSON解析错误，持仓下载返回BadZipFile。
- 不具备已核验的螺纹社会/厂库、铜社会库存、豆粕库存、港口库存与LME库存全覆盖。
- Mysteel、隆众、钢联付费深度口径未接入；没有付费API或凭据需求。
- 详细本次失败列表见docs/akshare/phase2-run.json，失败不代表该市场数据为零。
