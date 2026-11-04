import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {createLanGateway,passwordRecord,privateAddress} from '../integrations/lan-gateway.mjs';

async function fixture(work){
 const received=[];const upstream=http.createServer((req,res)=>{received.push(req.headers);if(req.url==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream'});return res.end('data: ready\n\n')}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:req.url,host:req.headers.host,origin:req.headers.origin,cookie:req.headers.cookie||null}))});
 const sockets=new WebSocketServer({server:upstream});sockets.on('connection',ws=>ws.on('message',m=>ws.send(m.toString())));
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const password='synthetic-lan-password-123';const app=createLanGateway({credentials:passwordRecord(password),targetPort:upstream.address().port,port:0});await app.listen('127.0.0.1');const base='http://127.0.0.1:'+app.server.address().port;
 const login=async()=>{const response=await fetch(base+'/lan/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password}),redirect:'manual'});assert.equal(response.status,303);return response.headers.get('set-cookie').split(';')[0]};
 try{await work({base,login,received,app,upstream})}finally{for(const ws of sockets.clients)ws.terminate();sockets.close();await app.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r))}
}
test('只允许局域网地址与回环，不接受公网',()=>{for(const ip of ['127.0.0.1','::1','::ffff:192.168.1.9','10.3.4.5','172.16.0.1','172.31.255.1'])assert.equal(privateAddress(ip),true);for(const ip of ['8.8.8.8','172.32.0.1','192.0.2.1',null])assert.equal(privateAddress(ip),false)});
test('未登录只见中文登录页，API无权读取，不能伪造Host和跨站登录',()=>fixture(async({base})=>{
 assert.match(await fetch(base).then(r=>r.text()),/局域网访问口令/);assert.equal((await fetch(base+'/api/health')).status,401);
 const badHost=await new Promise((resolve,reject)=>{const request=http.get(base,{headers:{Host:'evil.example:4319'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject)});assert.equal(badHost,403);
 assert.equal((await fetch(base+'/lan/login',{method:'POST',headers:{Origin:'http://evil.example'},body:'password=x'})).status,403);
}));
test('登录后代理读写与SSE，严格改写本机Host/Origin，剥离登录口令Cookie',()=>fixture(async({base,login,upstream})=>{
 const cookie=await login(),headers={Cookie:cookie,Origin:base};const response=await fetch(base+'/api/save',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.host,'127.0.0.1:'+upstream.address().port);assert.equal(result.origin,'http://'+result.host);assert.equal(result.cookie,null);
 assert.match(await fetch(base+'/events',{headers:{Cookie:cookie}}).then(r=>r.text()),/data: ready/);
 assert.equal((await fetch(base+'/api/save',{method:'PATCH',headers:{Cookie:cookie,Origin:'http://evil.example'}})).status,403);
}));
test('登录错误限频、会话过期与退出生效',()=>fixture(async({base,login,app})=>{
 const cookie=await login();app.sessions.clear();assert.equal((await fetch(base+'/api/x',{headers:{Cookie:cookie}})).status,401);
 const second=await login();assert.equal((await fetch(base+'/lan/logout',{method:'POST',headers:{Cookie:second,Origin:base},redirect:'manual'})).status,303);assert.equal((await fetch(base+'/api/x',{headers:{Cookie:second}})).status,401);
 for(let i=0;i<5;i++)assert.equal((await fetch(base+'/lan/login',{method:'POST',headers:{Origin:base},body:'password=incorrect'})).status,401);
 assert.equal((await fetch(base+'/lan/login',{method:'POST',headers:{Origin:base},body:'password=incorrect'})).status,429);
}));
test('语音WebSocket只向已登录同源会话升级并保持消息转发',()=>fixture(async({base,login})=>{
 const cookie=await login();const ws=new WebSocket(base.replace('http:','ws:')+'/voice',{headers:{Cookie:cookie,Origin:base}});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});const message=new Promise((resolve,reject)=>{ws.once('message',v=>resolve(String(v)));ws.once('error',reject)});ws.send('synthetic-audio');assert.equal(await message,'synthetic-audio');ws.terminate();
 const denied=new WebSocket(base.replace('http:','ws:')+'/voice',{headers:{Origin:base}});const code=await new Promise(resolve=>{denied.on('unexpected-response',(_req,res)=>{res.resume();denied.terminate();resolve(res.statusCode)});denied.on('error',()=>{})});assert.equal(code,403);
}));
