import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceController} from '../dist/voice.js';
test('late tool results cannot enter a replacement session',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const sent=[];
 const v=Object.create(VoiceController.prototype);Object.assign(v,{generation:1,seenTools:new Set(),phase(){},api:()=>pending,send:e=>sent.push(e),addMessage(){},onTool(){}});
 const work=v.onEvent({type:'response.function_call_arguments.done',call_id:'one',name:'run_research',arguments:'{}'},1);v.generation=2;resolve({id:'job'});await work;assert.equal(sent.length,0);
});
test('duplicate tool event executes once',async()=>{let calls=0;const v=Object.create(VoiceController.prototype);Object.assign(v,{generation:1,seenTools:new Set(),phase(){},api:async()=>{calls++;return{}},send(){},addMessage(){},onTool:async()=>{}});const event={type:'response.function_call_arguments.done',call_id:'one',arguments:'{}'};await v.onEvent(event);await v.onEvent(event);assert.equal(calls,1)});
test('interrupt cancels audio, never cancels a business task',()=>{globalThis.window={speechSynthesis:{cancel(){}}};const sent=[];const v=Object.create(VoiceController.prototype);Object.assign(v,{state:'idle',metrics:{},send:e=>sent.push(e.type)});v.interrupt();assert.deepEqual(sent,['response.cancel','output_audio_buffer.clear'])});
