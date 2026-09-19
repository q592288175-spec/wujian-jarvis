import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runDeepSeek} from '../integrations/deepseek.mjs';
import {allowedSource} from '../integrations/research-sources.mjs';
process.env.DEEPSEEK_API_KEY='test-only-placeholder';
process.env.DEEPSEEK_MODEL='deepseek-flash';
test('provider is fixed and unauthorized tools never execute',async()=>{let n=0,calls=0;const bodies=[];const fetchImpl=async(url,o)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');bodies.push(JSON.parse(o.body));return {ok:true,json:async()=>({model:'deepseek-flash',choices:[{message:n++===0?{role:'assistant',content:null,reasoning_content:'internal',tool_calls:[{id:'a',type:'function',function:{name:'delete_files',arguments:'{}'}}]}:{role:'assistant',content:'完成'}}]})}};const r=await runDeepSeek({messages:[{role:'user',content:'测试'}],tools:[{name:'read',parameters:{type:'object'}}],execute:()=>calls++,fetchImpl});assert.equal(calls,0);assert.equal(r.model,'deepseek-flash');assert(!('reasoning_content' in r));assert.equal(bodies[1].messages[1].reasoning_content,'internal');assert.match(bodies[1].messages[2].content,/未授权/)});
test('upstream errors never expose raw response or credentials',async()=>{await assert.rejects(runDeepSeek({messages:[],fetchImpl:async()=>({ok:false,status:401,text:async()=>{throw Error('should not read')}})}),/密钥无效/)});
test('source reader rejects local, non-HTTPS and credential URLs',()=>{for(const u of ['http://127.0.0.1','https://127.0.0.1','https://evil.com/?next=gov.cn','https://name:secret@www.gov.cn','https://www.gov.cn:8000','file:///etc/passwd'])assert.equal(allowedSource(u),false);assert(allowedSource('https://www.pbc.gov.cn/'));});
