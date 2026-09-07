# 部署指南（零基础版）

面向没做过服务器运维的同学，从一台空白的阿里云服务器到"两人打开链接就能一起看片"，
照抄命令即可。进阶说明（原理、参数含义）见 README 的「异地部署」一节。

## 你最终会得到什么

- 一个 `https://你的域名` 网址，发给 TA 就能用
- 手机/电脑的屏幕共享、摄像头、麦克风都能用（HTTPS 是这些 API 的硬性前提）
- 两人网络打洞失败时自动走服务器中继兜底（coturn，第 5 步）

架构一句话：阿里云服务器上跑 Node 进程（信令 + 网页文件，端口 10000，只监听本机），
Caddy 在前面套 HTTPS（80/443 对外），音视频流量两人直连、不经服务器。

## 准备清单（动手前确认）

1. **一台阿里云服务器**（2 核 2G 足够），系统 Ubuntu 22.04 或 24.04，能拿到 root 密码。
2. **一个域名（强烈建议，约 ¥20-50/年）**，在阿里云「云解析 DNS」里加一条 A 记录
   指向服务器公网 IP。
   > ⚠️ **大陆地域的服务器 + 域名必须完成 ICP 备案**（免费，但流程要几天到几周），
   > 没备案的域名会被阿里云拦截。不想备案有两条路：服务器换香港地域（无需备案，
   > 国内访问稍慢），或走文末附录的「无域名方案」。
3. **安全组/防火墙放行端口**（阿里云控制台 → 轻量服务器叫「防火墙」，ECS 叫「安全组」
   → 入方向添加规则）：

   | 端口 | 协议 | 用途 |
   | --- | --- | --- |
   | 80, 443 | TCP | 网站入口（Caddy 自动签证书也要用 80） |
   | 3478 | TCP + UDP | coturn 信令（装了第 5 步才需要） |
   | 49152-65535 | UDP | coturn 中继转发（装了第 5 步才需要） |

   22 端口（SSH）默认已开。**10000 不要对公网开放**，它只给本机的 Caddy 用。

## 第 0 步：登录服务器

Windows 上打开 PowerShell（或用阿里云控制台的「远程连接」网页终端）：

```bash
ssh root@你的服务器公网IP
```

以下命令都在这个终端里执行。

## 第 1 步：装 Node.js（国内镜像，快且稳）

```bash
cd /tmp
wget https://cdn.npmmirror.com/binaries/node/v20.18.0/node-v20.18.0-linux-x64.tar.xz
tar -xJf node-v20.18.0-linux-x64.tar.xz -C /usr/local --strip-components=1
node -v && npm -v          # 看到 v20.18.0 即成功
npm config set registry https://registry.npmmirror.com   # npm 也换国内源
```

## 第 2 步：把代码弄上服务器

**方式 A（推荐，国内网络稳）：从你电脑打包上传。**
在**本机**的项目目录（Git Bash 或 PowerShell）：

```bash
cd /d/Develop/my/yiqikan        # 换成你的项目路径
git archive -o /tmp/yiqikan.tar HEAD
scp /tmp/yiqikan.tar root@服务器公网IP:/root/
```

回到**服务器**终端：

```bash
mkdir -p /opt/yiqikan
tar -xf /root/yiqikan.tar -C /opt/yiqikan
```

**方式 B：服务器直接拉 GitHub**（网络通畅时更省事，更新也方便）：

```bash
git clone https://github.com/你的用户名/yiqikan.git /opt/yiqikan
```

## 第 3 步：安装依赖、构建、跑起来

```bash
cd /opt/yiqikan
npm install                     # 装依赖（含 pm2 之外的所有工具）
npm run build                   # 构建前端到 dist/web

# pm2 守护进程：崩了自动拉起
npm install -g pm2
pm2 start "tsx server/src/index.ts" --name yiqikan
pm2 save                        # 记住进程列表

# 开机自启：这条命令会打印一行 sudo 命令，复制粘贴执行它
pm2 startup

curl http://127.0.0.1:10000     # 有 HTML 输出即服务已就绪
```

