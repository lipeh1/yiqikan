const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
// 去掉容易看混的字符（0/O、1/I），房间码口头念也不出错
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const rooms = new Map(); // code -> { code, host, clients: [], state, playing, pos }

function newCode() {
  let c;
  do {
    c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(c));
  return c;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg, except) {
  for (const c of [room.host, ...room.clients]) {
    if (c && c !== except && c.readyState === 1) send(c, msg);
  }
}
function membersOf(room) {
  const m = [];
  if (room.host && room.host.name) m.push({ name: room.host.name, host: true });
  for (const c of room.clients) if (c.name) m.push({ name: c.name, host: false });
  return m;
}

wss.on('connection', (ws) => {
  ws.name = '';
  ws.room = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create') {
      const room = { code: newCode(), host: ws, clients: [], state: null, playing: false, pos: 0 };
      rooms.set(room.code, room);
      ws.name = String(m.name || '我').slice(0, 12);
      ws.room = room;
      send(ws, { t: 'created', room: room.code, isHost: true, members: membersOf(room) });
      return;
    }

    if (m.t === 'join') {
      const room = rooms.get(String(m.room || '').toUpperCase());
      if (!room) return send(ws, { t: 'err', msg: '房间不存在，检查一下房间码' });
      ws.name = String(m.name || '我').slice(0, 12);
      ws.room = room;
      room.clients.push(ws);
      send(ws, {
        t: 'joined', room: room.code, isHost: false,
        members: membersOf(room), state: room.state, playing: room.playing, pos: room.pos,
      });
      broadcast(room, { t: 'member', action: 'join', name: ws.name, members: membersOf(room) }, ws);
      return;
    }

    const room = ws.room;
    if (!room) return;

    if (m.t === 'src') {
      if (ws !== room.host) return;
      room.state = {
        kind: m.kind === 'local' ? 'local' : 'url',
        url: String(m.url || '').slice(0, 1000),
        title: String(m.title || '未命名').slice(0, 80),
      };
      room.playing = false;
      room.pos = 0;
      broadcast(room, { t: 'src', state: room.state });
      return;
    }

    if (m.t === 'sync' || m.t === 'heartbeat') {
      if (ws !== room.host) return;
      room.playing = !!m.playing;
      room.pos = Math.max(0, Number(m.pos) || 0);
      broadcast(room, { t: m.t, playing: room.playing, pos: room.pos }, ws);
      return;
    }

    if (m.t === 'chat') {
      const text = String(m.text || '').slice(0, 300).trim();
      if (!text) return;
      broadcast(room, { t: 'chat', from: ws.name, text }, ws);
      return;
    }

    if (m.t === 'poke') {
      broadcast(room, { t: 'poke', from: ws.name }, ws);
      return;
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws === room.host) {
      const next = room.clients.shift();
      if (next) {
        room.host = next;
        send(next, { t: 'host' });
        broadcast(room, { t: 'notice', msg: `${ws.name} 离开了，${next.name} 接管了片场` });
        broadcast(room, { t: 'member', action: 'host', name: next.name, members: membersOf(room) });
      } else {
        rooms.delete(room.code);
      }
    } else {
      room.clients = room.clients.filter((c) => c !== ws);
      broadcast(room, { t: 'member', action: 'leave', name: ws.name, members: membersOf(room) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`一起看 -> http://localhost:${PORT}`);
});
