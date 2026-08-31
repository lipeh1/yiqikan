// 双人全链路集成测试：自起服务，模拟屋主+观众，覆盖同步播放与屏幕共享信令
import assert from 'node:assert';
import WebSocket from 'ws';
import { start } from '../server/src/index';
import type { ClientMsg, ServerMsg } from '../shared/protocol';

const PORT = 3211;
start(PORT);

const fail = (msg: string): never => {
  console.error('FAIL:', msg);
  process.exit(1);
};
const guard = setTimeout(() => fail('测试超时'), 8000);

type StepFn = (m: ServerMsg) => void;

class Client {
  private steps = new Map<string, StepFn>();
  constructor(
    public ws: WebSocket,
    private label: string,
  ) {
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      const fn = this.steps.get(m.t) as ((m: ServerMsg) => void) | undefined;
      if (!fn) return;
      this.steps.delete(m.t);
      fn(m);
    });
    ws.on('error', (e) => fail(`${this.label} 连接失败: ${e.message}`));
  }
  send(m: ClientMsg): void {
    this.ws.send(JSON.stringify(m));
  }
  waitFor<T extends ServerMsg['t']>(
    type: T,
    fn: (m: Extract<ServerMsg, { t: T }>) => void,
  ): void {
    this.steps.set(type, fn as StepFn);
  }
}

const host = new Client(new WebSocket(`ws://localhost:${PORT}/ws`), 'host');
const guest = new Client(new WebSocket(`ws://localhost:${PORT}/ws`), 'guest');

let room = '';
let hostCid = 0;
let guestCid = 0;

let hostOpen = false;
let guestOpen = false;
const both = (fn: () => void) => {
  if (hostOpen && guestOpen) fn();
};

host.ws.on('open', () => {
  hostOpen = true;
  both(() => host.send({ t: 'create', name: '屋主' }));
});
guest.ws.on('open', () => {
  guestOpen = true;
  both(() => host.send({ t: 'create', name: '屋主' }));
});

host.waitFor('created', (m) => {
  room = m.room;
  hostCid = m.hostCid;
  assert.equal(m.members.length, 1);
  console.log('OK 房间创建:', room, '屋主 cid =', hostCid);
  guest.send({ t: 'join', room, name: '宝宝' });
});

guest.waitFor('joined', (m) => {
  assert.equal(m.members.length, 2);
  assert.equal(m.mode, 'idle');
  guestCid = m.you;
  console.log('OK 观众加入, 成员数=2, 观众 cid =', guestCid);
  host.send({ t: 'src', kind: 'url', url: '/test.mp4', title: '测试片' });
});

host.waitFor('member', (m) => {
  assert.equal(m.action, 'join');
  assert.equal(m.name, '宝宝');
  assert.equal(m.cid, guestCid);
  console.log('OK member 事件带 cid');
});

guest.waitFor('src', (m) => {
  assert.equal(m.src.kind, 'url');
  console.log('OK 选片广播到观众');
  host.send({ t: 'sync', playing: true, pos: 120 });
});

guest.waitFor('sync', (m) => {
  assert.equal(m.pos, 120);
  assert.equal(m.playing, true);
  console.log('OK 播放状态同步到观众 pos=120');
  host.send({ t: 'heartbeat', playing: true, pos: 121 });
});

guest.waitFor('heartbeat', () => {
  console.log('OK 心跳纠偏 pos=121');
  host.send({ t: 'share-start' });
});

guest.waitFor('mode', (m) => {
  assert.equal(m.mode, 'share');
  console.log('OK 共享模式广播');
  // 第二次 mode 事件（退回同步模式）在这里注册，避免加载时被覆盖
  guest.waitFor('mode', (m2) => {
    assert.equal(m2.mode, 'sync');
    console.log('OK 退回同步模式');
    clearTimeout(guard);
    host.ws.close();
    guest.ws.close();
    console.log('\nALL PASS ✅');
    process.exit(0);
  });
  host.send({ t: 'rtc-offer', to: guestCid, sdp: 'fake-offer' });
});

guest.waitFor('rtc-offer', (m) => {
  assert.equal(m.from, hostCid);
  assert.equal(m.sdp, 'fake-offer');
  console.log('OK offer 定向送达观众');
  guest.send({ t: 'rtc-answer', sdp: 'fake-answer' });
});

host.waitFor('rtc-answer', (m) => {
  assert.equal(m.from, guestCid);
  console.log('OK answer 路由回屋主');
  guest.send({ t: 'rtc-ice', to: 'host', candidate: { candidate: 'ice-1' } });
});

host.waitFor('rtc-ice', (m) => {
  assert.equal(m.candidate.candidate, 'ice-1');
  console.log('OK 观众 ICE 到达屋主');
  host.send({ t: 'rtc-ice', to: guestCid, candidate: { candidate: 'ice-2' } });
});

guest.waitFor('rtc-ice', (m) => {
  assert.equal(m.candidate.candidate, 'ice-2');
  console.log('OK 屋主 ICE 定向送达观众');
  guest.send({ t: 'chat', text: '看到这里笑了' });
});

host.waitFor('chat', (m) => {
  assert.equal(m.from, '宝宝');
  assert.equal(m.text, '看到这里笑了');
  console.log('OK 聊天到达屋主');
  guest.send({ t: 'poke' });
});

host.waitFor('poke', (m) => {
  assert.equal(m.from, '宝宝');
  console.log('OK 戳一戳到达屋主');
  host.send({ t: 'share-stop' });
});
