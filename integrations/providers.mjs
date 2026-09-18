import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile),cache=new Map(),pending=new Map();
const entries=[
 ['yfinance','Yahoo外围期货参考','免Key；个人研究用途；非国内月份合约','https://github.com/ranaroussi/yfinance',[]],
 ['fred','pandas-datareader / FRED','免Key读取宏观序列；公布有时滞、可能修订','https://pandas-datareader.readthedocs.io/en/latest/readers/fred.html',[]],
 ['ibapi','IBApi','需要TWS/IB Gateway登录与相应行情订阅；非普遍免费','https://www.interactivebrokers.com/docs/general/market-data-subscriptions/introduction',['IB_GATEWAY']],
 ['alpha_vantage','Alpha Vantage','需注册Key；免费额度受限；实际权限按套餐','https://www.alphavantage.co/support/',['ALPHA_VANTAGE_API_KEY']],
 ['nasdaq','Nasdaq Data Link','需选定可用数据集与权限；不能把全部数据集视为免费','https://docs.data.nasdaq.com/',['NASDAQ_DATA_LINK_API_KEY']],
 ['twelve','Twelve Data','需Key；Basic额度及用途受限，显示授权需核实','https://twelvedata.com/pricing',['TWELVE_DATA_API_KEY']],
 ['polygon','Polygon / Massive','需Key及数据权限，具体免费范围待账号核验','https://massive.com/docs/rest/quickstart',['MASSIVE_API_KEY']],
 ['tradier','Tradier','实时美股/期权需经纪账户；Sandbox数据延迟','https://docs.tradier.com/docs/market-data',['TRADIER_TOKEN']],
 ['alpaca','Alpaca-py','需账户Key；Basic股票实时覆盖仅IEX','https://docs.alpaca.markets/us/docs/about-market-data-api',['ALPACA_API_KEY','ALPACA_SECRET_KEY']],
 ['finnhub','Finnhub','需注册Key；端点及市场权限待账号核验','https://finnhub.io/docs/api',['FINNHUB_API_KEY']],
 ['marketstack','Marketstack','需Key；套餐额度、HTTPS及端点权限待核验','https://marketstack.com/documentation',['MARKETSTACK_API_KEY']],
 ['tiingo','Tiingo','需Token；免费范围与用途按账号权限核验','https://www.tiingo.com/documentation/general/overview',['TIINGO_TOKEN']]
];
export function providers(){return entries.map(([id,name,scope,docs,env])=>({id,name,scope,docs,required:env,status:['yfinance','fred'].includes(id)?'adapter_ready':'requires_setup',adapterImplemented:['yfinance','fred'].includes(id),lastResult:cache.get(id)?.status||null,credentialsConfigured:env.length?env.every(k=>!!process.env[k]):null}));}
export async function externalData(id){
 if(!['yfinance','fred'].includes(id))return{status:'requires_setup',error:'此源尚未完成凭证及数据权限接入，不返回示例值。'};
 const prior=cache.get(id);if(prior&&Date.now()-Date.parse(prior.fetchedAt)<900000)return{...prior,cached:true};
 if(pending.has(id))return pending.get(id);
 const task=(async()=>{try{const {stdout}=await run(resolve(root,'.venv-data/bin/python'),[resolve(root,'integrations/data_bridge.py'),id],{timeout:80000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONUNBUFFERED:'1'}});const data=JSON.parse(stdout);if(!['ok','partial','unavailable'].includes(data.status))throw Error();if(data.status==='unavailable'&&prior?.items?.length)return {...prior,status:'stale',cached:true,error:'刷新未取得有效值，保留上次结果'};cache.set(id,data);await mkdir(resolve(root,'.runtime/data'),{recursive:true});await writeFile(resolve(root,`.runtime/data/${id}.json`),JSON.stringify(data));return data;}catch{let old=prior;try{old ||= JSON.parse(await readFile(resolve(root,`.runtime/data/${id}.json`),'utf8'))}catch{}return old?.items?.length?{...old,status:'stale',cached:true,error:'刷新失败，以下是历史缓存，禁止当作当前数据'}:{provider:id,status:'unavailable',items:[],error:'数据请求失败或依赖未安装，未使用模拟数据补齐'};}finally{pending.delete(id)}})();pending.set(id,task);return task;
}
export const externalTool={type:'function',name:'get_external_context',description:'读取Yahoo海外期货日线参考或FRED宏观数据，返回观测日期、来源、单位和获取时间。不是国内期货实时行情，禁止替代国内合约报价。',parameters:{type:'object',properties:{provider:{type:'string',enum:['yfinance','fred']}},required:['provider'],additionalProperties:false}};
