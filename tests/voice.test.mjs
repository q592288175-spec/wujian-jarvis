import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceController} from '../dist/voice.js';
test('text routes to DeepSeek chat and retains conversation',async()=>{let path,body;const v=Object.create(VoiceController.prototype);Object.assign(v,{generation:1,history:[],state:'idle',addMessage(){},phase(){},status(){},api:async(p,b)=>{path=p;body=b;return{text:'回答',model:'deepseek-flash'}}});await v.submit('问题');assert.equal(path,'/api/chat');assert.equal(body.messages[0].content,'问题');assert.equal(v.history[1].content,'回答')});
test('late answer cannot enter replacement voice session',async()=>{let resolve;const pending=new Promise(r=>resolve=r),messages=[];const v=Object.create(VoiceController.prototype);Object.assign(v,{generation:1,history:[],state:'idle',addMessage:(r,t)=>messages.push([r,t]),phase(){},status(){},api:()=>pending});const work=v.submit('问题');v.generation=2;resolve({text:'旧回答'});await work;assert.equal(messages.length,1);assert.equal(v.history.length,0)});
test('interrupt only stops speech, not background research',()=>{let cancelled=0,resumed=0;globalThis.window={speechSynthesis:{cancel(){cancelled++}}};const v=Object.create(VoiceController.prototype);v.resumeListening=()=>resumed++;v.interrupt();assert.equal(cancelled,1);assert.equal(resumed,1)});

test('desktop uses the configured duplex voice even when an old browser-only preference remains',async()=>{
 const oldWindow=globalThis.window,oldStorage=globalThis.localStorage;let connected=0;
 globalThis.window={xiaomuMonitor:{},webkitSpeechRecognition:function(){}};globalThis.localStorage={getItem:()=> 'browser',setItem(){throw Error('不得覆盖原语音偏好')}};
 try{const v=Object.create(VoiceController.prototype);Object.assign(v,{state:'idle',stop(){},volc:{connect(){connected++}},connectBrowser(){throw Error('桌面不依赖浏览器识别')}});await v.connect();assert.equal(connected,1)}finally{globalThis.window=oldWindow;globalThis.localStorage=oldStorage}
});
