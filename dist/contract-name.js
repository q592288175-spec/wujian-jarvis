export function contractName(q){
 const symbol=q.symbol||'';const month=symbol.match(/(\d+)$/)?.[1]||'';
 const product=symbol.split('.')[1]?.replace(/\d+$/,'')||'';
 const names={IM:'中证1000',IF:'沪深300',IH:'上证50',IC:'中证500',TA:'PTA',MA:'甲醇',CF:'棉花'};
 return names[product]?names[product]+(q.name?.match(/\d{4}$/)?.[0]||month):(q.name||symbol);
}
