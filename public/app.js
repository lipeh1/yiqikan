const $ = (id) => document.getElementById(id);
const video = $('video');

let ws = null;
let isHost = false;
let inRoom = false;
let myName = '';
let roomCode = '';
let desiredPlaying = false; // 同步目标状态：还没法立即执行时先记住
let pending = null;         // 本地文件还没选好时暂存 { pos, playing }
let armed = false;          // 手机浏览器需要一次用户点击才允许出声
let dragging = false;

/* ---------- 小工具 ---------- */
const fmt = (s) => {
  s = Math.floor(s || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function addChat(from, text, mine) {
  const log = $('chatLog');
  const div = document.createElement('div');
  div.className = 'msg' + (mine ? ' mine' : '');
  const b = document.createElement('b');
  b.textContent = from;
  div.append(b, text);
  log.append(div);
  while (log.children.length > 200) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

/* ---------- 连接 ---------- */
function connect(then) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = then;
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => toast('连接断了，刷新一下重进吧');
}
function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

function enterRoom(code, host) {
  inRoom = true;
  isHost = host;
  roomCode = code;
  $('lobby').classList.add('hidden');
  $('roomView').classList.remove('hidden');
  $('roomCode').textContent = code;
  updateRole();
}
function updateRole() {
  $('playBtn').disabled = !isHost;
  $('srcBtn').disabled = !isHost;
  $('seek').disabled = !isHost;
  $('srcBar').classList.add('hidden');
  $('roleHint').textContent = isHost
    ? '你是屋主：选片、播放、拖进度都由你控制'
    : '跟着屋主的进度走，想TA了就戳一下';
}

/* ---------- 片源 ---------- */
function loadSource(st) {
  $('noSource').classList.add('hidden');
  if (st.kind === 'url') {
    $('localPrompt').classList.add('hidden');
    video.src = st.url;
    toast('片来了：' + st.title);
    if (pending) { applyState(pending.pos, pending.playing); pending = null; }
  } else {
    $('localTitle').textContent = st.title;
    $('localPrompt').classList.remove('hidden');
    toast('屋主选了本地文件，你也选一下同一个');
  }
}
function hostSetSource(kind, url, title) {
  send({ t: 'src', kind, url, title });
  if (kind === 'url') video.src = url;
  $('noSource').classList.add('hidden');
  $('srcBar').classList.add('hidden');
  toast('已分享给对方');
}

/* ---------- 同步 ---------- */
function applyState(pos, playing) {
  desiredPlaying = playing;
  if (!video.src || !video.currentSrc) {
    pending = { pos, playing };
    return;
  }
  if (isFinite(pos) && Math.abs(video.currentTime - pos) > 1.5) video.currentTime = pos;
  if (playing) {
    video.play().catch(() => {
      if (!armed) $('unlock').classList.remove('hidden');
    });
  } else {
    video.pause();
  }
}
// 任意一次点击都尝试解锁手机自动播放限制
function arm() {
  if (armed || !video.currentSrc) return;
  video.play().then(() => {
    armed = true;
    $('unlock').classList.add('hidden');
    if (!desiredPlaying) video.pause();
  }).catch(() => {});
}
document.addEventListener('pointerdown', arm);

/* 屋主：自己的播放变化就是广播源 */
video.addEventListener('play', () => {
  if (isHost) { $('playBtn').textContent = '⏸ 暂停'; send({ t: 'sync', playing: true, pos: video.currentTime }); }
});
video.addEventListener('pause', () => {
  if (isHost) { $('playBtn').textContent = '▶ 播放'; send({ t: 'sync', playing: false, pos: video.currentTime }); }
});

/* 屋主每 5 秒心跳纠偏，追剧两小时也差不出一两秒 */
setInterval(() => {
  if (isHost && video.currentSrc && !video.paused && !video.ended) {
    send({ t: 'heartbeat', playing: true, pos: video.currentTime });
  }
}, 5000);

/* 进度条与时间显示 */
setInterval(() => {
  if (!video.currentSrc) return;
  $('curTime').textContent = fmt(video.currentTime);
  $('durTime').textContent = isFinite(video.duration) ? fmt(video.duration) : '--:--';
  if (!dragging && isFinite(video.duration) && video.duration > 0) {
    $('seek').value = Math.round((video.currentTime / video.duration) * 1000);
  }
}, 500);

/* ---------- 服务器消息 ---------- */
function handle(m) {
  switch (m.t) {
    case 'created':
      enterRoom(m.room, true);
      renderMembers(m.members);
      toast('房间建好了，把邀请码发给 TA');
      break;
    case 'joined':
      enterRoom(m.room, false);
      renderMembers(m.members);
      if (m.state) {
        loadSource(m.state);
        if (m.state.kind === 'url') applyState(m.pos, m.playing);
        else pending = { pos: m.pos, playing: m.playing };
      }
      toast('进来啦');
      break;
    case 'host':
      isHost = true;
      updateRole();
      toast('你成了新屋主');
      break;
    case 'member':
      renderMembers(m.members);
      if (m.action === 'join') toast(m.name + ' 进来了');
      if (m.action === 'leave') toast(m.name + ' 走开了');
      break;
    case 'src': loadSource(m.state); break;
    case 'sync':
    case 'heartbeat':
      if (!isHost) applyState(m.pos, m.playing);
      break;
    case 'chat': addChat(m.from, m.text, false); break;
    case 'poke':
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      toast(m.from + ' 戳了戳你');
      addChat('戳一戳', '戳了戳你，快看片！', false);
      break;
    case 'notice': toast(m.msg); break;
    case 'err': toast(m.msg); break;
  }
}

function renderMembers(list) {
  const box = $('members');
  box.innerHTML = '';
  for (const p of list) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = (p.host ? '👑 ' : '') + p.name + (p.name === myName ? '（我）' : '');
    box.append(chip);
  }
}

/* ---------- 大厅 ---------- */
$('createBtn').addEventListener('click', () => {
  myName = $('name').value.trim() || '我';
  connect(() => send({ t: 'create', name: myName }));
});
$('joinBtn').addEventListener('click', () => {
  const code = $('roomInput').value.trim().toUpperCase();
  if (code.length !== 4) { $('lobbyErr').textContent = '房间码是 4 位哦'; return; }
  myName = $('name').value.trim() || '我';
  connect(() => send({ t: 'join', room: code, name: myName }));
});
const qr = new URLSearchParams(location.search).get('room');
if (qr) $('roomInput').value = qr.toUpperCase();

/* ---------- 房间内按钮 ---------- */
$('playBtn').addEventListener('click', () => {
  if (!video.currentSrc) { toast('先选片呀'); return; }
  if (video.paused) video.play().catch(() => {}); else video.pause();
});

$('seek').addEventListener('input', () => {
  dragging = true;
  if (isFinite(video.duration)) $('curTime').textContent = fmt(($('seek').value / 1000) * video.duration);
});
$('seek').addEventListener('change', () => {
  dragging = false;
  if (isHost && isFinite(video.duration) && video.currentSrc) {
    video.currentTime = ($('seek').value / 1000) * video.duration;
    send({ t: 'sync', playing: !video.paused, pos: video.currentTime });
  }
});

$('srcBtn').addEventListener('click', () => $('srcBar').classList.toggle('hidden'));
$('urlBtn').addEventListener('click', () => {
  const u = $('urlInput').value.trim();
  if (!/^(https?:\/\/|\/)/.test(u)) { toast('要 http(s) 开头的直链'); return; }
  hostSetSource('url', u, '在线视频');
});
$('hostFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  send({ t: 'src', kind: 'local', url: '', title: f.name });
  video.src = URL.createObjectURL(f);
  $('localPrompt').classList.add('hidden');
  $('noSource').classList.add('hidden');
  $('srcBar').classList.add('hidden');
  toast('已分享给对方');
});
$('localFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  video.src = URL.createObjectURL(f);
  $('localPrompt').classList.add('hidden');
  toast('好了，跟上了');
  if (pending) { applyState(pending.pos, pending.playing); pending = null; }
});
$('unlockBtn').addEventListener('click', arm);

$('fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  const stage = $('stage');
  if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone Safari
});

$('pokeBtn').addEventListener('click', () => {
  send({ t: 'poke' });
  if (navigator.vibrate) navigator.vibrate(80);
  toast('戳了戳对方');
});

$('chatBtn').addEventListener('click', () => {
  const d = $('chatDrawer');
  d.classList.toggle('hidden');
  if (!d.classList.contains('hidden')) $('chatInput').focus();
});
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('chatInput').value.trim();
  if (!v) return;
  send({ t: 'chat', text: v });
  addChat(myName + '（我）', v, true);
  $('chatInput').value = '';
});

$('copyBtn').addEventListener('click', () => {
  const url = location.origin + '/?room=' + roomCode;
  const done = () => toast('邀请链接已复制，发给 TA 吧');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(done).catch(() => window.prompt('复制这个链接发给 TA', url));
  } else {
    window.prompt('复制这个链接发给 TA', url);
  }
});
