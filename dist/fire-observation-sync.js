const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
export function fireSnapshotKey(fire){return JSON.stringify([fire?.data_date,fire?.sourcePath,fire?.refreshedAt,(fire?.rows||[]).map(r=>[String(r.code).toUpperCase(),r.data_date,r.main_contract,r.modes])])}

// Read the same Fire endpoint as the trade page; a cached market catalog is not the observation source.
export function mergeFireSnapshot(snapshot,fire){
 if(!Array.isArray(fire?.rows)||!fire.rows.length)return {...snapshot,fireSyncError:'火观察名单暂未取得，保留已读取结果'};
 const rows=new Map(fire.rows.map(r=>[String(r.code).toUpperCase(),r])),day=snapshot.selectedDate;
 const sourceDate=validDate(fire.data_date)?fire.data_date:fire.rows.map(r=>r.data_date).filter(validDate).sort().at(-1)||null;
 const asOf=sourceDate&&sourceDate<=day?sourceDate:null;
 const products=snapshot.products.map(p=>{const row=rows.get(p.code.toUpperCase()),date=row?.data_date;return {...p,fireModes:asOf&&validDate(date)&&date<=asOf?{...row.modes}:{},fireDate:asOf&&validDate(date)&&date<=asOf?date:null}});
 return {...snapshot,products,fireAsOf:asOf,fireSourceDate:sourceDate,fireRevision:fireSnapshotKey(fire),fireSyncError:null};
}

let publishedKey=null;
export function publishFireSnapshot(fire,target=window){
 if(!fire?.rows?.length)return;
 const key=fireSnapshotKey(fire);if(key===publishedKey)return;publishedKey=key;
 target.dispatchEvent(new target.CustomEvent('xiaomu:fire-updated',{detail:fire}));
 // Other workbench windows reload the source; no account or research content enters this signal.
 try{target.localStorage.setItem('wj-fire-revision',JSON.stringify({date:fire.data_date,at:Date.now()}))}catch{}
}
