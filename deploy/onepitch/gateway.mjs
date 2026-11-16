import http from 'node:http';
import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const derive = promisify(scrypt);
const lifetime = 8 * 60 * 60 * 1000;
const loginPage = readFileSync(new URL('login.html', import.meta.url), 'utf8');

export function createPortal({origin, account, salt, verifier, upstreamPort = 4420}) {
  const site = new URL(origin);
  const local = site.protocol === 'http:' && ['localhost','127.0.0.1'].includes(site.hostname);
  if ((!local && site.protocol !== 'https:') || site.origin !== origin || !account ||
      !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(verifier)) throw Error('请先配置站点、账号及口令校验值');
  let verifying = 0;
  const sessions = new Map();
  const attempts = new Map();
  const cookieName = local ? 'onepitch_session' : '__Host-onepitch';
  const cookie = (token, age) => cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(local?'':'; Secure');
  const redirect = (res, path) => res.writeHead(303,{Location:path}).end();
  const login = (res, message='', code=200) => res.writeHead(code,{'Content-Type':'text/html; charset=utf-8'}).end(loginPage.replace('<!--status-->',message));
  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    try {
      if (req.headers.host !== site.host || !req.url.startsWith('/') || req.url.startsWith('//')) return res.writeHead(403).end();
      const path = new URL(req.url,origin).pathname;
      const read = ['GET','HEAD'].includes(req.method);
      if (!read && (req.method !== 'POST' || req.headers.origin !== origin)) return res.writeHead(403).end();
      const now = Date.now();
      for (const [key,until] of sessions) if (until<=now) sessions.delete(key);
      for (const [key,entry] of attempts) if (entry.until<=now) attempts.delete(key);
      const token = (req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if (path==='/login') {
        if (read) return sessions.has(token) ? redirect(res,'/nightflight/?personal=1') : login(res);
        if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return res.writeHead(415).end();
        // Caddy replaces this header with the peer address. The gateway listens only on loopback.
        const peer = req.headers['x-onepitch-client'] || req.socket.remoteAddress;
        const entry = attempts.get(peer) ?? {count:0,until:now+600000};
        if (entry.count>=8 || attempts.size>=4096 && !attempts.has(peer)) return login(res,'尝试次数过多，请稍后再试。',429);
        attempts.set(peer,entry);entry.count++;
        const parts=[];let bytes=0;
        for await(const part of req){bytes+=part.length;if(bytes>4096)return res.writeHead(413).end();parts.push(part)}
        const fields=new URLSearchParams(Buffer.concat(parts).toString());
        if (verifying >= 3) return login(res,'请稍后再试。',429);
        let result;
        verifying++;
        try { result=await derive(fields.get('password')??'',Buffer.from(salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024}); } finally { verifying--; }
        if (!timingSafeEqual(result,Buffer.from(verifier,'hex')) || fields.get('account')!==account) return login(res,'账号或密码有误。',401);
        attempts.delete(peer);
        const key=randomBytes(32).toString('hex');
        if(sessions.size>=64)sessions.delete(sessions.keys().next().value);
        sessions.set(key,now+lifetime);
        res.setHeader('Set-Cookie',cookie(key,lifetime/1000));return redirect(res,'/nightflight/?personal=1');
      }
      if(path==='/logout' && req.method==='POST'){
        sessions.delete(token);res.setHeader('Set-Cookie',cookie('',0));return redirect(res,'/login');
      }
      if(!sessions.has(token)){
        if(path.startsWith('/api/'))return res.writeHead(401,{'Content-Type':'application/json'}).end('{"error":"请先登录"}');
        return redirect(res,'/login');
      }
      if(path==='/')return redirect(res,'/nightflight/?personal=1');
      const host='127.0.0.1:'+upstreamPort;
      const headers={host,origin:'http://'+host};
      for(const name of ['content-type','content-length','accept','range'])if(req.headers[name])headers[name]=req.headers[name];
      const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers},reply=>{
        const safe={...reply.headers,'cache-control':'private, no-store','x-frame-options':'DENY'};
        delete safe['set-cookie'];res.writeHead(reply.statusCode,safe);reply.on('error',()=>res.destroy());reply.pipe(res);
      });
      res.on('close',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream);
    }catch{if(!res.headersSent)res.writeHead(400);res.end()}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  createPortal({origin:process.env.ONEPITCH_ORIGIN,account:process.env.ONEPITCH_ACCOUNT,salt:process.env.ONEPITCH_SALT,verifier:process.env.ONEPITCH_VERIFIER}).listen(4432,'127.0.0.1');
}
