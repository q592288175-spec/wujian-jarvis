"""Publish verified public-source coverage and screenshots; preserve earlier reports."""
import json,html
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'output/dce-public-2026-10-25'
assert ROOT.is_relative_to(Path('D:/五简个人资料'))
imp=json.loads((OUT/'production-import.json').read_text('utf-8'));formal=json.loads((OUT/'formal-click.json').read_text('utf-8'));desktop=json.loads((OUT/'desktop-click.json').read_text('utf-8'));preserve=json.loads((OUT/'preservation.json').read_text('utf-8'))
assert not formal['errors'] and not desktop['errors'] and preserve['businessUnchanged'] and all(preserve['hashes'].values())
example=formal['example'];contract=formal['contract'];sample=json.loads((OUT/'collected.json').read_text('utf-8'))
text=f'''# 大商所公开备用来源接入与验收

2026-10-25。已接入正式资料缓存，正式4318页面已实际点击验收。此次只修改补充数据适配和证据文字，原功能、布局、主力认定、交易规则及账户内容保持。

## 已补上的数据

| 数据 | 实际覆盖 | 来源与日期 |
| --- | --- | --- |
| 合约日期 | {imp['contracts']}条经过产品类型、合约代码和日期筛选的具体期货合约，覆盖23个现有大商所品种 | OpenCTP公开字典；查询批次2026-10-25，源未提供资料发布日期 |
| 展期参考 | 新补入大商所{imp['rollProducts']}个品种，原五所58个保留，总计74个 | 新浪具体合约完成日K；目标交易日2026-10-23；当期合约清单来自OpenCTP |

展期已取得：豆一A、豆二B、玉米C、玉米淀粉CS、苯乙烯EB、乙二醇EG、铁矿石I、鸡蛋JD、焦煤JM、原木LG、生猪LH、豆粕M、棕榈油P、聚丙烯PP、聚氯乙烯V、豆油Y。

使用位置：市场全景 → 品种跟踪 → 合约与产业证据。刷新沿用原「同步数据 → 合约与产业资料/全部数据」。来源弹窗同时保留交易所直连失败与公开备用的真实状态。

## 仍未补齐

- 大商所官方合约与日行情直连仍失败：HTTP返回412校验页，HTTPS连接提前断开。没有绕过校验，也未将备用数据写成交易所直连。
- 胶合板BB、纯苯BZ、纤维板FB、焦炭J、聚乙烯L、液化石油气PG、粳米RR，部分具体合约缺少目标日K。首次样本中232份合约取得215份目标日数据，17份缺失；这些品种不能证实完整清单中的持仓前二，因此未计算展期，也未把缺失当零成交。
- OpenCTP给出的是DeliveryDate「交割日」，未给出独立的最后交割日字段。页面单独展示交割日，并明确「最后交割日未取得」，不擅自改名。
- 当期公开字典不是历史合约全集；过去已退市合约可能不在清单中。只使用目标日已上市且未到期的当前清单，不声称历史全月份覆盖。

## 取数口径与交叉检查

合约仅读取OpenDate、ExpireDate、DeliveryDate及必要身份字段，不采用字典中的保证金、手续费或账户权限。期权、月均价合约、无效月份、未来上市或已过期记录排除。

展期先读取同一清单内每份具体合约的目标日K，再按该日持仓前二取近远月。任一列示合约缺失时保留该品种缺口，不改用第三份合约凑排名；不使用实时快照、昨结或后续交易日数据替代目标日收盘。

新浪实时列表已经出现2026-10-26标签，本次计算严格读取2026-10-23完成日K。两份合约整组使用同一供应商。东方财富的豆粕控制样本收盘也为3276，但成交量870409、持仓2221244，与新浪865874、2225768不同；交易所正式同日文件未取得，当前不能据此判定哪方量仓更准确。因此未拼接不同来源量仓。东方财富胶合板BB2705独立样本最新仅到10月21日，后续补查又出现连接异常，没有作为自动补齐来源。

豆粕页面实例：{example['near']['contract']}收盘{example['near']['close']:g}、持仓{example['near']['interest']:g}手；{example['far']['contract']}收盘{example['far']['close']:g}、持仓{example['far']['interest']:g}手；相隔{example['monthGap']}个月。

年化对数价差率 = ln(近月收盘价/远月收盘价) × 12/相隔月份数 = {example['rate']*100:.6f}%。页面显示37.51%。这是同日价格曲线参考，不是实际展期收益或未来回报。原计算公式与主力认定未改。

合约M2701：上市{contract['listed']}、最后交易日{contract['lastTrade']}、源交割日{contract['delivery']}；上述日期按供应商明确字段展示，未从月份或通用交易日规则推算。来源核验时间{contract['checkedAt']}，查询批次日与行情交易日分开标记。

## 验收结果

- 470项Node测试、22项相关Python测试通过；包含未来/错误日期、缺少合约、期权/月均价排除、交割日字段语义、官方失败切公开源及源链接安全检查。
- 已执行desktop:build，在独立配置下实际启动新EXE，点击原同步按钮、豆粕日期与展期、纯苯缺口及来源弹窗，页面脚本错误为0。
- 正式4318服务再次点开豆粕、纯苯及来源弹窗并留图；无需关闭正在使用的小木窗口。现有桌面从项目加载适配器和页面，重新载入页面即可读取本次更新。
- 正式资料缓存只导入{imp['rows']}条大商所补充记录；原K线、席位、自选和其他缓存校验一致。业务库全部内容指纹一致，6份规则文件哈希一致。
- 新验收构建在.runtime/desktop-dce-public-20261025/小木-win32-x64/小木.exe；原正在使用的构建与快捷方式未改动。可恢复备份在.runtime/ui-history/2026-10-25-dce-public-before。

## 来源与证据

- OpenCTP公开合约字典：http://dict.openctp.cn/instruments?types=futures&markets=DCE 。HTTP公开接口实测返回200；HTTPS本机实测TLS失败，未跳过证书检查。查询没有账户登录或任何实盘操作。
- 新浪具体合约页面：https://finance.sina.com.cn/futures/quotes/M2701.shtml 。日K接口地址与原始请求记录在输出证据中。
- AKShare官方新浪接口文档：https://akshare.akfamily.xyz/data/futures/futures.html 。字段映射参考官方源码option_contract_info_ctp.py，DeliveryDate为「交割日」。本项目固定的AKShare版本未升级。

证据目录：{OUT}。包含公开接口原始响应、独立只读样本、真实同步结果、浏览器/桌面/正式服务点击、测试与构建日志、导入前后保护校验。当前实测可作为备用，并不代表供应商永久稳定；接口失败会保留已取得资料并明确显示本轮缺口。
'''
md=ROOT/'docs/大商所公开备用接入验收-2026-10-25.md';report=md.with_suffix('.html');md.write_text(text,encoding='utf-8')
figures=[('正式服务：合约与展期','formal-m-contract-roll.png'),('正式服务：不完整品种保留缺口','formal-incomplete-product.png'),('真实桌面：公开备用和官方失败分别显示','desktop-sources.png')]
body=''.join(f'<section><h2>{title}</h2><img loading="lazy" src="../output/dce-public-2026-10-25/{file}"></section>' for title,file in figures)
report.write_text(f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>大商所公开备用验收 · 小木</title><style>body{{font:16px/1.8 'Microsoft YaHei UI',sans-serif;background:#f6f7fd;color:#29364f;max-width:1280px;margin:28px auto;padding:0 20px}}h1{{font-size:28px}}section{{background:white;border:1px solid #dbe2f1;padding:20px;margin:18px 0;border-radius:8px}}img{{width:100%;height:auto}}a{{color:#3157a6}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit}}</style><h1>大商所公开备用 · 已接入并实测</h1><section><p><b>{imp['contracts']}条合约日期，{imp['rollProducts']}个品种展期参考。</b>合约来自OpenCTP公开字典，查询批次10月25日；展期来自新浪具体合约完成日K，行情日10月23日。</p><p>7个品种仍缺少部分合约日K，不凑排名；最后交割日未取得。原功能、布局、账户与交易规则保持。</p><p>470项Node、22项Python通过；新版桌面与正式页面实际点击通过。</p></section>{body}<section><h2>完整口径与缺口</h2><pre>{html.escape(text)}</pre></section><p><a href="{md.name}">Markdown记录</a> · <a href="数据缺口排查验收-2026-10-25.html">上一轮排查记录</a></p></html>''',encoding='utf-8')
entry=ROOT/'docs/market-panorama.md';current=entry.read_text('utf-8');tag='## 大商所公开备用续修（2026-10-25）'
if tag not in current:entry.write_text(current.rstrip()+f'\n\n{tag}\n\n已补入OpenCTP 232条具体合约日期及新浪完成日K计算的16个大商所品种展期参考（总计74个）。合约查询批次2026-10-25、行情日2026-10-23分别标明；7个品种日K不完整、最后交割日及官方直连仍有缺口。原账户费率与交易规则不变。详见[公开备用实际验收]({report.name})。\n',encoding='utf-8')
previous=ROOT/'docs/数据缺口排查验收-2026-10-25.html';old=previous.read_text('utf-8')
if report.name not in old:previous.write_text(old.replace('<h1>','<p><b>后续更新：</b><a href="'+report.name+'">大商所公开备用已接入，查看最新验收</a>。下文保留上一轮结果。</p><h1>',1),encoding='utf-8')
index=Path('D:/五简个人资料/Codex/文件索引.md');old=index.read_text('utf-8')
if report.name not in old:index.write_text(old.rstrip()+f'\n\n- 2026-10-25｜[大商所公开备用接入验收](<{report.as_posix()}>): OpenCTP 232条合约、16个大商所品种展期参考补入；7品种日K和最后交割日保留缺口。470项Node、22项Python、桌面及正式服务点击通过，账户和交易规则保持。\n',encoding='utf-8')
print(json.dumps({'report':str(report),'markdown':str(md)},ensure_ascii=False))
