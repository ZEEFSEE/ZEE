const http = require('http');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ZHI_BRAIN_BRIDGE_PORT || 11435);
const OLLAMA = process.env.ZHI_OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.ZHI_OLLAMA_MODEL || 'llama3.1:8b';
const UPSTREAM_TIMEOUT_MS = Number(process.env.ZHI_BRAIN_UPSTREAM_TIMEOUT_MS || 180000);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, body) {
  cors(res);
  if (!res.headersSent) res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

function ollamaRequest(path, method='GET', body=null, timeout=5000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, OLLAMA);
    const req = http.request({
      hostname:url.hostname,
      port:url.port || 80,
      path:url.pathname + url.search,
      method,
      headers: body ? {
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body)
      } : {},
      timeout
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch {}
        resolve({status:res.statusCode || 0, data:parsed, raw:data});
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getOllamaStatus() {
  try {
    const r = await ollamaRequest('/api/tags', 'GET', null, 2500);
    if (r.status !== 200) return {ok:false, status:r.status, model:false, error:'OLLAMA_HTTP_ERROR'};
    const models = Array.isArray(r.data?.models) ? r.data.models : [];
    const found = models.some(m => m?.name === MODEL || m?.model === MODEL);
    return {
      ok:true,
      status:200,
      model:found,
      model_name:MODEL,
      models:models.map(m => m?.name || m?.model).filter(Boolean)
    };
  } catch (e) {
    return {ok:false, status:0, model:false, model_name:MODEL, error:'OLLAMA_UNREACHABLE', message:e.message};
  }
}

async function proxy(req, res, targetPath) {
  const url = new URL(targetPath, OLLAMA);
  const started = Date.now();
  console.log('[Bridge] ->', req.method, targetPath);

  const upstream = http.request({
    hostname:url.hostname,
    port:url.port || 80,
    path:url.pathname + url.search,
    method:req.method,
    headers:{
      'Content-Type':req.headers['content-type'] || 'application/json',
      'Accept':req.headers.accept || 'application/json',
      ...(req.headers['content-length'] ? {'Content-Length':req.headers['content-length']} : {})
    },
    timeout:UPSTREAM_TIMEOUT_MS
  }, r => {
    console.log('[Bridge] <-', r.statusCode, targetPath, Date.now() - started + 'ms');
    cors(res);
    if (!res.headersSent) {
      res.writeHead(r.statusCode || 502, {
        'Content-Type':r.headers['content-type'] || 'application/json; charset=utf-8'
      });
    }
    r.on('error', e => {
      console.error('[Bridge] response error:', e.message);
      if (!res.headersSent) json(res,502,{ok:false,error:'OLLAMA_RESPONSE_ERROR',message:e.message});
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
    if (!res.headersSent) json(res,502,{
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

const server = http.createServer(async (req,res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const path = new URL(req.url,'http://localhost').pathname;

  if (req.method === 'GET' && path === '/health') {
    const status = await getOllamaStatus();
    return json(res,200,{
      ok:true,
      service:'zhi-brain-bridge',
      host:HOST,
      port:PORT,
      ollama:OLLAMA,
      model:MODEL,
      ollama_ok:status.ok,
      model_ready:status.model,
      available_models:status.models || [],
      timeout_ms:UPSTREAM_TIMEOUT_MS,
      time:new Date().toISOString()
    });
  }

  if (req.method === 'GET' && path === '/ready') {
    const status = await getOllamaStatus();
    if (!status.ok) return json(res,503,{ok:false,ready:false,error:'OLLAMA_UNREACHABLE',message:status.message || 'Ollama is not responding'});
    if (!status.model) return json(res,503,{ok:false,ready:false,error:'MODEL_NOT_FOUND',model:MODEL,available_models:status.models || []});
    return json(res,200,{ok:true,ready:true,service:'zhi-brain-bridge',model:MODEL});
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && path === '/bridge-test') {
    return json(res,200,{ok:true,service:'zhi-brain-bridge',message:'Bridge HTTP layer is responding'});
  }

  if (path === '/api/tags' || path === '/api/chat') return proxy(req,res,path);

  return json(res,404,{ok:false,error:'NOT_FOUND'});
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('[Bridge] Port '+PORT+' is already in use. A ZHI Brain Bridge may already be running.');
    console.error('[Bridge] Test existing instance: http://127.0.0.1:'+PORT+'/health');
    process.exitCode = 2;
  } else {
    console.error('[Bridge] Server error:',err.message);
    process.exitCode = 1;
  }
});

server.listen(PORT,HOST,()=>console.log('ZHI Brain Bridge: http://'+HOST+':'+PORT+' -> '+OLLAMA+' | model='+MODEL));
