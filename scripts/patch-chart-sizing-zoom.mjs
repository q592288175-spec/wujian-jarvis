import {readFile,writeFile} from 'node:fs/promises';
const patch=async(path,changes)=>{let text=await readFile(path,'utf8');for(const[from,to]of changes){if(!text.includes(from))throw Error('未找到 '+path+': '+from.slice(0,70));text=text.replace(from,to)}await writeFile(path,text)};
await patch('dist/workbench.js',[
 ["import {mountShell} from './shell.js';","import {mountShell} from './shell.js';\nimport {CANDLE_STYLE as candlePalette} from './candle-style.js';"],
 ['aria-label="日K图，红涨绿跌，黄色10日均线">','aria-label="日K图，红色空心上涨、绿色实心下跌、蓝色10日均线"><rect width="100%" height="100%" fill="${candlePalette.background}"/>'],
 ["color=up?'#ee7777':'#52d69b'","color=up?candlePalette.up:candlePalette.down"],
 ["fill=\"${up?'#081310':color}\"","fill=\"${up?candlePalette.background:color}\""],
 ['stroke="#f2cb62" stroke-width="1.6"','stroke="${candlePalette.ma}" stroke-width="1.6"'],
 ['fill="#f2cb62" font-size="12"','fill="${candlePalette.ma}" font-size="12"']
]);
await patch('dist/market-panorama.js',[
 ["import {contractField,marginField,supplementPanel,supplementSources}","import {CANDLE_STYLE as candlePalette} from './candle-style.js';\nimport {contractField,marginField,supplementPanel,supplementSources}"],
 ["color:'#98701c'},lineStyle:{color:'#98701c'","color:candlePalette.ma},lineStyle:{color:candlePalette.ma"]
]);
await patch('desktop/main.cjs',[
 ["const {installMonitor}=require('./monitor.cjs');","const {installMonitor}=require('./monitor.cjs');\nconst {installZoom}=require('./zoom.cjs');"],
 ["Menu.setApplicationMenu(Menu.buildFromTemplate(","const zoom=installZoom(window,{file:path.join(process.env.WUJIAN_DESKTOP_PROFILE?path.resolve(config.project,process.env.WUJIAN_DESKTOP_PROFILE):path.join(config.project,'.runtime/ui-preferences'),'zoom.json')});\n  Menu.setApplicationMenu(Menu.buildFromTemplate("],
 ["{role:'reload'},{role:'togglefullscreen'}","{role:'reload'},{type:'separator'},{label:'放大',accelerator:'CommandOrControl+Plus',click:()=>zoom.increase()},{label:'缩小',accelerator:'CommandOrControl+-',click:()=>zoom.decrease()},{label:'恢复100%',accelerator:'CommandOrControl+0',click:()=>zoom.reset()},{type:'separator'},{role:'togglefullscreen'}"]
]);
await patch('scripts/build-desktop.mjs',[["await copyFile('desktop/monitor.cjs',resolve(stage,'monitor.cjs'));","await copyFile('desktop/monitor.cjs',resolve(stage,'monitor.cjs'));\nawait copyFile('desktop/zoom.cjs',resolve(stage,'zoom.cjs'));"]]);
console.log('K线样式与桌面缩放已接入。');
