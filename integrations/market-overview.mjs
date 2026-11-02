// This evidence is exclusively for the home market view. It never alters signals,
// fire candidates, main-contract selection, settlement-based seat values or sizing.
const valid=n=>typeof n==='number'&&Number.isFinite(n);
export function closeContract(raw,exchange,day){
 const value=String(raw||'').split('.').at(-1).toUpperCase(),match=value.match(/^([A-Z]+)(\d{3})$/);
 if(exchange!=='CZCE'||!match)return value||null;
 const year=Number(String(day).slice(0,4));if(!Number.isInteger(year)||year<2000)return null;
 const digit=Number(match[2][0]),decade=Math.floor(year/10)*10;
 const fullYear=[decade-10+digit,decade+digit,decade+10+digit].sort((a,b)=>Math.abs(a-year)-Math.abs(b-year))[0];
 return match[1]+String(fullYear).slice(-2)+match[2].slice(1);
}
export function closeEvidence({contract,day,previousDay,current,previous,reason=''}){
 const base={contract:contract||null,day:day||null,previousDay:previousDay||null,basis:'同一具体合约：收盘价 / 上一交易日收盘价 − 1',status:'missing',changePct:null,change:null,close:null,previousClose:null,volume:null,interest:null,interestChange:null};
 if(!contract||!day||!previousDay)return {...base,reason:reason||'具体合约或完成交易日待核验'};
 const same=(r,d)=>r?.contract===contract&&r.day===d&&r.complete===true&&valid(r.close)&&r.close>0;
 if(!same(current,day)||!same(previous,previousDay))return {...base,reason:reason||'同一合约的相邻收盘数据不完整，未使用主连或结算价替代',lastAvailable:current?.day||null};
 if(!current.source||current.source!==previous.source)return {...base,reason:'两个交易日的来源不同或未标注，暂不计算涨跌'};
 const noTrade=!valid(current.volume)||current.volume<=0;
 return {...base,status:noTrade?'inactive':'ok',reason:noTrade?'当日无有效成交量，不纳入热门与板块统计':'',close:current.close,previousClose:previous.close,
  change:current.close-previous.close,changePct:(current.close/previous.close-1)*100,volume:current.volume,interest:current.interest??null,
  interestChange:valid(current.interest)&&valid(previous.interest)?current.interest-previous.interest:null,
  source:current.source,sourceUrl:current.sourceUrl,checkedAt:current.checkedAt};
}

export function readCloseOverview(db,products,dates){
 const day=dates[0]||null,previousDay=dates[1]||null;
 const read=(kind,key,d)=>{const r=db.prepare('SELECT body,source FROM records WHERE kind=? AND key=? AND day=?').get(kind,key,d||'');if(!r)return null;try{return {...JSON.parse(r.body),source:r.source}}catch{return null}};
 const evidence=products.map(p=>{
  const eod=read('eod',p.code,day);
  const verified=eod?.actualContract&&eod.actualContractDate===day?eod.actualContract:p.contractDate&&p.contractDate<=day?p.contract:null;
  const contract=closeContract(verified,p.exchange,day),status=read('supplement-status','overview-close:'+p.code,day);
  return {code:p.code,...closeEvidence({contract,day,previousDay,current:read('close-daily',contract||'',day),previous:read('close-daily',contract||'',previousDay),reason:status?.reason||''})};
 });
 return {day,previousDay,products:evidence,basis:'同合约收盘对昨收',updatedAt:read('supplement-status','overview-closes',day)?.checkedAt||null};
}
