# 一起看 · 两个人的小影院

异地恋一起看片小站。两路实时流：

- **屏幕共享**：屋主把电脑屏幕（腾讯/优酷/爱奇艺播放页、本地播放器都行）通过
  WebRTC 实时推给对方的手机/平板，画面声音都过去；
- **音视频连麦**：开摄像头互相看脸 + 说话（与屏幕共享互不干扰，是第二路实时视频）。

网页打开就能用，手机电脑都行。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite | 组件在 `web/src/components`，状态机在 `web/src/hooks/useRoom.ts` |
| 后端 | Node.js + ws | 房间与消息路由在 `server/src/rooms.ts`，约 200 行 |
| 协议 | 自定义 JSON 消息 | 前后端共用一份类型定义 `shared/protocol.ts` |
| 实时画面 | WebRTC（屏幕采集 + 摄像头 + P2P） | STUN 用腾讯公共服务器，`web/src/lib/webrtc.ts` |

## 屏幕共享画质

屋主在控制栏可选三档（选超清看片最清晰，走 TURN 中继/网络差时自动降档）：

| 档位 | 码率 / 帧率 | 适用 |
|---|---|---|
| 流畅 | 2.5Mbps @ 30fps | 网络差 / TURN 中继兜底 |
| 高清（默认） | 8Mbps @ 60fps | 日常看片，P2P 直连 |
| 超清 | 12Mbps @ 60fps | 看片推荐，P2P 直连 |

编码器自动协商 **H.265(HEVC) > H.264**：两端浏览器都支持 HEVC 时自动用
（同画质省约一半码率），任意一端不支持则回落 H.264（WebRTC 强制编码器，
全浏览器兜底）。

## 开发

```bash
npm install
npm run dev        # 同时起 server(:10000) 和 vite(:9999)，浏览器开 http://localhost:9999
```

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | 两套 tsconfig 全量类型检查 |
| `npm run build` | 构建前端到 `dist/web` |
| `npm test` | 双人 WebSocket 全链路集成测试 |
| `npm start` | 生产模式（服务托管 `dist/web` 静态文件） |

CI：`.github/workflows/ci.yml`，push/PR 自动跑 lint + typecheck + build + test。

## 使用

- 电脑浏览器打开，输入昵称 → 创建房间
- 对方手机/平板打开邀请链接（`/?room=房间码`）加入
- **屏幕共享**：屋主点"屏幕共享"选一个窗口/标签页（视频网站、本地播放器都行），
  对方手机上直接出现实时画面；播放控制就在你自己的电脑上，天然同步
- **音视频连麦**：任一方点"摄像头"开摄像头+麦克风，另一方也点"摄像头"后自动建立
  双向音视频连接；远端画面浮在影片右下角小窗，自己的预览在左下角（镜像）。
  只说话不开摄像头就点"连麦"（纯语音）
- **静音 / 降噪**：连麦或摄像头开着时，点"静音"本地静音（连接不断），对方会看到你
  静音状态；麦克风采集已默认开启降噪 + 回声消除 + 自动增益，环境吵也不刺耳
- **悄悄话弹幕**：聊天面板顶部点"弹幕开"，之后你俩说的每句话都会从右往左飘在
  影片画面上（自己的蓝色、对方的白色），追剧时不用切屏也能看TA的碎碎念

## 没有 VPS 怎么办

服务器只转发几字节的心跳和信令指令，对带宽几乎零要求，三个零成本选择：

**1. 内网穿透，把家里电脑当服务器（推荐起步）**

```bash
npm run build && npm start           # 窗口1（服务在 :10000）
npx localtunnel --port 10000         # 窗口2：得到 https://xxx.loca.lt
```

浏览器首次访问 localtunnel 有个提示页，按提示输入页面上显示的 IP 即可；
链接每次重启会变。国内更稳的替代：natapp / cpolar 注册免费隧道（需实名）。

> 屏幕共享/摄像头的视频流走 WebRTC P2P 直连，不经过隧道；若两边网络打洞失败，
> 画面会停在"正在建立连接"，这时只能上中继（见下节）。

**2. 免费云托管**：Render / Glitch 的免费 Node 服务，不用开电脑；
免费档闲置会休眠、国内访问质量看运气。

