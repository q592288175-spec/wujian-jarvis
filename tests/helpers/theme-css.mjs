import {readFileSync} from 'node:fs';
// jsdom does not resolve CSS custom properties. Expand the real token values before its cascade calculation.
export function themedCss(files,theme='light'){
 const tokens=readFileSync('dist/theme/tokens.css','utf8'),vars={};
 for(const block of tokens.matchAll(/(:root(?:\[data-theme="holo"\])?)\s*\{([^}]+)\}/g)){
  if(block[1].includes('holo')&&theme!=='holo')continue;
  for(const [,key,value] of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g))vars[key]=value.trim();
 }
 let source=files.map(f=>readFileSync(f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 for(let i=0;i<8;i++)source=source.replace(/var\((--[\w-]+)(?:,([^()]*))?\)/g,(all,k,fallback)=>vars[k]||fallback||all);
 return source;
}
