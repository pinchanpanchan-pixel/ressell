// Pasarela mínima que imita a Kong de Supabase: /auth/v1 -> GoTrue, /rest/v1 -> PostgREST.
import http from 'node:http';
const routes = [['/auth/v1', 9999], ['/rest/v1', 3000]];
http.createServer((req, res) => {
  const route = routes.find(([p]) => req.url.startsWith(p));
  if (!route) { res.writeHead(404); return res.end('not found'); }
  const [prefix, port] = route;
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const up = http.request({ host: '127.0.0.1', port, path: req.url.slice(prefix.length) || '/', method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(54321, () => console.log('gateway on :54321'));
