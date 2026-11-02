import {backupFiles,replaceFile} from './redesign-files.mjs';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {databaseManifest} from './system-backup.mjs';
await backupFiles('data-gaps',['integrations/market_panorama_supplement.py','integrations/market-panorama-data.py','integrations/market-panorama.mjs','data/panorama-sources.json','dist/market-supplement-ui.js','dist/market-panorama.css','docs/market-panorama.md']);
const output='output/data-gaps-2026-10-25';await mkdir(output,{recursive:true});const hashes={};for(const f of ['dist/sectors.js','integrations/environment.mjs','integrations/five-workbench.mjs','dist/gold-methods.js','scripts/fire_scan.py','integrations/eod_market.py'])hashes[f]=createHash('sha256').update(await readFile(f)).digest('hex');await writeFile(output+'/baseline.json',JSON.stringify({hashes,business:databaseManifest('.runtime/five-workbench.sqlite')},null,2));
await replaceFile('integrations/market-panorama-data.py',[["value = getattr(ak, request[\"name\"])(**request[\"args\"])",`if request["name"].startswith("xiaomu_"):
                from market_panorama_extras import fetch_warrant_history, fetch_exchange_daily, fetch_dce_contracts
                adapters={"xiaomu_warrant_history":fetch_warrant_history,"xiaomu_exchange_daily":fetch_exchange_daily,"xiaomu_dce_contracts":fetch_dce_contracts}
                value=adapters[request["name"]](**request["args"])
            else:
                value = getattr(ak, request["name"])(**request["args"])`]]);
await replaceFile('integrations/market_panorama_supplement.py',[["config=json.loads((ROOT/\"data/panorama-sources.json\").read_text(\"utf-8\")); count=0; failures=[]",`config=json.loads((ROOT/"data/panorama-sources.json").read_text("utf-8")); count=0; failures=[]
    from market_panorama_extras import collect_extras
    extra=collect_extras(db,catalog,day,ak_call,save,now,{s['key'] for s in config['sources'] if s.get('enabled')})
    count+=extra['rows'];failures.extend(extra['failures'])`],["if not s.get(\"enabled\"):continue","if not s.get(\"enabled\") or key in ('warrant_history','roll_yield'):continue"]]);
let config=JSON.parse(await readFile('data/panorama-sources.json','utf8'));
for(const s of config.sources){if(s.key==='warrant_history'){s.enabled=true;s.status='ok';s.reason='已修复代码大小写适配，改用现有同源公开JSON按品种、日期读取；实际覆盖见缓存核验';s.source='东方财富注册仓单（与既有来源相同）'}if(s.key==='roll_yield'){s.enabled=true;s.status='partial';s.reason='改为六交易所独立采集同日日行情，程序计算持仓前二合约年化对数价差率；大商所失败单列';s.source='交易所日行情 / AKShare；小木计算展期参考'}if(s.key==='contract_dce'){s.reason='2026-10-25实测：HTTP接口返回412安全校验HTML；HTTPS TLS连接提前断开；未绕过验证。AKShare与上游当前源码同一路径。';s.checkedAt=new Date().toISOString()}}
await writeFile('data/panorama-sources.json',JSON.stringify(config,null,2));
await replaceFile('integrations/market-panorama.mjs',[["return {...c,contractInfo:","return {...c,warrantHistory:record('warrant-history',c.code,day),warrantStatus:record('supplement-status','warrant:'+c.code,day),rollYield:record('roll-yield',c.code,day),rollStatus:record('supplement-status','roll-product:'+c.code,day)||record('supplement-status','roll:'+c.exchange,day),contractInfo:"]]);
console.log('仓单与分交易所展期资料已接入既有同步及缓存，规则文件未修改');
