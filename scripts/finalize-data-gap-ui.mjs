import {readFile,writeFile} from 'node:fs/promises';
let text=await readFile('dist/market-supplement-ui.js','utf8');text=text.replace('<h3>注册仓单历史</h3>${last?`<p>','<h3>注册仓单历史</h3>${last?`${currentGap}<p>');
text=text.replace('<h3>展期参考 · 年化对数价差率</h3>${r?`<p>','<h3>展期参考 · 年化对数价差率</h3>${r?`${p.rollStatus&&p.rollStatus.status!==\'ok\'?`<p class="caption">本次刷新缺口：${esc(p.rollStatus.reason)}；以下为已取得资料。</p>`:\'\'}<p>');await writeFile('dist/market-supplement-ui.js',text);
