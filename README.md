# 一起看 · 两个人的小影院

异地恋同步看片小站。两种模式：

- **同步播放**：两人各自播放同一个片源，只同步"播放 / 暂停 / 进度"指令，
  原画画质、几乎不费流量；
- **屏幕共享**：屋主把电脑屏幕（比如腾讯/优酷/爱奇艺的播放页）通过
  WebRTC 实时推给对方的手机/平板，画面声音都过去。

网页打开就能用，手机电脑都行。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite | 组件在 `web/src/components`，状态机在 `web/src/hooks/useRoom.ts` |
| 后端 | Node.js + ws | 房间与消息路由在 `server/src/rooms.ts`，约 200 行 |
| 协议 | 自定义 JSON 消息 | 前后端共用一份类型定义 `shared/protocol.ts` |
| 实时画面 | WebRTC（屏幕采集 + P2P） | STUN 用腾讯公共服务器，`web/src/lib/webrtc.ts` |

## 开发

```bash
npm install
npm run dev        # 同时起 server(:3000) 和 vite(:5173)，浏览器开 5173
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
- **同步播放**：屋主"选片"（视频直链或两边同一个本地文件），屋主的播放/暂停/拖进度
  全场同步，每 5 秒心跳自动纠偏
- **屏幕共享**：屋主点"屏幕共享"选一个窗口/标签页（比如视频播放页），
  对方手机上直接出现实时画面；播放控制就在你自己的电脑上，天然同步

## 没有 VPS 怎么办

服务器只转发几字节的心跳和信令指令，对带宽几乎零要求，三个零成本选择：

**1. 内网穿透，把家里电脑当服务器（推荐起步）**

```bash
npm run build && npm start           # 窗口1
npx localtunnel --port 3000          # 窗口2：得到 https://xxx.loca.lt
```

浏览器首次访问 localtunnel 有个提示页，按提示输入页面上显示的 IP 即可；
链接每次重启会变。国内更稳的替代：natapp / cpolar 注册免费隧道（需实名）。

> 屏幕共享的视频流走 WebRTC P2P 直连，不经过隧道；若两边网络打洞失败，
> 画面会停在"正在建立连接"，这时只能上中继（见下节）。

**2. 免费云托管**：Render / Glitch 的免费 Node 服务，不用开电脑；
免费档闲置会休眠、国内访问质量看运气。

**3. P2P 改造**：同步播放模式本身可以做到零服务器（WebRTC DataChannel +
公共 STUN + 微信发码做信令）。

## 异地部署（需要一台 VPS）

阿里云/腾讯云轻量服务器即可（国内直连快），安全组放行端口后：

```bash
npm install && npm run build
pm2 start "tsx server/src/index.ts" --name yiqikan
```

建议用 Caddy 套一层 HTTPS（两条配置的事）：手机上震动、剪贴板、
屏幕采集这些 API 只在 HTTPS（或 localhost）下生效。
有了 VPS 还可以加 TURN（coturn）做屏幕共享中继，打洞失败也能连。

## 片源从哪来

- 同步播放：视频直链（mp4/webm）或两人各自的同一个本地文件；平台 DRM 内容
  （腾讯/优酷/爱奇艺）拿不到直链，走屏幕共享模式
- 片源请自行准备

## 路线图

- [x] WebRTC 连麦语音，边看边聊（双方点 🎤 连麦，屋主自动发起音频连接）
- [ ] 连麦静音键 / 降噪
- [ ] 视频上的悄悄话气泡 / 小弹幕
- [ ] 观影手账：一起看过的片、累计时长、追剧清单
- [ ] 小挂件：两只小人趴在进度条上
- [ ] HLS(m3u8) 支持（hls.js）
- [ ] 屏幕共享的 TURN 中继配置（打洞失败兜底）

改哪里：房间/同步/信令路由在 `server/src/rooms.ts`，前端状态机在
`web/src/hooks/useRoom.ts`，WebRTC 细节在 `web/src/lib/webrtc.ts`。
