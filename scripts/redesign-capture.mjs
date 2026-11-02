import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {openHarness} from './redesign-harness.mjs';
const stage=process.argv[2]||'baseline',h=await openHarness(stage),errors=[],bad=[],checks=[];
try{
 const page=await h.browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+new URL(r.url()).pathname)});
 const snapshotSource=await readFile('docs/redesign-2026-10-25/page-snapshot.js','utf8');
 for(const [name,path] of [['stable','/'],['panorama','/market-panorama.html'],['holo','/cockpit.html']]){
  await page.goto(h.base+path);await page.waitForTimeout(1500);
  const snap=await page.evaluate(snapshotSource);await writeFile(join(h.out,'snapshot-'+name+'.json'),JSON.stringify({...snap,badResponses:[...new Set(bad)]},null,2));
  checks.push({entry:name,states:snap.states.map(s=>s.label),overflow:snap.states.filter(s=>s.overflowX).map(s=>s.label)});
 }
 const cards=await fetch(h.base+'/api/workbench/cards').then(r=>r.json());const rows=Array.isArray(cards)?cards:cards.cards||[];const environments=[];
 for(const card of rows.slice(0,3)){try{const env=await fetch(h.base+'/api/workbench/cards/'+card.id+'/environment?cycle=day').then(r=>r.json());environments.push({id:card.id,hash:env.hash,dataDate:env.dataDate,target:env.layers?.sector?.target,constituents:env.layers?.sector?.constituents,error:env.error})}catch(e){environments.push({id:card.id,error:e.message})}}
 await writeFile(join(h.out,'environment-evidence.json'),JSON.stringify(environments,null,2));
 for(const size of (process.argv.includes('--snapshots-only')?[]:[{width:1440,height:900},{width:1100,height:800},{width:390,height:844}])){
  await page.setViewportSize(size);
  for(const view of ['home','monitor','fire','water','metal','earth','wood','rules']){
   await page.goto(h.base+'/?view='+view);await page.waitForSelector('#mainNav .active[data-view="'+view+'"]');await page.waitForTimeout(300);await page.screenshot({path:join(h.out,'stable-'+view+'-'+size.width+'.png')});
  }
  await page.goto(h.base+'/market-panorama.html');await page.waitForSelector('#content table');
  const nav=await page.locator('[data-nav]').evaluateAll(es=>es.map(e=>e.dataset.nav));
  for(const view of nav){await page.locator('[data-nav="'+view+'"]').click();if(['funds','positions','variety'].includes(view))await page.waitForSelector('.detail-identity');await page.screenshot({path:join(h.out,'panorama-'+view+'-'+size.width+'.png')})}
  await page.goto(h.base+'/cockpit.html');await page.waitForSelector('#opportunityList button');await page.bringToFront();await page.waitForTimeout(1200);await page.screenshot({path:join(h.out,'holo-'+size.width+'.png')});
  const globe=await page.evaluate(()=>{const host=document.querySelector('#globeScene'),c=host.querySelector('canvas'),r=host.getBoundingClientRect();return{hidden:document.hidden,renderReady:host.dataset.renderReady,threeReady:document.body.classList.contains('three-ready'),gpuLost:host.classList.contains('gpu-unavailable'),canvas:c&&{width:c.width,height:c.height,visibility:c.style.visibility},host:{width:r.width,height:r.height},affection:document.querySelector('.globe-affection')?.textContent}});
  checks.push({width:size.width,globe});
 }
 const hashes={};for(const f of ['dist/sectors.js','integrations/environment.mjs','integrations/five-workbench.mjs'])hashes[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile(join(h.out,'capture-result.json'),JSON.stringify({stage,checks,hashes,errors,badResponses:[...new Set(bad)]},null,2));console.log(JSON.stringify({stage,checks,errors,badResponses:[...new Set(bad)]}));
}finally{await h.close()}
