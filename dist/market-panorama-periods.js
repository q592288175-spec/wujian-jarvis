export const panoramaPeriods = [
 {key:'month',period:'1mo',label:'月K'},
 {key:'week',period:'1w',label:'周K'},
 {key:'day',period:'1d',label:'日K'},
 {key:'hour',period:'120m',label:'2小时'},
 {key:'halfHour',period:'30m',label:'30分钟'}
];
export const panoramaMaLength = 10;

export function cycleResonance(signals){
 const sides=panoramaPeriods.map(p=>signals[p.key]?.side);
 if(!sides.every(s=>['long','short','flat'].includes(s)))return '数据不足';
 if(sides.every(s=>s==='long'))return '全红共振';
 if(sides.every(s=>s==='short'))return '全绿共振';
 if(sides.slice(0,2).every(s=>s==='long')&&sides.slice(2).every(s=>s==='short'))return '逆市诱空';
 if(sides.slice(0,2).every(s=>s==='short')&&sides.slice(2).every(s=>s==='long'))return '逆市诱多';
 return '混沌分歧';
}

export const resonanceLabels=['全红共振','全绿共振','逆市诱多','逆市诱空','混沌分歧','数据不足'];

// Display-only strength: keep the existing price/MA10 side and all trading filters intact.
export function signalAppearance(signal){
 if(!signal||signal.side==='missing')return {label:'不足',tone:'missing'};
 if(signal.side==='flat')return {label:'平衡',tone:'flat'};
 if(!Number.isFinite(signal.maChange))return {label:'待核',tone:'missing'};
 if(signal.side==='long')return signal.maChange>1e-9?{label:'强',tone:'strong-long'}:{label:'偏强',tone:'soft-long'};
 if(signal.side==='short')return signal.maChange < -1e-9?{label:'弱',tone:'strong-short'}:{label:'偏弱',tone:'soft-short'};
 return {label:'不足',tone:'missing'};
}
