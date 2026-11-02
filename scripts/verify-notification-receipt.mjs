import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import('file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base='http://127.0.0.1:4318',oldId='82e9297d-b46e-4295-a4ad-489c76713751',out=resolve('output/notification-receipt-2026-10-16');await mkdir(out,{recursive:true});
const api=async(path,input)=>{const response=await fetch(base+path,input?{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(input)}:{});const result=await response.json();if(!response.ok)throw Error(result.error||response.status);return result};
const before=await api('/api/workbench/backup');
const existing=await api('/api/monitor/events/'+oldId);
for(const channel of ['desktop','feishu'])if(existing.deliveries.find(d=>d.channel===channel)?.receipt?.received!==false)await api('/api/monitor/events/'+oldId+'/receipt',{channel,received:false,note:'本人在Codex确认12:36通知测试两端都未看到'});
const event=await api('/api/monitor/events/'+oldId);assert.ok(event.deliveries.every(d=>d.receipt?.received===false));assert.equal(event.deliveries.find(d=>d.channel==='desktop').status,'accepted');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9229');
try{
 const page=browser.contexts()[0].pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?view=monitor');await page.locator('[data-monitor-tab="events"]').click();await page.locator(`[data-event="${oldId}"]`).click();
 await page.locator('[data-receipt]').first().waitFor();assert.equal(await page.locator('[data-receipt]').count(),4);assert.match(await page.locator('#monitorDialog').innerText(),/本人确认未收到/);
 for(const width of [1500,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:resolve(out,'receipt-'+width+'.png')});const box=await page.locator('#monitorDialog').boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1)}
 await page.locator('.monitor-close').click();await page.setViewportSize({width:1500,height:1000});await page.locator('[data-monitor-tab="settings"]').click();
 const response=page.waitForResponse(r=>r.url()===base+'/api/monitor/test'&&r.request().method()==='POST');await page.locator('#monitorDesktopTest').click();const fresh=await (await response).json();
 assert.deepEqual(fresh.channels,['desktop']);let delivery;
 for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,1000));delivery=await api('/api/monitor/events/'+fresh.id);if(delivery.deliveries.some(d=>['accepted','failed','unknown'].includes(d.status)))break}
 const after=await api('/api/workbench/backup');delete before.exportedAt;delete after.exportedAt;assert.deepEqual(after,before);assert.deepEqual(errors,[]);
 const result={checkedAt:new Date(Date.now()+28800000).toISOString().replace('Z','+08:00'),oldEvent:event,newDesktopTest:delivery,phoneResent:false,recordsUnchanged:true,uiPassed:true,errors};
 await writeFile(resolve(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checkedAt:result.checkedAt,uiPassed:true,newEvent:fresh.id,deliveries:delivery.deliveries,phoneResent:false,recordsUnchanged:true}));
}finally{await browser.close()}
