import type { ClientMsg, Member, ServerMsg } from '../../shared/protocol';
import type { WebSocket as WsSocket } from 'ws';

export interface Conn {
  ws: WsSocket;
  cid: number;
  name: string;
  room: Room | null;
  voice: boolean; // 是否在麦上
  cam: boolean; // 是否开着摄像头
  muted: boolean; // 是否静音
}

export interface Room {
  code: string;
  host: Conn;
  clients: Conn[];
  mode: 'idle' | 'sync' | 'share';
  src: { kind: 'url' | 'local'; url: string; title: string } | null;
  playing: boolean;
  pos: number;
  nextCid: number;
}

export function newConn(ws: WsSocket): Conn {
  return { ws, cid: 0, name: '', room: null, voice: false, cam: false, muted: false };
}

export function send(conn: Conn, msg: ServerMsg): void {
  if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(msg));
}

export function broadcast(room: Room, msg: ServerMsg, except?: Conn): void {
  for (const c of [room.host, ...room.clients]) {
    if (c && c !== except && c.ws.readyState === 1) send(c, msg);
  }
}

export function membersOf(room: Room): Member[] {
  const m: Member[] = [
    {
      cid: room.host.cid,
      name: room.host.name,
      host: true,
      voice: room.host.voice,
      cam: room.host.cam,
      muted: room.host.muted,
    },
  ];
  for (const c of room.clients)
    m.push({ cid: c.cid, name: c.name, host: false, voice: c.voice, cam: c.cam, muted: c.muted });
  return m;
}

export function findByCid(room: Room, cid: number): Conn | null {
  if (room.host.cid === cid) return room.host;
  return room.clients.find((c) => c.cid === cid) ?? null;
}

// 房间码去掉易混字符（0/O、1/I），口头念也不出错
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newCode(existing: Set<string>): string {
  let c: string;
  do {
    c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (existing.has(c));
  return c;
}

// —— 消息处理 ——

export function handleCreate(conn: Conn, rooms: Map<string, Room>, name: string): void {
  const room: Room = {
    code: newCode(new Set(rooms.keys())),
    host: conn,
    clients: [],
    mode: 'idle',
    src: null,
    playing: false,
    pos: 0,
    nextCid: 2,
  };
  rooms.set(room.code, room);
  conn.name = String(name || '我').slice(0, 12);
  conn.room = room;
  conn.cid = 1;
  send(conn, {
    t: 'created',
    room: room.code,
    you: conn.cid,
    hostCid: conn.cid,
    members: membersOf(room),
  });
}

export function handleJoin(conn: Conn, rooms: Map<string, Room>, code: string, name: string): void {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) return send(conn, { t: 'err', msg: '房间不存在，检查一下房间码' });
  conn.name = String(name || '我').slice(0, 12);
  conn.room = room;
  conn.cid = room.nextCid++;
  room.clients.push(conn);
  send(conn, {
    t: 'joined',
    room: room.code,
    you: conn.cid,
    hostCid: room.host.cid,
    members: membersOf(room),
    mode: room.mode,
    src: room.src,
    sync: { playing: room.playing, pos: room.pos },
  });
  broadcast(room, { t: 'member', action: 'join', name: conn.name, cid: conn.cid, members: membersOf(room) }, conn);
}

