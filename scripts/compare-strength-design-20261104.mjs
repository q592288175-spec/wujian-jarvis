import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=resolve('output/strength-live-2026-11-04');
const html='<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eee;font:15px Microsoft YaHei}section{background:white;padding:12px;margin-bottom:12px}h2{margin:0 0 6px;font-size:16px}img{width:100%;height:auto;display:block}</style><section><h2>用户参考图 · 图一</h2><img src="'+pathToFileURL(join(out,'reference.png')).href+'"></section><section><h2>小木 · 实际桌面窗口 · 真实主力分钟样本</h2><img src="'+pathToFileURL(join(out,'final-board.png')).href+'"></section>';
await writeFile(join(out,'visual-comparison.html'),html);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});await page.goto(pathToFileURL(join(out,'visual-comparison.html')).href);await page.screenshot({path:join(out,'visual-comparison.png'),fullPage:true})}finally{await browser.close()}
console.log('参考图与实际桌面已在同一比较图中呈现');
