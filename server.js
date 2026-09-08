// Telar Multigrado — servidor propio
// Sirve la app (carpeta public/) y expone /api/generate como puente hacia la
// API de Anthropic, usando tu propia llave (ANTHROPIC_API_KEY). La llave nunca
// se envía al navegador: solo vive en este servidor.
//
// Uso:
//   1) node --version   (necesitas Node.js 18 o más nuevo; trae fetch/https ya incluidos)
//   2) copia .env.example a .env y pon ahí tu ANTHROPIC_API_KEY
//   3) node server.js
//   4) abre http://localhost:3000
//
// No requiere "npm install": no usa ninguna librería externa.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

loadDotEnvIfPresent();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadDotEnvIfPresent(){
  // Cargador mínimo de .env (sin dependencias). No pisa variables ya definidas
  // en el entorno real (por ejemplo, las que pone tu servicio de hosting).
  const envPath = path.join(__dirname, '.env');
  if(!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if(!m) return;
    let val = m[2];
    if(val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if(val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if(process.env[m[1]] === undefined) process.env[m[1]] = val;
  });
}

function serveStatic(req, res){
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if(urlPath === '/') urlPath = '/index.html';
  const safe = path.normalize(urlPath).replace(/^([.]{2}[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if(!filePath.startsWith(PUBLIC_DIR)){ res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if(err){ res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('No encontrado'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
}

function readBody(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if(size > 2 * 1024 * 1024){ reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handlePing(req, res){
  if(!API_KEY){
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ ok:false, error:'ANTHROPIC_API_KEY no configurada en el servidor' }));
    return;
  }
  res.writeHead(200, {'Content-Type':'application/json'});
  res.end(JSON.stringify({ ok:true }));
}

async function handleGenerate(req, res){
  if(!API_KEY){
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ error:'ANTHROPIC_API_KEY no configurada en el servidor' }));
    return;
  }
  let body;
  try{ body = JSON.parse(await readBody(req)); }
  catch(e){ res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error:'JSON inválido' })); return; }

  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if(!prompt || prompt.length > 70000){
    res.writeHead(400, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ error:'El prompt viene vacío o es demasiado largo' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  });

  const upstream = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-length': Buffer.byteLength(payload),
    },
  }, (upRes) => {
    let buf = '';
    let stopReason = null;
    let sawGoodEvent = false;
    upRes.setEncoding('utf8');
    upRes.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for(const line of lines){
        if(!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if(!jsonStr || jsonStr === '[DONE]') continue;
        let evt;
        try{ evt = JSON.parse(jsonStr); } catch(e){ continue; }
        if(evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta'){
          sawGoodEvent = true;
          res.write(`data: ${JSON.stringify({ delta: evt.delta.text })}\n\n`);
        } else if(evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason){
          stopReason = evt.delta.stop_reason;
        } else if(evt.type === 'error'){
          res.write(`data: ${JSON.stringify({ error: (evt.error && evt.error.message) || 'Error de la API de Anthropic' })}\n\n`);
        }
      }
    });
    upRes.on('end', () => {
      if(upRes.statusCode >= 400 && !sawGoodEvent){
        res.write(`data: ${JSON.stringify({ error: `La API de Anthropic respondió con estado ${upRes.statusCode}. Revisa tu ANTHROPIC_API_KEY y tu saldo/plan en console.anthropic.com.` })}\n\n`);
      } else if(stopReason === 'max_tokens'){
        res.write(`data: ${JSON.stringify({ truncated: true })}\n\n`);
      }
      res.end();
    });
  });

  upstream.on('error', (err) => {
    try{ res.write(`data: ${JSON.stringify({ error: 'No se pudo conectar con Anthropic: ' + err.message })}\n\n`); }catch(e){}
    try{ res.end(); }catch(e){}
  });

  req.on('close', () => { upstream.destroy(); });

  upstream.write(payload);
  upstream.end();
}

const server = http.createServer((req, res) => {
  if(req.method === 'GET' && req.url === '/api/ping'){ handlePing(req, res); return; }
  if(req.method === 'POST' && req.url === '/api/generate'){
    handleGenerate(req, res).catch((e) => {
      try{ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: e.message || 'error interno' })); }catch(_){}
    });
    return;
  }
  if(req.method === 'GET'){ serveStatic(req, res); return; }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Telar Multigrado escuchando en http://localhost:${PORT}`);
  if(!API_KEY) console.warn('⚠ Falta ANTHROPIC_API_KEY (revisa tu archivo .env) — la generación con IA no va a funcionar hasta que la configures.');
  console.log(`Modelo configurado: ${MODEL} (cámbialo con la variable de entorno ANTHROPIC_MODEL si hace falta)`);
});