export function handleMsg(conn: Conn, rooms: Map<string, Room>, raw: unknown): void {
  let m: ClientMsg;
  try {
    m = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (m.t === 'create') return handleCreate(conn, rooms, m.name);
  if (m.t === 'join') return handleJoin(conn, rooms, m.room, m.name);

  const room = conn.room;
  if (!room || !conn.cid) return;

  switch (m.t) {
    case 'src': {
      if (conn !== room.host) return;
      room.src = {
        kind: m.kind === 'local' ? 'local' : 'url',
        url: String(m.url || '').slice(0, 1000),
        title: String(m.title || '未命名').slice(0, 80),
      };
      room.playing = false;
      room.pos = 0;
      if (room.mode === 'idle') room.mode = 'sync';
      broadcast(room, { t: 'src', src: room.src });
      return;
    }
    case 'sync':
    case 'heartbeat': {
      if (conn !== room.host || room.mode !== 'sync') return;
      room.playing = !!m.playing;
      room.pos = Math.max(0, Number(m.pos) || 0);
      broadcast(room, { t: m.t, playing: room.playing, pos: room.pos }, conn);
      return;
    }
    case 'share-start': {
      if (conn !== room.host) return;
      room.mode = 'share';
      broadcast(room, { t: 'mode', mode: 'share' }, conn);
      return;
    }
    case 'share-stop': {
      if (conn !== room.host) return;
      room.mode = 'sync';
      broadcast(room, { t: 'mode', mode: 'sync' }, conn);
      return;
    }
    case 'chat': {
      const text = String(m.text || '')
        .slice(0, 300)
        .trim();
      if (!text) return;
      broadcast(room, { t: 'chat', from: conn.name, text }, conn);
      return;
    }
    case 'poke': {
      broadcast(room, { t: 'poke', from: conn.name }, conn);
      return;
    }
    case 'voice': {
      conn.voice = !!m.on;
      if (!m.on) conn.muted = false; // 挂断连麦时复位静音
      broadcast(room, { t: 'voice', cid: conn.cid, on: conn.voice });
      return;
    }
    case 'cam': {
      conn.cam = !!m.on;
      if (!m.on) conn.muted = false; // 关摄像头时复位静音
      broadcast(room, { t: 'cam', cid: conn.cid, on: conn.cam });
      return;
    }
    case 'mute': {
      conn.muted = !!m.on;
      broadcast(room, { t: 'mute', cid: conn.cid, on: conn.muted });
      return;
    }
    case 'v-offer': {
      // 连麦 offer 只有屋主能发，定向给指定成员
      if (conn !== room.host) return;
      const target = findByCid(room, m.to);
      if (target) send(target, { t: 'v-offer', from: conn.cid, sdp: m.sdp });
      return;
    }
    case 'v-answer': {
      send(room.host, { t: 'v-answer', from: conn.cid, sdp: m.sdp });
      return;
    }
    case 'v-ice': {
      if (m.to === 'host') {
        send(room.host, { t: 'v-ice', from: conn.cid, candidate: m.candidate });
      } else if (conn === room.host) {
        const target = findByCid(room, m.to);
        if (target) send(target, { t: 'v-ice', from: conn.cid, candidate: m.candidate });
      }
      return;
    }
    case 'rtc-offer': {
      // 只有屋主发 offer，定向给指定观众
      if (conn !== room.host) return;
      const target = findByCid(room, m.to);
      if (target) send(target, { t: 'rtc-offer', from: conn.cid, sdp: m.sdp });
      return;
    }
    case 'rtc-answer': {
      // 观众回给屋主
      send(room.host, { t: 'rtc-answer', from: conn.cid, sdp: m.sdp });
      return;
    }
    case 'rtc-ice': {
      const from = conn.cid;
      if (m.to === 'host') {
        send(room.host, { t: 'rtc-ice', from, candidate: m.candidate });
      } else if (conn === room.host) {
        const target = findByCid(room, m.to);
        if (target) send(target, { t: 'rtc-ice', from, candidate: m.candidate });
      }
      return;
    }
  }
}

export function handleClose(conn: Conn, rooms: Map<string, Room>): void {
  const room = conn.room;
  if (!room) return;
  if (conn === room.host) {
    const next = room.clients.shift();
    if (next) {
      room.host = next;
      send(next, { t: 'host' });
      broadcast(room, { t: 'notice', msg: `${conn.name} 离开了，${next.name} 接管了片场` });
      broadcast(room, { t: 'member', action: 'host', name: next.name, members: membersOf(room) });
      if (room.mode === 'share') {
        room.mode = 'sync';
        broadcast(room, { t: 'mode', mode: 'sync' });
      }
    } else {
      rooms.delete(room.code);
    }
  } else {
    room.clients = room.clients.filter((c) => c !== conn);
    broadcast(room, { t: 'member', action: 'leave', name: conn.name, members: membersOf(room) });
  }
}
