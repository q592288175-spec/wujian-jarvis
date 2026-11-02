import * as css from 'css-tree';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {backupFiles} from './redesign-files.mjs';
export async function migrateCss(source,{holo=false}={}){
 const ast=css.parse(source,{parseCustomProperty:true});
 css.walk(ast,{visit:'Declaration',enter(d){
  const p=d.property;d.important=false;
  if(p==='color-scheme'){d.value=css.parse('var(--scheme)',{context:'value'});return}
  if(p==='font-family'){d.value=css.parse(p.includes('mono')?'var(--font-mono)':'var(--font)',{context:'value'});return}
  if(p==='font-size'){
   css.walk(d.value,{visit:'Dimension',enter(n,item,list){if(n.unit==='px'){const x=Number(n.value),v=holo&&x<12?'var(--fs-holo)':`var(--fs-${x<=12?'xs':x<=13?'sm':x<=15?'md':x<=18?'lg':x<=22?'xl':'kpi'})`;list.replace(item,css.parse(v,{context:'value'}).children)}}});return;
  }
  if(p==='border-radius')css.walk(d.value,{visit:'Dimension',enter(n,item,list){if(n.unit==='px'){const x=+n.value;if(x<40)list.replace(item,css.parse(`var(--r-${x<=4?'sm':x<=6?'md':'lg'})`,{context:'value'}).children)}}});
  const replace=(n,item,list)=>{
   let c;
   if(n.type==='Hash'){let h=n.value;if([3,4].includes(h.length))h=[...h].map(c=>c+c).join('');c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));c.push(h.length===8?parseInt(h.slice(6),16)/255:1)}
   else if(n.type==='Function'&&/^rgba?$/i.test(n.name)){const a=css.generate(n).match(/[\d.]+/g)?.map(Number);if(a?.length>=3)c=[...a.slice(0,3),a[3]??1]}
   else if(n.type==='Identifier'&&['white','black'].includes(n.name))c=n.name==='white'?[255,255,255,1]:[0,0,0,1];
   if(!c)return;const [r,g,b,a]=c,max=Math.max(r,g,b),min=Math.min(r,g,b),sat=(max-min)/255,l=(max+min)/510;
   const hue=max===min?'gray':r===max?(g>b?'warm':'red'):g===max?'green':'blue';
   const isText=p==='color'||p==='fill'||p==='stroke'||p.endsWith('-color')&&!p.includes('border')&&!p.includes('background');
   let token;
   if(p.includes('shadow')||p==='--shadow')token='shadow';
   else if(p.startsWith('border')||p.includes('outline'))token=sat>.35&&l>.30?(hue==='red'?'up':hue==='green'?'down':hue==='warm'?'warn':'accent'):'line';
   else if(isText){token=sat>.17?(hue==='red'?'up':hue==='green'?'down':hue==='warm'?'warn':'accent'):(l>.65||l<.3?'text':'muted')}
   else{token=sat>.20?(hue==='red'?(l>.40&&l<.65?'up':'up-soft'):hue==='green'?(l>.42&&l<.65?'down':'down-soft'):hue==='warm'?'warn-soft':(l>.4&&l<.65?'accent':'accent-soft')):(l>.93?'surface':l>.75?'raised':l<.12?'surface':'raised')}
   if(p==='--direction')token=hue==='green'?'down':'up';
   if(p==='--direction-bg'||p==='--direction-row')token=hue==='green'?'down-soft':'up-soft';
   let value=`var(--${token})`;if(a<1)value=`color-mix(in srgb, ${value} ${+(a*100).toFixed(2)}%, transparent)`;
   list.replace(item,css.parse(value,{context:'value'}).children);return css.walk.skip;
  };
  css.walk(d.value,{enter:replace});
 }});
 // Drop obsolete global palette declarations; theme tokens own the palette.
 css.walk(ast,{visit:'Rule',enter(rule){if(rule.prelude?.type!=='SelectorList')return;
  const selector=css.generate(rule.prelude);
  rule.block.children.forEach((d,item,list)=>{if(d.type==='Declaration'&&/^(--bg|--surface|--raised|--line|--line-strong|--muted|--text|--red|--green|--accent|--panel|--fire|--water|--metal|--earth|--wood|--warn|--danger)$/.test(d.property))list.remove(item)});
 }});
 return css.generate(ast).replace(/}/g,'}\n');
}
if(process.argv[2]==='panorama'){
 const files=['dist/market-panorama.css','dist/market-panorama-light.css','dist/market-panorama-clarity.css','dist/market-panorama.html'];await backupFiles('stage3',files);
 await mkdir('dist/theme',{recursive:true});
 let tokens=await readFile('docs/redesign-2026-10-25/tokens.proposed.css','utf8');
 tokens=tokens.replace('color-scheme:light;','color-scheme:light; --scheme:light; --shadow:#15223d; --fs-holo:11px;').replace('color-scheme:dark;','color-scheme:dark; --scheme:dark; --shadow:#000000;');
 tokens+='\n:root{--panel:var(--surface);--red:var(--up);--green:var(--down);--page-accent:var(--accent);--page-action:var(--accent);--page-ink:var(--on-accent);--page-frame:var(--line-strong);--page-accent-soft:var(--accent-soft)}\n';
 await writeFile('dist/theme/tokens.css',tokens);
 const combined=(await Promise.all(files.slice(0,3).map(f=>readFile(f,'utf8')))).join('\n');
 await writeFile(files[0],await migrateCss(combined)+`\n/* Unified readable table semantics; dimensions and interactions are preserved. */
body{font-family:var(--font)}
html body [hidden]{display:none}
html body .long{color:var(--up);font-weight:650}html body .short{color:var(--down);font-weight:650}html body .neutral{color:var(--muted)}
html body table th{background:var(--accent-strong);color:var(--on-accent);height:var(--head-h)}
html body table th button{color:inherit;background:transparent}html body table td{height:var(--row-h)}
html body .table-wrap th:first-child{background:var(--accent-strong);color:var(--on-accent)}
html body .sidebar{background:var(--nav-bg);color:var(--nav-text)}html body .sidebar nav a{color:var(--nav-text)}
html body .sidebar nav a.active{background:var(--nav-active);color:var(--nav-on-active)}html body .sidebar .brand small,html body .sidebar-bottom{color:var(--nav-muted)}
html body .primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
html body .sidebar nav a:hover{background:var(--nav-active)}
`);
 let html=await readFile(files[3],'utf8');html=html.replace(/<link rel="stylesheet" href="\/market-panorama(?:-light|-clarity)?\.css[^>]*>/g,'').replace('<link rel="icon"','<link rel="stylesheet" href="/theme/tokens.css"><link rel="stylesheet" href="/market-panorama.css">\n <link rel="icon"');await writeFile(files[3],html);
 console.log('panorama stylesheet consolidated');
}
