import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createAlertSpeech,pcmWave} from '../integrations/alert-speech.mjs';
const event={name:'螺纹钢',period:'30m',direction:'down'};
test('RIFF头存在但正文损坏的语音缓存会重新合成，恢复后可再次复用',async()=>{
 const root=await mkdtemp(resolve('output/maintenance-2026-11-03/cache-test-'));let calls=0;
 const service=createAlertSpeech({root,synthesize:async()=>{calls++;return pcmWave(Buffer.alloc(480))}});
 await service.render(event);const directory=join(root,'.runtime/alert-speech'),file=join(directory,(await readdir(directory))[0]);
 const corrupt=Buffer.alloc(60);corrupt.write('RIFF');await writeFile(file,corrupt);
 assert.equal((await service.render(event)).cacheHit,false);assert.equal(calls,2);assert.equal((await service.render(event)).cacheHit,true);
});
test('失败合成不写坏缓存，下一次请求允许正常重试',async()=>{
 const root=await mkdtemp(resolve('output/maintenance-2026-11-03/cache-test-'));let calls=0;
 const service=createAlertSpeech({root,synthesize:async()=>++calls===1?Buffer.from('bad'):pcmWave(Buffer.alloc(480))});
 await assert.rejects(()=>service.render(event),/无效音频/);assert.equal((await service.render(event)).cacheHit,false);assert.equal(calls,2);
});
