// One successful public fee refresh per Beijing date; failed attempts retry hourly.
export function feeRefreshDue(status, at=new Date()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
 if(!status?.checkedAt||status.checkedAt.slice(0,10)!==day)return true;
 return status.status!=='ok'&&at.getTime()-Date.parse(status.checkedAt)>=3600000;
}
export function preferredFeeRows(rows){
 const byContract=new Map();
 for(const row of rows){const existing=byContract.get(row.key);if(!existing||row.kind==='fee-jiaoyixingqiu'&&existing.kind!=='fee-jiaoyixingqiu')byContract.set(row.key,row)}
 return [...byContract.values()];
}
