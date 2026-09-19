import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {threeAxesKnowledge} from '../integrations/three-axes-knowledge.mjs';
test('three axes knowledge is source pinned and separates futures, assumptions and real permissions',async()=>{
 const k=await threeAxesKnowledge();assert.equal(k.market,'domestic_futures');assert.equal(k.permission,false);assert.match(k.source.commit,/^[a-f0-9]{40}$/);assert.match(k.adaptation,/500万元、1%风险、10%敞口是示例参数/);assert.match(k.adaptation,/只能称观察候选/);assert.match(k.methodology,/第一板斧/);assert.match(k.methodology,/第二板斧/);assert.match(k.methodology,/第三板斧/);
 const source=await readFile(new URL('../knowledge/three-axes/METHODOLOGY.upstream.md',import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),createHash('sha256').update(k.methodology).digest('hex'));
});
