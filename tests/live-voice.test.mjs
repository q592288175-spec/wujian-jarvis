import test from 'node:test';
import assert from 'node:assert/strict';
import {liveConfig,createLive} from '../integrations/live-voice.mjs';
test('native session uses GPT-Live client delegation, no Responses model substitution',()=>{const c=liveConfig('v=0\r\n');assert.equal(c.session.model,'gpt-live-1');assert.deepEqual(c.session.delegation,{type:'client'});assert.throws(()=>liveConfig('invalid'))});
test('unconfigured voice fails before network request',async()=>{const saved=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;try{await assert.rejects(createLive('v=0',()=>{throw Error('network must not run')}),/OPENAI_API_KEY/)}finally{if(saved)process.env.OPENAI_API_KEY=saved}});
