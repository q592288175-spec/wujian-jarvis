export const productKey=symbol=>String(symbol||'').replace(/\d+$/,'');
export function priorReport(reports,symbol){return reports.filter(r=>r.status==='completed'&&productKey(r.symbol)===productKey(symbol)).sort((a,b)=>b.created.localeCompare(a.created))[0]||null;}
export function compareEvidence(previous,current){
 if(!previous)return {status:'first',previousId:null,notice:'首次研究，没有旧判断可核对'};
 const old=previous.evidence?.quote||{};const same=previous.symbol===current.symbol;
 const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
 return {status:same?'same-contract':'rollover',previousId:previous.id,previousCreated:previous.created,previousSymbol:previous.symbol,currentSymbol:current.symbol,priceChange:same?delta(current.last,old.last):null,openInterestChange:same?delta(current.openInterest,old.openInterest):null,notice:same?'差值为两次研究快照之差，不是当日涨跌或资金净流入；触发路径仍需历史证据核验':'合约已换月，不直接比较两个合约价格、成交量或持仓；旧判断需重新核验'};
}
export function reviewReport(text,trace){
 const sections=[['上一版审计',/上一|首次研究/],['支持与反证',/反证/],['三种情景',/基准[\s\S]*上行[\s\S]*下行/],['失效条件',/失效/],['下一次复盘',/下次|下一次|下一观察|下一检查/],['数据缺口',/缺口|待补/]];
 const missingSections=sections.filter(([,r])=>!r.test(text)).map(([n])=>n);
 const known=new Set(trace.flatMap(t=>[t.result?.url,...(t.result?.items||[]).map(i=>i.url)]).filter(Boolean));
 const links=[...text.matchAll(/https?:\/\/[^\s)\]<>（），。；]+/g)].map(m=>m[0]);
 return {status:'待人工核验',missingSections,unverifiedLinks:[...new Set(links.filter(u=>!known.has(u)))],readSources:trace.filter(t=>t.result?.text).length,notice:'程序只检查结构和链接是否来自工具记录，不代表事实正确或交易许可'};
}
