import * as css from 'css-tree';
import {readFile,writeFile} from 'node:fs/promises';
import {migrateCss} from './redesign-css.mjs';
import {backupFiles} from './redesign-files.mjs';
const files=['dist/style.css','dist/cockpit.css','dist/cockpit-grid.css','dist/cockpit-theme.css','dist/cockpit.html','dist/theme/tokens.css','dist/shell.css'];await backupFiles('stage6',files);
const values=new Map();
function palette(source){const ast=css.parse(source,{parseCustomProperty:true});css.walk(ast,{enter(n,item,list){let value;if(n.type==='Hash')value='#'+n.value;else if(n.type==='Function'&&/^rgba?$/i.test(n.name))value=css.generate(n);else if(n.type==='Identifier'&&['white','black'].includes(n.name))value=n.name;if(value&&list){if(!values.has(value))values.set(value,'--holo-color-'+(values.size+1));list.replace(item,css.parse('var('+values.get(value)+')',{context:'value'}).children);return css.walk.skip}}});return css.generate(ast)}
for(const f of files.slice(0,4))await writeFile(f,await migrateCss(palette(await readFile(f,'utf8')),{holo:true}));
let tokens=await readFile('dist/theme/tokens.css','utf8');tokens+='\n/* Preserved immersive scene palette. Scene geometry, stars and seven sector colours are unchanged. */\n:root[data-theme="holo"]{'+[...values].map(([v,k])=>k+':'+v+';').join('')+'}\n';await writeFile('dist/theme/tokens.css',tokens);
let html=await readFile('dist/cockpit.html','utf8');html=html.replace('/workbench-theme.css?v=20261021-fit','/cockpit-theme.css');await writeFile('dist/cockpit.html',html);
let shell=await readFile('dist/shell.css','utf8');shell+='\nhtml body[data-shell=stable] #mainNav :is(button,a) :is(b,span){color:inherit}\nhtml body[data-shell=stable] .side-nav .assistant-entry{background:var(--nav-active);color:var(--nav-on-active);border-color:var(--nav-active)}\n';await writeFile('dist/shell.css',shell);
console.log('holographic CSS migrated; retained palette colours:',values.size);
