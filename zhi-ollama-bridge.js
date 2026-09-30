const http = require('http');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ZHI_BRAIN_BRIDGE_PORT || 11435);
const OLLAMA = process.env.ZHI_OLLAMA_URL || 'http://127.0.0.1:11434';
const UPSTREAM_TIMEOUT_MS = Number(process.env.ZHI_BRAIN_UPSTREAM_TIMEOUT_MS || 180000);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Chrome Private Network Access: allow an HTTPS GitHub Pages frontend to call the local loopback bridge.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, body) {
  cors(res);
  if (!res.headersSent) res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

function proxy(req, res, targetPath) {
  const url = new URL(targetPath, OLLAMA);
  const started = Date.now();
  console.log('[Bridge] ->', req.method, targetPath);

  const upstream = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers.accept || 'application/json',
      ...(req.headers['content-length'] ? {'Content-Length': req.headers['content-length']} : {})
    },
    timeout: UPSTREAM_TIMEOUT_MS
  }, r => {
    console.log('[Bridge] <-', r.statusCode, targetPath, Date.now() - started + 'ms');
    cors(res);
    if (!res.headersSent) {
      res.writeHead(r.statusCode || 502, {
        'Content-Type': r.headers['content-type'] || 'application/json; charset=utf-8'
      });
    }
    r.on('error', e => {
      console.error('[Bridge] response error:', e.message);
      if (!res.headersSent) json(res, 502, {ok:false,error:'OLLAMA_RESPONSE_ERROR',message:e.message});
      else res.destroy(e);
    });
    r.pipe(res);
  });

  upstream.on('timeout', () => {
    console.error('[Bridge] timeout after', UPSTREAM_TIMEOUT_MS + 'ms:', targetPath);
    upstream.destroy(new Error('Ollama upstream timeout'));
  });

  upstream.on('error', e => {
    console.error('[Bridge] upstream error:', e.message);
    if (!res.headersSent) json(res, 502, {
      ok:false,
      error:'OLLAMA_UNREACHABLE',
      message:e.message,
      ollama:OLLAMA
    });
    else res.destroy(e);
  });

  req.on('aborted', () => {
    console.log('[Bridge] client aborted:', targetPath);
    upstream.destroy();
  });

  req.pipe(upstream);
}

const server = http.createServer((req,res) => {
  cors(res);
  if(req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const path = new URL(req.url,'http://localhost').pathname;

  if(req.method === 'GET' && path === '/health') {
    return json(res,200,{
      ok:true,
      service:'zhi-brain-bridge',
      host:HOST,
      port:PORT,
      ollama:OLLAMA,
      timeout_ms:UPSTREAM_TIMEOUT_MS,
      time:new Date().toISOString()
    });
  }

  if((req.method === 'GET' || req.method === 'HEAD') && path === '/bridge-test') {
    return json(res,200,{
      ok:true,
      service:'zhi-brain-bridge',
      message:'Bridge HTTP layer is responding'
    });
  }

  if(path === '/api/tags' || path === '/api/chat') return proxy(req,res,path);

  return json(res,404,{ok:false,error:'NOT_FOUND'});
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('[Bridge] Port '+PORT+' is already in use. A ZHI Brain Bridge may already be running.');
    console.error('[Bridge] Test existing instance: http://127.0.0.1:'+PORT+'/health');
    process.exitCode = 2;
  } else {
    console.error('[Bridge] Server error:', err.message);
    process.exitCode = 1;
  }
});
server.listen(PORT,HOST,()=>console.log('ZHI Brain Bridge: http://'+HOST+':'+PORT+' -> '+OLLAMA));
