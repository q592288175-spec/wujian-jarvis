import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('.'),out='output/data-gaps-2026-10-25';
if(!root.startsWith('D:\\五简个人资料\\'))throw Error('成果路径越界');
const stats=JSON.parse(await readFile(out+'/coverage.json','utf8'));
const formal=JSON.parse(await readFile(out+'/formal-activation.json','utf8'));
const desktop=JSON.parse(await readFile(out+'/desktop-click-result.json','utf8'));
const imported=JSON.parse(await readFile(out+'/production-import.json','utf8'));
if(!formal.businessUnchanged||formal.errors.length||desktop.errors.length)throw Error('实际验收未通过');
const names={AP:'苹果',BB:'胶合板',FU:'燃料油',JD:'鸡蛋',LG:'原木'};
const stale=stats.stale.map(v=>`${names[v.code]||v.code} ${v.code}：${v.date}`).join('；');
const markets={SHFE:'上期所',INE:'能源中心',CZCE:'郑商所',GFEX:'广期所',CFFEX:'中金所'};
const exchangeRows=Object.entries(stats.rollExchanges).map(([e,n])=>`| ${markets[e]} ${e} | ${n} |`).join('\n');
const md=`# 小木工作台数据缺口续修与验收

2026-10-25。本轮已启用新版桌面，桌面快捷方式已切换，旧构建保留。正式服务已核验：${formal.base}。

## 结果与使用入口

进入「市场全景 → 品种跟踪 → 合约与产业证据」，可以展开注册仓单历史、查看展期参考。原「同步数据」选择「合约与产业资料」或「全部数据」仍可刷新；「数据来源与口径」可查看来源、核验时间和缺口。

| 项目 | 本次实际结果 | 仍有的缺口 |
| --- | --- | --- |
| 注册仓单历史 | ${stats.commodityProducts}个商品品种中取得${stats.warehouseProducts}个、${stats.warehouseRows}条；${stats.fresh}个最新日期为2026-10-23 | 5个旧数据；集运欧线EC未返回记录；8个金融期货不适用实物仓单 |
| 展期参考 | 五个交易所、去重${stats.rollProducts}个品种，资料日2026-10-23 | 大商所日行情HTTP 412；同日持仓前二无成交或收盘价不完整者不计算 |
| 大商所合约 | 未接通，页面明确标注 | HTTP返回412安全校验HTML；HTTPS连接报TLS提前断开，未取得有效JSON |

仓单旧数据：${stale}。这些日期按原样展示，未改成当日数据。未返回记录不按零处理。源响应未声明仓单单位，因此显示「来源未标注单位」，不冒称吨或手；仓单也不等于社会库存。接口当前只返回实际取得的历史区间，不声称完整覆盖2020年以来。

## 修复依据

仓单复用既有东方财富公开接口RPT_FUTU_STOCKDATA，字段ON_WARRANT_NUM、ADDCHANGE。AKShare的品种映射有大小写差异，部分新代码没有映射；本轮按实际供应商代码查询，并核验返回品种、日期、数值。没有更换成付费、登录或私有来源。

原展期聚合入口在首先读取大商所失败后中断。本轮改为六家交易所独立读取同日公开日行情，一个来源失败不会丢弃其他结果。上期所响应同时含能源中心品种，现按现有品种归属分开统计；早期63条含重复，最终去重为${stats.rollProducts}个。

| 展期数据来源 | 去重品种数 |
| --- | --- |
${exchangeRows}
| 大商所 DCE | 未取得 |

程序仅取同日持仓量前二的两个期货合约，再按到期月份分近远月：

年化对数价差率 = ln(近月收盘价 / 远月收盘价) × 12 / 相隔月份数

沪铜实测：CU2611收盘108,740、持仓119,891手；CU2612收盘107,900、持仓183,779手，相隔1个月，复算为9.305807%，界面显示9.31%。这是同日价格曲线参考，不是实际展期收益、未来回报或资金净流入，也不改变小木的文华主力认定。

大商所当前AKShare与上游官方源码使用同一个contractInfo入口。HTTP 412是实际返回状态，HTTPS为SSLEOFError；本轮未绕过校验，也没有根据合约代码推测交割日期。大商所展期资料同样保留缺口，其已有行情、席位、仓单功能继续沿用原来源。

## 实际验收与保护

- 完整Node测试469/469通过；相关Python测试16/16通过。另有全源文件语法检查，详见输出日志。
- 已执行desktop:build并启动新EXE；实际点击原同步按钮、展开豆粕67条仓单历史、查看沪铜两份合约及展期公式、验证大商所412和来源弹窗，未发现页面脚本错误。
- 浏览器实采取得${stats.warehouseRows}条仓单和${stats.rollProducts}条展期结果；桌面重复同步复用同日有效缓存，仍显示「部分取得」和7项来源缺口，没有冒充全量完成。
- 获得五简「我已退出小木」确认后启动正式新版；正式4318服务再次点击仓单历史、展期资料和来源弹窗，并核验能源中心归属、旧数据、缺失状态。
- 仅导入${imported.importedRecords}条补充缓存记录；导入前备份在「.runtime/ui-history/2026-10-25-data-gaps-before/market-panorama/market.sqlite」。行情K线、席位及其他缓存未被改写，正式业务库内容指纹一致。
- 六份规则保护文件哈希一致：板块规则、环境规则、五行业务、金四法、火扫描、主力认定。原布局、筛选阈值、账户权限与交易规则保留。

桌面构建：「.runtime/desktop-data-gaps-20261025/小木-win32-x64/小木.exe」。旧版桌面和快捷方式备份均保留。没有触发交易批准或下单。

## 原始证据

证据目录：${resolve(out)}，含逐源响应、真实刷新任务、浏览器与桌面点击记录、正式服务截图、导入前后核验、测试及构建日志。

接口说明：[AKShare官方期货数据文档](https://akshare.akfamily.xyz/data/futures/futures.html)；[大商所合约适配器官方源码](https://github.com/akfamily/akshare/blob/main/akshare/futures_derivative/futures_contract_info_dce.py)。本报告的可用性以本机实际响应为准。
`;
const mdFile='docs/数据缺口排查验收-2026-10-25.md',htmlFile='docs/数据缺口排查验收-2026-10-25.html';
await writeFile(mdFile,md);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const figures=[['正式服务：豆粕仓单历史展开','formal-warehouse-click.png'],['正式服务：沪铜展期两合约与计算口径','formal-roll-click.png'],['桌面实际点击：来源状态及大商所缺口','desktop-source-gaps-click.png']];
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>数据缺口续修验收 · 小木</title><style>body{font:16px/1.8 'Microsoft YaHei UI',sans-serif;background:#f6f7fd;color:#29364f;max-width:1250px;margin:28px auto;padding:0 20px}h1{font-size:28px}section{background:white;border:1px solid #dbe2f1;padding:20px;margin:18px 0;border-radius:8px}table{width:100%;border-collapse:collapse}th{background:#3b5ba6;color:white}th,td{padding:10px;border:1px solid #dbe2f1;text-align:left}img{width:100%;height:auto}a{color:#3157a6}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit}small{color:#52627a}</style><h1>小木工作台 · 数据缺口续修验收</h1><p>2026-10-25 · 新版已启用 · 原账户、布局与交易规则保留</p><section><table><tr><th>项目</th><th>结果</th><th>缺口</th></tr><tr><td>仓单历史</td><td>${stats.warehouseProducts}个商品品种 · ${stats.warehouseRows}条历史</td><td>${stats.fresh}个截至10月23日，5个旧数据；EC未返回</td></tr><tr><td>展期参考</td><td>五个交易所 · 去重${stats.rollProducts}个品种</td><td>大商所日行情HTTP 412</td></tr><tr><td>大商所合约</td><td>保留明确缺口</td><td>HTTP 412校验页；HTTPS TLS提前断开</td></tr></table><p>使用：市场全景 → 品种跟踪 → 合约与产业证据。刷新仍走原同步按钮。仓单单位未知按原样披露；展期是同日年化对数价差率。</p><p>469项Node、16项Python通过；新桌面及正式服务已实际点击。账户库内容指纹和6份规则文件哈希保持一致。</p></section>${figures.map(([title,file])=>`<section><h2>${esc(title)}</h2><img loading="lazy" src="../output/data-gaps-2026-10-25/${file}"></section>`).join('')}<section><h2>详细说明</h2><pre>${esc(md)}</pre></section><p><a href="${mdFile.split('/').at(-1)}">查看Markdown记录</a> · <a href="产品整改验收-2026-10-25.html">查看上一轮整改历史</a></p></html>`;
await writeFile(htmlFile,html);
const entry='docs/market-panorama.md';let current=await readFile(entry,'utf8');
current=current.replace('“合约与现货资料”','“合约与产业资料”');
const old='AKShare固定1.18.96。五家交易所共683条有效期货合约及铜/甲醇两条2026-10-23现货记录已取样验证。大商所合约、现货历史、展期、99库存接口异常未启用；注册仓单历史扩展因参数兼容性未验证而未完成，既有仓单来源保留。详见[图文验收](产品整改验收-2026-10-25.html)。';
const latest=`AKShare固定1.18.96。五家交易所共683条有效期货合约及铜/甲醇两条2026-10-23现货记录已取样验证。续修已接入${stats.warehouseProducts}品种、${stats.warehouseRows}条注册仓单历史（${stats.fresh}品种截至10月23日，5个旧数据，EC未返回），以及五个交易所、去重${stats.rollProducts}品种的同日展期参考。大商所合约和日行情分别受HTTP 412及HTTPS TLS异常限制，现货历史与99库存仍有缺口；全部如实标注。详见[本轮数据缺口验收](数据缺口排查验收-2026-10-25.html)；[上一轮整改历史](产品整改验收-2026-10-25.html)保留。`;
if(current.includes(old))current=current.replace(old,latest);else if(!current.includes('本轮数据缺口验收'))throw Error('当前说明入口已变动，请复核');
await writeFile(entry,current);
const oldReport='docs/产品整改验收-2026-10-25.html';let historic=await readFile(oldReport,'utf8');
if(!historic.includes('数据缺口排查验收-2026-10-25.html')){historic=historic.replace('<div class="summary">','<p><b>后续更新：</b><a href="数据缺口排查验收-2026-10-25.html">仓单历史、展期及大商所缺口续修验收</a>。以下保留首轮结果供对照。</p><div class="summary">');await writeFile(oldReport,historic)}
const index=resolve('D:/五简个人资料/Codex/文件索引.md');let idx=await readFile(index,'utf8');
if(!idx.includes('数据缺口排查验收-2026-10-25.html'))await writeFile(index,idx.trimEnd()+`\n\n- 2026-10-25｜[小木数据缺口续修验收](<${resolve(htmlFile).replaceAll('\\','/')}>): 仓单${stats.warehouseProducts}品种/${stats.warehouseRows}条、展期去重${stats.rollProducts}品种接入；大商所412/TLS缺口如实保留。469项Node、16项Python、新桌面及正式服务点击验收；账户与规则保持。\n`);
console.log(JSON.stringify({html:resolve(htmlFile),markdown:resolve(mdFile),index}));
