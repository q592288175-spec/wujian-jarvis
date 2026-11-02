import {readFile,writeFile} from 'node:fs/promises';
import * as css from 'css-tree';
import {migrateCss} from './redesign-css.mjs';
import {backupFiles} from './redesign-files.mjs';
const files=['dist/workbench.css','dist/workbench-theme.css','dist/relative-strength.css','dist/gold-ui.css','dist/knowledge.css','dist/monitor.css','dist/rule-details.css','dist/ui/conversation-window.css','dist/account-ui.css','dist/water-expert.css','dist/index.html','dist/account-ui.js','dist/workbench.js','dist/theme/tokens.css','dist/shell.css'];await backupFiles('stage5',files);
const theme=css.parse(await readFile('dist/workbench-theme.css','utf8'),{parseCustomProperty:true});
const split=holo=>{const ast=css.clone(theme);css.walk(ast,{visit:'Rule',enter(r,item,list){if(r.prelude?.type!=='SelectorList')return;r.prelude.children.forEach((s,si,sl)=>{const text=css.generate(s),isHolo=text.includes('.cockpit')&&!text.includes(':not(.cockpit)');if((holo&&text.includes(':not(.cockpit)'))||(!holo&&isHolo))sl.remove(si)});if(!r.prelude.children.size)list.remove(item)}});return css.generate(ast)};
await writeFile('dist/cockpit-theme.css',split(true));
const base=await readFile('dist/workbench.css','utf8');
await writeFile('dist/workbench.css',await migrateCss(base+'\n'+split(false))+`
/* Light workspace, with existing controls and content preserved. */
body:not(.cockpit){--side:var(--nav-bg);background:var(--bg);color:var(--text)}body:not(.cockpit)::before{display:none}
html body .app-shell{display:block}html body .side-nav{position:fixed;inset:0 auto 0 0;z-index:20}
html body .topbar{position:sticky;min-height:var(--topbar-h);height:auto;padding:10px 24px;background:var(--surface)}
html body .top-meta{gap:10px}html body .side-nav .brand{padding:0 0 10px;gap:4px}html body .brand-mark{width:70px;height:70px}
html body .side-nav :is(.brand b,.assistant-entry){color:var(--nav-text)}html body .side-foot{color:var(--nav-muted)}
html body :is(input,select,textarea){background:var(--surface);color:var(--text);border-color:var(--line-strong)}
html body :is(.panel,.balance-panel,.research-snapshot,.research-report,.strategy-summary){background:var(--surface);border-color:var(--line)}
html body .primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
html body .secondary{background:var(--raised);border-color:var(--line-strong);color:var(--text)}html body .danger{background:var(--danger-soft);color:var(--danger)}
html body .hint{background:var(--water-soft);color:var(--water)}html body .warning{background:var(--warn-soft);color:var(--warn)}
html body table th{background:var(--accent-strong);color:var(--on-accent);height:var(--head-h);font-weight:600}html body table td{min-height:var(--row-h);font-variant-numeric:tabular-nums}
html body .fire-long{--direction:var(--up);--direction-bg:var(--up-soft);--direction-row:var(--up-soft)}
html body .fire-short{--direction:var(--down);--direction-bg:var(--down-soft);--direction-row:var(--down-soft)}
html body .fire-overview-group.fire-long .fire-strength-strong{background:var(--up);color:var(--on-accent)}
html body .fire-overview-group.fire-long .fire-strength-medium{background:var(--up-mid);color:var(--up-ink)}
html body .fire-overview-group.fire-long .fire-strength-weak{background:var(--up-soft);color:var(--up-ink)}
html body .fire-overview-group.fire-short .fire-strength-strong{background:var(--down);color:var(--on-accent)}
html body .fire-overview-group.fire-short .fire-strength-medium{background:var(--down-mid);color:var(--down-ink)}
html body .fire-overview-group.fire-short .fire-strength-weak{background:var(--down-soft);color:var(--down-ink)}
html body .fire-structure.long-strong{background:var(--up-soft);border-left-color:var(--up)}html body .fire-structure.long-strong :is(span,small){color:var(--up)}
html body .fire-structure.long-partial{background:var(--warn-soft);border-left-color:var(--warn)}html body .fire-structure.long-partial :is(span,small){color:var(--warn)}
html body .fire-structure.short-strong{background:var(--down-soft);border-left-color:var(--down)}html body .fire-structure.short-strong :is(span,small){color:var(--down)}
html body .fire-structure.short-partial{background:var(--water-soft);border-left-color:var(--water)}html body .fire-structure.short-partial :is(span,small){color:var(--water)}
html body .fire-structure:is(.long-none,.short-none,.neutral){background:var(--raised);border-left-color:var(--line)}html body .fire-structure:is(.long-none,.short-none,.neutral) :is(span,small){color:var(--text)}
html body .badge.fire{color:var(--fire);background:var(--fire-soft)}html body .badge.water{color:var(--water);background:var(--water-soft)}html body .badge.metal{color:var(--metal);background:var(--metal-soft)}
html body .research-snapshot h4,html body .research-shift b,html body .research-report-body h2{color:var(--water)}
html body .research-dimension.long h4 span{color:var(--up)}html body .research-dimension.short h4 span{color:var(--down)}
html body [hidden]{display:none}html body .balance-panel>summary{display:flex;gap:14px;justify-content:space-between;align-items:center;cursor:pointer;line-height:1.7}
html body .balance-panel>summary strong{font-weight:650}html body .balance-panel>summary span{color:var(--muted);font-size:var(--fs-sm)}
@media(max-width:760px){html body .side-nav{position:static;height:auto}html body .main-shell{margin-left:0}html body .topbar{position:static}html body .brand-mark{width:48px;height:48px}html body .side-nav .brand{flex-direction:row;justify-content:flex-start}html body .balance-panel>summary{display:block}}
`);
for(const f of files.slice(2,10))await writeFile(f,await migrateCss(await readFile(f,'utf8')));
let tokens=await readFile('dist/theme/tokens.css','utf8');tokens+='\n:root{--up-mid:#f39a94;--up-ink:#6b1913;--down-mid:#83c3a5;--down-ink:#143b2b;--side:var(--nav-bg);--cyan:var(--accent);--surface-2:var(--raised)}\n';await writeFile('dist/theme/tokens.css',tokens);
let html=await readFile('dist/index.html','utf8');html=html.replace(/\s*<link rel="stylesheet" href="\/workbench-theme.css[^>]*>/,'').replace('content="dark"','content="light"');await writeFile('dist/index.html',html);
// Full records stay on account/rules; gold and wood show a collapsed summary with the same actions.
let account=await readFile('dist/account-ui.js','utf8');account=account.replace("export function accountPanel(a,changes=[],compact=false){if(!a)return'';return`<section", "export function accountPanel(a,changes=[],compact=false){if(!a)return'';const content=`<section");
account=account.replace('</details>`}</section>`}', '</details>`}</section>`;if(!compact)return content;return content.replace(\'<section class="balance-panel" aria-label="账户资金概况">\',`<details class="balance-panel" aria-label="账户资金概况"><summary><strong>${esc(a.alias)} · 最新余额 ${fmt(a.currentBalance)} 元</strong><span>展开账户操作与资金摘要</span></summary>`).replace(\'</section>\',\'<p><a href="/?view=rules">查看完整余额变动记录</a></p></details>\')}');
if(!account.includes('const content=')||!account.includes('展开账户操作'))throw Error('account panel patch failed');await writeFile('dist/account-ui.js',account);
let app=await readFile('dist/workbench.js','utf8');app=app.replace('const balancePanel=(a,c)=>accountPanel(a,c);','const balancePanel=(a,c)=>accountPanel(a,c,true);');
app=app.replace('${label}</b><select name="${key}Direction"','${label}${key===\'sector\'&&l.target?`<small class="muted">${esc(l.target)}</small>`:\'\'}</b><select name="${key}Direction"');await writeFile('dist/workbench.js',app);
console.log('stable light theme and collapsed account panels ready');
