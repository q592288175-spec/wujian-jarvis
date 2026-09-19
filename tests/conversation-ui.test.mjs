import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const dom=new JSDOM(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'http://localhost/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,MutationObserver:dom.window.MutationObserver,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),IntersectionObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
const {renderMarkdown}=await import('../dist/ui/markdown.js');
const {VoiceController}=await import('../dist/voice.js');
test('Markdown renders headings, emphasis, lists, tables and code while blocking active content',()=>{
 const el=document.createElement('div');renderMarkdown(el,'## 结论\n\n**重点**\n\n- 一\n- 二\n\n| 品种 | 判断 |\n| --- | --- |\n| 沪铜 | 待核 |\n\n```js\nconst a = 1;\n```\n\n[来源](https://example.com)\n\n<img src=x onerror=alert(1)><script>alert(1)</script>[恶意](javascript:alert)');
 assert.equal(el.querySelector('h2').textContent,'结论');assert.equal(el.querySelectorAll('li').length,2);assert.equal(el.querySelectorAll('table tbody tr').length,1);assert.ok(el.querySelector('pre code'));assert.equal(el.querySelector('strong').textContent,'重点');assert.equal(el.querySelectorAll('script,img,[onerror],[href^="javascript"]').length,0);assert.equal(el.querySelector('a').rel,'noopener noreferrer');
});
test('call opens only the orb stage, connects once, text is separate and hangup restores workspace',()=>{
 const v=new VoiceController({api:async()=>({}),isConfigured:()=>true});let connections=0,stops=0;
 v.connect=async()=>{connections++;v.syncVolc({connection:'connecting',micMuted:false,agentSpeaking:false})};v.volc.stop=()=>stops++;
 v.openCall();assert.ok(document.body.classList.contains('voice-focus'));assert.ok(document.querySelector('#callPanel').classList.contains('voice-only'));assert.equal(connections,1);
 v.openCall();assert.equal(connections,1);
 v.open();assert.equal(document.body.classList.contains('voice-focus'),false);assert.equal(document.querySelector('#callPanel').classList.contains('voice-only'),false);assert.equal(stops,0);
 v.openCall();document.querySelector('#hangup').click();assert.ok(document.querySelector('#callPanel').hidden);assert.equal(document.body.classList.contains('voice-focus'),false);assert.equal(stops,1);
 v.visualizer.dispose();v.motionObserver.disconnect();
});
