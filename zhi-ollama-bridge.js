const http = require('http');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ZHI_BRAIN_BRIDGE_PORT || 11435);
const OLLAMA = process.env.ZHI_OLLAMA_URL || 'http://127.0.0.1:11434';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}
function json(res, status, body) {
  cors(res);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}
function proxy(req, res, targetPath) {
  const url = new URL(targetPath, OLLAMA);
  const upstream = http.request({
    hostname:url.hostname, port:url.port || 80,
    path:url.pathname + url.search, method:req.method,
    headers:{'Content-Type':req.headers['content-type'] || 'application/json'}
  }, r => {
    cors(res);
    res.writeHead(r.statusCode || 502, {'Content-Type':r.headers['content-type'] || 'application/json; charset=utf-8'});
    r.pipe(res);
  });
  upstream.on('error', e => json(res, 502, {ok:false,error:'OLLAMA_UNREACHABLE',message:e.message,ollama:OLLAMA}));
  req.pipe(upstream);
}
http.createServer((req,res) => {
  cors(res);
  if(req.method === 'OPTIONS') return res.writeHead(204).end();
  const path = new URL(req.url,'http://localhost').pathname;
  if(req.method === 'GET' && path === '/health')
    return json(res,200,{ok:true,service:'zhi-brain-bridge',host:HOST,port:PORT,ollama:OLLAMA,time:new Date().toISOString()});
  if(path === '/api/tags' || path === '/api/chat') return proxy(req,res,path);
  return json(res,404,{ok:false,error:'NOT_FOUND'});
}).listen(PORT,HOST,()=>console.log('ZHI Brain Bridge: http://'+HOST+':'+PORT+' -> '+OLLAMA));
