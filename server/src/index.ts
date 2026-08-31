import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { handleClose, handleMsg, newConn, type Conn } from './rooms';

const PORT = Number(process.env.PORT) || 3000;
// 生产模式托管 vite 构建产物；开发时前端走 vite dev server，这里只管接口
const WEB_DIST = path.resolve(__dirname, '../../dist/web');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
};

const rooms = new Map<string, import('./rooms').Room>();

const server = http.createServer((req, res) => {
  let p: string;
  try {
    p = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(WEB_DIST, p));
  if (!file.startsWith(WEB_DIST + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      // 还没构建前端时给个友好提示
      if (p === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;padding:2em">前端还没构建：先 <code>npm run build</code>，或开发模式 <code>npm run dev</code>。</body>');
      }
      res.writeHead(404);
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  const conn: Conn = newConn(ws);
  ws.on('message', (raw) => handleMsg(conn, rooms, raw));
  ws.on('close', () => handleClose(conn, rooms));
});

export function start(port: number = PORT): http.Server {
  server.listen(port);
  return server;
}

if (require.main === module) {
  start(PORT);
  console.log(`一起看 -> http://localhost:${PORT}`);
}