**3. P2P 改造**：信令与房间逻辑本身可以做到零服务器（WebRTC DataChannel +
公共 STUN + 微信发码做信令）。

## 异地部署（需要一台 VPS）

阿里云/腾讯云轻量服务器即可（国内直连快），安全组放行端口后：

```bash
npm install && npm run build
pm2 start "tsx server/src/index.ts" --name yiqikan
```

建议用 Caddy 套一层 HTTPS（两条配置的事）：手机上震动、剪贴板、
屏幕采集、摄像头这些 API 只在 HTTPS（或 localhost）下生效。

### TURN 中继（coturn，打洞失败兜底）

两人通常 P2P 直连不经过服务器；只有一方在 NAT 后面打洞失败时，画面才会
走 TURN 中继（此时已自动降到流畅档，避免吃满轻量服务器 3~5Mbps 带宽）。

**1. 服务器装 coturn（Ubuntu/Debian）**

```bash
sudo apt update && sudo apt install -y coturn
sudo systemctl enable coturn
```

**2. 改 /etc/turnserver.conf**（替换 IP/域名/密钥）：

```ini
listening-port=3478
fingerprint
lt-cred-mech
user=yiqikan:换成你的强密码
realm=你的域名或服务器IP
# 阿里云是 NAT 环境，必须填公网IP（有些实例要同时给内网IP：公网/内网）
external-ip=你的公网IP
# 中继转发的 UDP 端口段，安全组要同步放行
min-port=49152
max-port=65535
no-cli
log-file=/var/log/turnserver.log
```

> 有域名就走 `realm=你的域名` 并加证书（cert/pkey 指向 Caddy 签发的证书，
> 开 tls-listening-port=5349）；只有 IP 也能用，realm 填公网 IP 即可。

**3. 启动并放行安全组**：

```bash
sudo systemctl restart coturn
sudo systemctl status coturn      # active (running) 即可
```

阿里云控制台 → 安全组 → 入方向放行：**TCP/UDP 3478** + **UDP 49152-65535**
（UDP 转发段；如果只想开一小段就同步改 conf 里的 min/max-port）。

**4. 前端注入 TURN 地址（构建时生效，改 web/.env 后重新 build）**：

```bash
# web/.env（提交前确认别把密码提交进仓库）
VITE_TURN_URL=turn:你的域名:3478
VITE_TURN_USER=yiqikan
VITE_TURN_CRED=你的强密码
```

代码里已支持：检测到走中继时自动把画质压到流畅档（`web/src/lib/webrtc.ts`），
没配 TURN 就保持纯 STUN 不报错。验证是否打通：屏幕共享时两边网络打洞
失败的场景能连上（不再卡"正在建立连接"）。

## 片源从哪来

屋主在自己电脑上打开要看的片（腾讯/优酷/爱奇艺播放页、本地播放器、网盘网页都行），
点"屏幕共享"选中那个窗口即可——片源在屋主屏幕上，对方看到的就是实时画面。
本地视频文件直接用播放器全屏播放后共享。

## 路线图

- [x] WebRTC 连麦语音，边看边聊（双方点连麦，屋主自动发起音频连接）
- [x] 屏幕共享高画质（三档码率/帧率 + H.265 自动升级 + 中继自动降档）
- [x] 音视频连麦（摄像头视频）——双向看脸 + 说话，远端小窗 + 本地镜像预览
- [x] 连麦静音键 / 降噪（本地静音连接不断 + 采集降噪/回声消除，对端可见静音状态）
- [x] 悄悄话弹幕（聊天面板开"弹幕"，消息从右往左飘在画面上，你/TA 颜色区分）
- [x] 屏幕共享的 TURN 中继配置（coturn + VITE_TURN_* 注入，打洞失败兜底，自动降档）
- [x] 深色模式（跟随系统 + 手动切换，TDesign 官方暗色 token）

> 历史说明：v0.2 曾有"选片 + 同步播放"模式（直链/本地文件/HLS，各自播放只同步
> 进度指令），v0.3 起移除——平台内容拿不到直链，屏幕共享是唯一主路径。

改哪里：房间/信令路由在 `server/src/rooms.ts`，前端状态机在
`web/src/hooks/useRoom.ts`，WebRTC 细节在 `web/src/lib/webrtc.ts`。
