import {readFile,writeFile} from 'node:fs/promises';import {backupFiles} from './redesign-files.mjs';
await backupFiles('stage7-polish',['dist/workbench.js','dist/market-panorama.js','dist/market-panorama.css','dist/shell.css']);
let w=await readFile('dist/workbench.js','utf8');w=w.replace('function renderHome(){const s=state.summary','async function renderHome(){state.fire=await api(\'/api/workbench/fire\');const s=state.summary');await writeFile('dist/workbench.js',w);
let p=await readFile('dist/market-panorama.js','utf8');p=p.replace("其他页面分类不变。","显示分类在三个界面统一，金页环境指数仍沿用原规则分类并标明来源。");p=p.replace("return section('品种走势对比',picker", "return note('强弱榜比较三周期趋势；火候选仍以原筛选规则为准，排名不授予交易许可。')+section('品种走势对比',picker");await writeFile('dist/market-panorama.js',p);
let css=await readFile('dist/market-panorama.css','utf8');css+=`
/* Direction colours remain red/green; warning colours never stand in for a bullish signal. */
html body[data-shell=panorama] #content table th,html body[data-shell=panorama] #content .table-wrap th:first-child{background:var(--accent-strong);color:var(--on-accent)}
html body[data-shell=panorama] #content table th button{color:inherit}
html body[data-shell=panorama] #content .long{color:var(--up)}html body[data-shell=panorama] #content .short{color:var(--down)}
html body[data-shell=panorama] .cycle-stat.bull .cycle-ratio>b,html body[data-shell=panorama] .cycle-structure.bull{color:var(--up)}
html body[data-shell=panorama] .cycle-stat.bear .cycle-ratio>b,html body[data-shell=panorama] .cycle-structure.bear{color:var(--down)}
html body[data-shell=panorama] .cycle-meter.bull progress::-webkit-progress-value{background:var(--up)}html body[data-shell=panorama] .cycle-meter.bear progress::-webkit-progress-value{background:var(--down)}
html body[data-shell=panorama] .cycle-meter.bull progress::-moz-progress-bar{background:var(--up)}html body[data-shell=panorama] .cycle-meter.bear progress::-moz-progress-bar{background:var(--down)}
html body[data-shell=panorama] .cycle-classification.bull .cycle-class-title b,html body[data-shell=panorama] .cycle-classification.bull .cycle-class-products button{color:var(--up)}
html body[data-shell=panorama] .cycle-classification.bear .cycle-class-title b,html body[data-shell=panorama] .cycle-classification.bear .cycle-class-products button{color:var(--down)}
html body[data-shell=panorama] #content .signal-badge.strong-long{background:var(--up);color:var(--on-accent)}html body[data-shell=panorama] #content .signal-badge.strong-short{background:var(--down);color:var(--on-accent)}
html body[data-shell=panorama] #content .signal-badge.soft-long{background:var(--up-soft);color:var(--up)}html body[data-shell=panorama] #content .signal-badge.soft-short{background:var(--down-soft);color:var(--down)}
html body[data-shell=panorama] .matrix-legend .strong-long:before{background:var(--up)}html body[data-shell=panorama] .matrix-legend .strong-short:before{background:var(--down)}
html body[data-shell=panorama] .chips button.active{background:var(--accent);color:var(--on-accent)}
html body[data-shell=panorama] .ranking-sector-tag{background:var(--raised);color:var(--muted)}
html body[data-shell=panorama] .ranking-sector-tag[data-sector="贵金属"]{color:var(--metal);background:var(--metal-soft)}
html body[data-shell=panorama] .ranking-sector-tag[data-sector="有色"]{color:var(--water);background:var(--water-soft)}
html body[data-shell=panorama] .ranking-sector-tag[data-sector="新能源"]{color:var(--wood);background:var(--wood-soft)}
html body[data-shell=panorama] .ranking-sector-tag[data-sector="化工"]{color:var(--fire);background:var(--fire-soft)}
html body[data-shell=panorama] .ranking-sector-tag[data-sector="能源"]{color:var(--earth);background:var(--earth-soft)}
html body[data-shell=panorama] .ranking-sector-tag[data-sector="农产品"],html body[data-shell=panorama] .ranking-sector-tag[data-sector="农副产品"]{color:var(--wood);background:var(--wood-soft)}
`;await writeFile('dist/market-panorama.css',css);
let shell=await readFile('dist/shell.css','utf8');shell+='\n@media(max-width:760px){html body[data-shell=stable] .account-picker,html body[data-shell=stable] .account-picker select{display:block}html body[data-shell=stable] .account-controls{display:flex;flex-wrap:wrap}html body[data-shell=stable] #mainNav{max-height:160px}html body[data-shell=stable] .side-nav .assistant-entry{align-self:flex-end}}\n';await writeFile('dist/shell.css',shell);
