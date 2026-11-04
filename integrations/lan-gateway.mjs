import http from 'node:http';
import {networkInterfaces,hostname} from 'node:os';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

export const privateAddress=value=>{
 const ip=String(value||'').replace(/^::ffff:/,'');
 return ip==='::1'||/^127\./.test(ip)||/^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip);
};
export function lanAddresses(){return Object.values(networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal&&privateAddress(x.address)).map(x=>x.address)}
export function passwordRecord(password,salt=randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<16)throw Error('局域网口令至少16位');
 return{salt,hash:scryptSync(password,salt,32).toString('hex')};
}
export function createLanGateway({credentials,targetPort=4318,port=4321,now=Date.now,extraHosts=[]}={}){
 if(!credentials?.salt||!/^[a-f0-9]{64}$/.test(credentials.hash||''))throw Error('请先生成局域网访问口令');
 const sessions=new Map(),attempts=new Map(),cookieName='xiaomu_lan',localHost='127.0.0.1:'+targetPort;
 const hosts=new Set(['localhost','127.0.0.1',hostname().toLowerCase(),hostname().toLowerCase()+'.local',...lanAddresses(),...extraHosts]);
 const loginPage='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小木局域网登录</title><style>body{font:17px/1.7 sans-serif;background:#f4f6fc;color:#203452;margin:10vh auto;max-width:440px;padding:24px}form{background:white;padding:28px;border-radius:12px}input,button{box-sizing:border-box;width:100%;padding:13px;margin:12px 0;font-size:17px}button{background:#365dc7;color:white;border:0;border-radius:6px}</style><h1>小木工作台</h1><form action="/lan/login" method="post"><label>局域网访问口令<input type="password" name="password" autocomplete="current-password" required maxlength="256"></label><button>进入小木</button><small>连接主机上的同一工作台；口令请向主机持有人获取。</small></form>';
 function validHost(req){try{const url=new URL('http://'+req.headers.host);return !url.username&&!url.password&&hosts.has(url.hostname.toLowerCase())&&url.port===String(server.address()?.port||port)}catch{return false}}
 function sameOrigin(req){return req.headers.origin==='http://'+req.headers.host}
 function authenticated(req){const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);const expiry=sessions.get(token);if(!expiry||expiry<=now()){sessions.delete(token);return false}return true}
 function send(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'});res.end(body)}
 function headers(req){const h={...req.headers,host:localHost,origin:'http://'+localHost};delete h.cookie;delete h.authorization;delete h['x-forwarded-for'];delete h['x-forwarded-host'];delete h['x-forwarded-proto'];return h}
 const server=http.createServer(async(req,res)=>{
  if(!privateAddress(req.socket.remoteAddress)||!validHost(req))return send(res,403,'仅允许已知局域网地址访问');
  if(!req.url.startsWith('/')||req.url.startsWith('//'))return send(res,400,'地址无效');
  const path=new URL(req.url,'http://'+req.headers.host).pathname;
  if(req.method==='POST'&&!sameOrigin(req))return send(res,403,'来源校验失败');
  if(path==='/lan/login'&&req.method==='POST'){
   const ip=req.socket.remoteAddress,attempt=attempts.get(ip)||{count:0,until:now()+60000};if(attempt.until<=now()){attempt.count=0;attempt.until=now()+60000}if(attempt.count>=5)return send(res,429,'尝试次数过多，请一分钟后再试');
   let body='';try{for await(const part of req){body+=part;if(body.length>4096)return send(res,413,'请求过长')}}catch{return send(res,400,'请求中断')}
   const password=new URLSearchParams(body).get('password')||'';attempt.count++;if(attempts.size>4096)attempts.clear();attempts.set(ip,attempt);
   const hash=scryptSync(password,credentials.salt,32);if(!timingSafeEqual(hash,Buffer.from(credentials.hash,'hex')))return send(res,401,'访问口令不正确');
   attempts.delete(ip);for(const [key,expiry]of sessions)if(expiry<=now())sessions.delete(key);if(sessions.size>=512)return send(res,503,'会话数量达到上限');
   const token=randomBytes(32).toString('hex');sessions.set(token,now()+12*3600000);res.writeHead(303,{'Location':'/market-panorama.html','Set-Cookie':cookieName+'='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200','Cache-Control':'no-store'});return res.end();
  }
  if(!authenticated(req)){if(path.startsWith('/api/')||req.method!=='GET')return send(res,401,'请先通过局域网口令登录');return send(res,200,loginPage,'text/html; charset=utf-8')}
  if(['POST','PATCH','DELETE','PUT'].includes(req.method)&&!sameOrigin(req))return send(res,403,'来源校验失败');
  if(path==='/lan/logout'&&req.method==='POST'){const match=String(req.headers.cookie||'').match(/xiaomu_lan=([^;]+)/);if(match)sessions.delete(match[1]);res.writeHead(303,{'Location':'/','Set-Cookie':cookieName+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return res.end()}
  const upstream=http.request({hostname:'127.0.0.1',port:targetPort,path:req.url,method:req.method,headers:headers(req)},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
  upstream.on('error',()=>{if(!res.headersSent)send(res,502,'小木主服务未启动，请先在主机打开小木');else res.destroy()});req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!privateAddress(socket.remoteAddress)||!validHost(req)||!authenticated(req)||!sameOrigin(req)||!req.url.startsWith('/')||req.url.startsWith('//'))return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  const upstream=http.request({hostname:'127.0.0.1',port:targetPort,path:req.url,method:'GET',headers:headers(req)});
  upstream.on('upgrade',(response,target,upstreamHead)=>{socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(upstreamHead.length)socket.write(upstreamHead);if(head.length)target.write(head);socket.pipe(target).pipe(socket);socket.on('error',()=>target.destroy());target.on('error',()=>socket.destroy());socket.on('close',()=>target.destroy())});upstream.on('response',()=>socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));upstream.on('error',()=>socket.destroy());upstream.end();
 });
 return{server,sessions,listen:host=>new Promise((done,fail)=>{server.once('error',fail);server.listen(port,host||'0.0.0.0',()=>done(server.address()))}),close:()=>new Promise(done=>{server.closeAllConnections();server.close(done)})};
}
