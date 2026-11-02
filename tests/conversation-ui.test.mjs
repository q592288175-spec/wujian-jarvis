import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const dom=new JSDOM(readFileSync(new URL('../dist/cockpit.html',import.meta.url),'utf8'),{url:'http://localhost/cockpit.html'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,MutationObserver:dom.window.MutationObserver,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),IntersectionObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
const {renderMarkdown}=await import('../dist/ui/markdown.js');
const {VoiceController}=await import('../dist/voice.js');
test('Markdown renders headings, emphasis, lists, tables and code while blocking active content',()=>{
 const el=document.createElement('div');renderMarkdown(el,'## 结论\n\n**重点**\n\n- 一\n- 二\n\n| 品种 | 判断 |\n| --- | --- |\n| 沪铜 | 待核 |\n\n```js\nconst a = 1;\n```\n\n[来源](https://example.com)\n\n<img src=x onerror=alert(1)><script>alert(1)</script>[恶意](javascript:alert)');
 assert.equal(el.querySelector('h2').textContent,'结论');assert.equal(el.querySelectorAll('li').length,2);assert.equal(el.querySelectorAll('table tbody tr').length,1);assert.ok(el.querySelector('pre code'));assert.equal(el.querySelector('strong').textContent,'重点');assert.equal(el.querySelectorAll('script,img,[onerror],[href^="javascript"]').length,0);assert.equal(el.querySelector('a').rel,'noopener noreferrer');
});
test('one conversation supports voice and typing, connects once, minimizes without hanging up and closes safely',()=>{
 const v=new VoiceController({api:async()=>({}),isConfigured:()=>true});let connections=0,stops=0;
 v.connect=async()=>{connections++;v.syncVolc({connection:'connecting',micMuted:false,agentSpeaking:false})};v.volc.stop=()=>stops++;
 v.openCall();assert.equal(document.body.classList.contains('voice-focus'),false);assert.equal(document.querySelector('#callPanel').classList.contains('voice-only'),false);assert.equal(connections,1);
 v.openCall();assert.equal(connections,1);
 v.open();assert.equal(document.body.classList.contains('voice-focus'),false);assert.equal(document.querySelector('#callPanel').classList.contains('voice-only'),false);assert.equal(stops,0);
 assert.equal(document.querySelectorAll('#callPanel .call-controls button').length,3);assert.equal(document.querySelectorAll('#localMode,#aiMode,.copy-captions,.caption-back').length,0);
 document.querySelector('#chatInput').value='尚未发送';document.querySelector('#maxCall').click();assert.ok(document.querySelector('#callPanel').classList.contains('conversation-expanded'));assert.equal(document.querySelector('#maxCall').getAttribute('aria-label'),'还原窗口');document.querySelector('#maxCall').click();assert.equal(document.querySelector('#callPanel').classList.contains('conversation-expanded'),false);
 document.querySelector('#minCall').click();assert.ok(document.querySelector('#callPanel').hidden);assert.equal(stops,0);document.querySelector('#floatingCall').click();assert.equal(connections,1);assert.equal(document.querySelector('#chatInput').value,'尚未发送');
 v.openCall();document.querySelector('#hangup').click();assert.equal(document.querySelector('#callPanel').hidden,false);assert.equal(document.body.classList.contains('voice-focus'),false);assert.equal(stops,1);document.querySelector('#closeCall').click();assert.ok(document.querySelector('#callPanel').hidden);assert.equal(stops,2);
 v.visualizer.dispose();v.motionObserver.disconnect();
});
test('voice captions replace partial recognition and commit once into the common message history',()=>{
 const v=new VoiceController({api:async()=>({}),isConfigured:()=>true});
 v.captions.partial('黄金');v.captions.partial('黄金最新报价');assert.equal(document.querySelector('#callDraft').textContent,'你：黄金最新报价');
 const before=document.querySelectorAll('#messages .user').length;v.volc.message('user','黄金最新报价');assert.equal(document.querySelector('#callDraft').hidden,true);assert.equal(document.querySelectorAll('#messages .user').length,before+1);v.visualizer.dispose();v.motionObserver.disconnect();
});
const {CallCaptions}=await import('../dist/ui/call-captions.js');
test('captions correct provisional recognition without duplicate transcript and copy both speakers',async()=>{
 const panel=document.createElement('section');let copied='';const c=new CallCaptions(panel,{copy:async text=>{copied=text}});
 c.partial('沪');c.partial('沪铜怎么看');assert.equal(c.entries.length,0);assert.match(c.draft.textContent,/识别中/);
 c.add('user','沪铜怎么看');assert.equal(c.draft.hidden,true);c.add('assistant','**先看结构**，再看风险。');assert.equal(c.entries.length,2);assert.equal(c.log.querySelectorAll('strong').length,1);
 await c.copyAll();assert.match(copied,/你\n沪铜怎么看/);assert.match(copied,/小木\n先看结构/);assert.doesNotMatch(copied,/\*\*|识别中/);
});
test('caption user text is never interpreted as HTML and clipboard failure is explicit',async()=>{
 const panel=document.createElement('section');const c=new CallCaptions(panel,{copy:async()=>{throw Error('denied')}});c.add('user','<img src=x onerror=alert(1)>');assert.equal(c.root.querySelectorAll('img').length,0);await c.copyAll();assert.match(c.feedback.textContent,/选中字幕/);
});
test('reading older captions does not force scrolling to new messages',()=>{
 const c=new CallCaptions(document.createElement('section'));Object.defineProperties(c.log,{scrollHeight:{value:1200},clientHeight:{value:300}});c.log.scrollTop=50;c.add('assistant','新回复');assert.equal(c.log.scrollTop,50);
});
