# 项目协作规范

## 技术栈

- 前端：React 18、TypeScript、Vite。
- 后端：Node.js、TypeScript、`ws` WebSocket 服务。
- 实时通信：WebRTC，用于屏幕共享和连麦语音。
- 协议：前后端共用 `shared/protocol.ts` 中定义的 JSON 消息类型。
- 测试与质量：ESLint、TypeScript 类型检查、Vite 构建、WebSocket 集成测试。

## 代码与注释

- 新增和修改的代码保持现有 TypeScript/React 风格，优先复用已有组件、Hook 和工具函数。
- 注释统一使用中文；注释应说明业务规则、协议约束或不明显的实现原因。
- 不为显而易见的代码添加逐行注释，避免无效叙述。
- 修改 WebSocket 消息时，先同步更新 `shared/protocol.ts`，再调整服务端和前端处理逻辑。
- 涉及用户可见文本时使用简洁自然的中文，并保持现有产品语气。

## Git 规范

- 每次功能、修复、重构或配置调整完成后都必须提交 Git，包括很小的功能修改。
- 提交前至少检查 `git status`，并确认只包含本次任务相关文件。
- 提交信息使用简短、清晰的 Conventional Commits 风格，例如：
  - `feat: 新增连麦静音控制`
  - `fix: 修复房间断线后的状态清理`
  - `docs: 更新部署说明`
  - `chore: 调整构建配置`
- 一个提交聚焦一个逻辑变更，不把无关格式化或临时文件混入提交。
- 不提交 `node_modules`、构建产物或本地环境密钥；遵循 `.gitignore`。

## 推送（本机 github.com:443 被墙）

- 本机直连 `github.com` 不通（`git push`/`git fetch` 会卡到超时），但 `api.github.com` 可通。
- 推送用 `npm run push`（`scripts/push-via-api.mjs`）：经 GitHub REST API 把本地 HEAD 文件树复刻到远程 main，CI 正常触发。
- 核对同步状态用 `npm run push:status`：本地与远程文件树 SHA 一致即已同步。
- 本地 `git status` 显示的"领先 origin/main"只是历史形状不同（远程提交 SHA 由远程父提交决定），以 `npm run push:status` 的树级比对为准。
- 若日后网络环境变化（如配置了代理、或 SSH key 走 ssh.github.com:443），可恢复直接 `git push`。
