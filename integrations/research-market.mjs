import {marketSnapshot} from './market.mjs';
import {latestFire,specificBars} from './five-workbench.mjs';
import {contractName} from '../dist/contract-name.js';

const rawSymbol=value=>String(value||'').trim().split('.').at(-1).toUpperCase();
const isContract=value=>/^[A-Z]{1,3}\d{3,4}$/.test(value);
const date=value=>{const day=String(value||'').slice(0,10),parsed=Date.parse(day+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===day?day:null};
const validBar=b=>['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close);

export function resolveProduct(quotes,input){
 const needle=String(input||'').trim().toLowerCase();if(!needle||needle.length>60)throw Error('请输入一个品种名称或合约代码');
 const match=q=>{const raw=q.symbol?.split('.').at(-1);return[contractName(q),q.name,q.symbol,raw,q.actualContract,raw?.replace(/\d+$/,'')].filter(Boolean).map(x=>x.toLowerCase())};
 let found=quotes.filter(q=>match(q).includes(needle));if(!found.length)found=quotes.filter(q=>match(q).some(n=>n.startsWith(needle)));
 if(found.length!==1)throw Error(found.length?'匹配到多个品种，请输入完整名称或合约代码':'未取得该品种行情，请先刷新盘后数据或指定具体合约');return found[0];
}

// Research follows the selected contract, independently of the continuous-quote pool.
export async function researchMarket({product,framework,card}, {getFire=latestFire,getSnapshot=marketSnapshot,getBars=specificBars,now=Date.now()}={}){
 const fire=await getFire(),fw=framework.context.framework,code=fw.symbol.toUpperCase();
 const row=(fire.rows||[]).find(r=>r.code===code),input=rawSymbol(product);
 const contract=rawSymbol(card?.contract||(isContract(input)?input:row?.main_contract));
 if(contract&&!isContract(contract))throw Error('交易卡具体合约代码无效，请核对后研究');
 if(contract&&contract.replace(/\d+$/,'')!==code)throw Error('具体合约与品种研究框架不一致');
 if(card&&isContract(input)&&rawSymbol(card.contract)!==input)throw Error('研究合约与交易卡不一致');
 if(!contract){
  const snapshot=await getSnapshot('all');
  if(!['observing','eod-ready'].includes(snapshot.status))throw Error('暂无具体合约映射，盘后行情也未就绪，请刷新数据后重试');
  const q=resolveProduct(snapshot.quotes,code);
  return{snapshot:{...snapshot,quotes:[q]},quote:q,context:{contract:null,series:q.symbol,dataDate:q.tradingDay||q.quoteTime,source:snapshot.source,priceBasis:'主力连续代理',warnings:['未取得具体合约映射，本次仅研究主力连续代理，不提供具体合约价位。']}};
 }
 let saved;try{saved=await getBars(contract)}catch(error){throw Error(`${contract} 具体合约日线暂未取得，请刷新盘后数据后重试（${error.message}）`)}
 if(rawSymbol(saved.contract)!==contract)throw Error('返回行情与研究合约不一致，已停止研究');
 const local=new Date(now+8*3600000).toISOString(),today=local.slice(0,10),target=date(fire.target_date||fire.data_date||fire.scan_date)||today;
 const cutoff=target<today?target:today;
 const eligible=(saved.bars||[]).filter(b=>date(b.date)&&date(b.date)<=cutoff&&!(date(b.date)===today&&local.slice(11,16)<'15:30')&&b.provisional!==true&&b.complete!==false&&validBar(b));
 const unique=[...new Map(eligible.map(b=>[date(b.date),b])).entries()].sort(([a],[b])=>a.localeCompare(b));
 const bars=unique.map(([day,b])=>({...b,date:day,timeNs:String(BigInt(Date.parse(day+'T00:00:00+08:00'))*1000000n),complete:true,volume:Number.isFinite(b.volume)?b.volume:null,openInterest:Number.isFinite(b.openInterest)?b.openInterest:null}));
 if(bars.length<2)throw Error(`${contract} 尚无两根可核验的完成日K，请刷新盘后数据；不会用其他月份合约替代`);
 const last=bars.at(-1),previous=bars.at(-2),source=last.source||saved.source||'具体合约日线';
 const warnings=[];
 if(last.date<target)warnings.push(`目标行情日为${target}，${contract}最近可核验完成日K为${last.date}，本次按该历史截点研究，后续价格变化未覆盖。`);
 if(row?.main_contract&&rawSymbol(row.main_contract)!==contract)warnings.push(`交易卡绑定${contract}，当前扫描主力为${row.main_contract}；本次仍使用${contract}，未自动换月。`);
 if(bars.length<250)warnings.push(`具体合约仅取得${bars.length}根完成日K，250日区间不足；周/月历史不足时不补造MA10。`);
 const quote={symbol:`${fw.exchange}.${contract}`,actualContract:contract,productCode:code,name:fw.name,seriesType:'specific_contract',tradingDay:last.date,quoteTime:last.date,close:last.close,last:last.close,preClose:previous.close,volume:last.volume,openInterest:last.openInterest,changePct:(last.close/previous.close-1)*100,bars,quality:{timeStatus:'completed-eod',priceBasis:'completed_close',changeBasis:'previous_completed_close',validPrice:true,validPreviousClose:true,notice:'同一具体合约完成日K，非盘中实时行情'}};
 const context={contract,series:quote.symbol,dataDate:last.date,targetDate:target,source,priceBasis:'具体合约完成日K',bars:bars.length,previousDate:previous.date,warnings};
 return{quote,context,snapshot:{schemaVersion:1,status:'eod-ready',dataMode:'completed-eod',source,receivedAt:fire.refreshedAt||null,quotes:[quote],permission:false}};
}