## 第 4 步：Caddy 套 HTTPS（有域名）

```bash
apt update && apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

写入 `/etc/caddy/Caddyfile`（把 `你的域名` 换掉，整个文件只需要这两行）：

```
你的域名 {
    reverse_proxy 127.0.0.1:10000
}
```

```bash
systemctl reload caddy
```

Caddy 会自动申请并续期 HTTPS 证书（前提：域名解析已生效、80/443 已放行）。
手机浏览器打开 `https://你的域名`，能进大厅页、屏幕共享不报错，就全部完成了。
WebSocket（/ws）Caddy 会自动透传，不用额外配置。

## 第 5 步（可选，建议做）：coturn 中继兜底

不做这步也能用——两人网络能打洞就直连；做了这步，打洞失败的场景也能连上
（此时自动降到流畅档 2.5Mbps，正好适配轻量服务器 3~5Mbps 带宽）。

```bash
apt install -y coturn
```

编辑 `/etc/turnserver.conf`（替换公网 IP 和强密码）：

```ini
listening-port=3478
fingerprint
lt-cred-mech
user=yiqikan:换成你的强密码
realm=你的域名
# 阿里云是 NAT 环境，必须显式给公网 IP，这是最常见的坑
external-ip=你的公网IP
min-port=49152
max-port=65535
no-cli
log-file=/var/log/turnserver.log
```

```bash
systemctl enable coturn && systemctl restart coturn
systemctl status coturn        # active (running) 即可
```

把 TURN 地址告诉前端（**是构建时变量，填完必须重新构建**）：

```bash
cd /opt/yiqikan
cp web/.env.example web/.env
nano web/.env                  # 填入域名和上面设的账号密码
npm run build
pm2 restart yiqikan
```

`web/.env` 已被 .gitignore 忽略，密码不会进仓库。

## 日常运维速查

```bash
pm2 logs yiqikan               # 看实时日志（Ctrl+C 退出）
pm2 restart yiqikan            # 重启服务
pm2 status                     # 看进程状态
df -h && free -h               # 磁盘 / 内存
tail -50 /var/log/turnserver.log   # coturn 日志
```

**更新代码到最新版**（方式 A 的流程）：本机 `git archive` + `scp` 覆盖上传 →

```bash
tar -xf /root/yiqikan.tar -C /opt/yiqikan
cd /opt/yiqikan && npm install && npm run build && pm2 restart yiqikan
```

## 附录：没有域名 / 不想备案

- **服务器是香港等地域**：不需要备案，域名直接可用，流程同上。
- **大陆机器且暂时不想备案**：Caddyfile 改成下面这样，用 IP 访问（`tls internal`
  是 Caddy 自签证书，浏览器会提示"不安全"，点"继续访问"即可用；手机上每次都要点一次，
  属于临时方案）：

  ```
  :443 {
      tls internal
      reverse_proxy 127.0.0.1:10000
  }
  ```

- 注意 `http://IP` 直连（不加 s）是**不能用**的——屏幕共享/摄像头只在 HTTPS 下开放。

## 常见坑

- **Caddy 起不来 / 证书签不下来**：九成是 80/443 没在安全组放行，或域名 A 记录
  还没生效（解析生效要几分钟到几小时，可用 `ping 你的域名` 验证）。
- **coturn 连不上**：`external-ip` 忘了填公网 IP，或 3478/UDP 转发段没放行。
- **改了 web/.env 没效果**：VITE_ 开头的变量是前端构建时注入的，必须
  `npm run build` + `pm2 restart yiqikan`。
- **内存告警**：2G 机器同时跑 Node + coturn + Caddy 总占用 300MB 上下，很宽裕；
  若以后变慢先 `free -h` 看一眼，通常是别的东西占的。
