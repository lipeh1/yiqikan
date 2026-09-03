import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { handleClose, handleMsg, newConn, type Conn } from './rooms';

const PORT = Number(process.env.PORT) || 10000;
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
      // 品牌化 404：与前端同一深色调
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · 一起看</title><style>
        body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0d1512;color:#f3f0e7;font-family:'PingFang SC','Microsoft YaHei',sans-serif}
        .box{text-align:center;padding:2rem}
        b{display:block;font-size:64px;color:#e8825a;margin-bottom:.5rem}
        p{color:#a3b0aa;font-size:14px;margin:.5rem 0 1.5rem}
        a{color:#f4a07c;text-decoration:none;border:1px solid rgba(232,130,90,.5);padding:10px 22px;border-radius:12px}
      </style></head><body><div class="box"><b>404</b><p>这一卷胶片不存在，回放映室再找找。</p><a href="/">回到大厅</a></div></body></html>`);
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
