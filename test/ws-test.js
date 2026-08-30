// 模拟两个人：屋主建房、观众加入，验证全链路消息
const WebSocket = require('ws');
const PORT = process.env.PORT || 3210;

const fail = (msg) => { console.error('FAIL: ' + msg); process.exit(1); };
const guard = setTimeout(() => fail('测试超时'), 8000);

const host = new WebSocket(`ws://localhost:${PORT}/ws`);
const guest = new WebSocket(`ws://localhost:${PORT}/ws`);
let roomCode = '';
const seen = { guestSrc: false, guestSync: false, hostChat: false, hostPoke: false, guestHeartbeat: false };

const step = {};
function waitFor(key, fn) { step[key] = fn; }
function deliver(ws, m) {
  const fn = Object.keys(step).map((k) => ({ k, fn: step[k], match: keyMatch(k, m) })).find((x) => x.match);
  if (fn) { delete step[fn.k]; fn.fn(m); }
}
// 每一步只匹配特定类型，避免串台
function keyMatch(key, m) {
  if (key === 'created' && m.t === 'created') return true;
  if (key === 'joined' && m.t === 'joined') return true;
  if (key === 'memberJoin' && m.t === 'member' && m.action === 'join') return true;
  if (key === 'guestSrc' && m.t === 'src') return true;
  if (key === 'guestSync' && m.t === 'sync') return true;
  if (key === 'guestHeartbeat' && m.t === 'heartbeat') return true;
  if (key === 'hostChat' && m.t === 'chat') return true;
  if (key === 'hostPoke' && m.t === 'poke') return true;
  if (key === 'hostNotice' && m.t === 'notice') return true;
  return false;
}
host.on('message', (d) => deliver(host, JSON.parse(d)));
guest.on('message', (d) => deliver(guest, JSON.parse(d)));

let hostOpen = false, guestOpen = false;
function whenBothOpen(fn) { if (hostOpen && guestOpen) fn(); }
host.on('open', () => { hostOpen = true; whenBothOpen(() => host.send(JSON.stringify({ t: 'create', name: '屋主' }))); });
guest.on('open', () => {
  guestOpen = true;
  whenBothOpen(() => host.send(JSON.stringify({ t: 'create', name: '屋主' })));
  waitFor('created', (m) => {
    roomCode = m.room;
    if (!m.members.length || !m.members[0].host) fail('created 应带屋主成员');
    console.log('OK 房间创建: ' + roomCode);
    guest.send(JSON.stringify({ t: 'join', room: roomCode, name: '宝宝' }));
  });
  waitFor('joined', (m) => {
    if (m.members.length !== 2) fail('joined 后应有两名成员');
    console.log('OK 观众加入, 成员数=2');
    host.send(JSON.stringify({ t: 'src', kind: 'url', url: '/test.mp4', title: '测试片' }));
  });
  waitFor('guestSrc', (m) => {
    if (m.state.kind !== 'url') fail('src 类型不对');
    console.log('OK 选片广播到观众');
    host.send(JSON.stringify({ t: 'sync', playing: true, pos: 120 }));
  });
  waitFor('guestSync', (m) => {
    if (m.pos !== 120 || m.playing !== true) fail('同步位置/状态不对');
    console.log('OK 播放状态同步到观众 pos=120');
    host.send(JSON.stringify({ t: 'heartbeat', playing: true, pos: 121 }));
  });
  waitFor('guestHeartbeat', (m) => {
    seen.guestHeartbeat = true;
    console.log('OK 心跳纠偏 pos=121');
    guest.send(JSON.stringify({ t: 'chat', text: '看到这里笑了' }));
  });
  waitFor('hostChat', (m) => {
    seen.hostChat = true;
    if (m.from !== '宝宝' || m.text !== '看到这里笑了') fail('聊天内容不对');
    console.log('OK 观众聊天到达屋主');
    guest.send(JSON.stringify({ t: 'poke' }));
  });
  waitFor('hostPoke', (m) => {
    seen.hostPoke = true;
    if (m.from !== '宝宝') fail('戳一戳来源不对');
    console.log('OK 戳一戳到达屋主');
    host.close(); guest.close();
    clearTimeout(guard);
    console.log('\nALL PASS ✅');
    process.exit(0);
  });
});
host.on('error', (e) => fail('host 连接失败: ' + e.message));
guest.on('error', (e) => fail('guest 连接失败: ' + e.message));
