import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const dir='.runtime/wujian.iconset';await mkdir(dir,{recursive:true});
execFileSync('swift',['scripts/render-app-icon.swift','desktop/assets/wujian-app.svg','desktop/assets/wujian-app-1024.png']);
for(const size of [16,32,128,256,512])for(const scale of [1,2])execFileSync('sips',['-z',String(size*scale),String(size*scale),'desktop/assets/wujian-app-1024.png','--out',`${dir}/icon_${size}x${size}${scale===2?'@2x':''}.png`]);
execFileSync('iconutil',['-c','icns',dir,'-o','desktop/assets/wujian-app.icns']);
console.log('Built native 16–1024px iconset and ICNS');
