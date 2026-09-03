#!/usr/bin/env node
/**
 * github.com:443 被墙时的替代推送：经 api.github.com（可通）复刻本地 HEAD 到远程 main。
 * 用法：npm run push
 * 原理：本地提交 → 对比远程已有 blob（SHA 相同的复用）→ 建 tree → 建提交（父提交锚定远程 main 当前 HEAD）→ 移动 ref。
 * 结果：远程拿到与本地完全一致的文件树（新提交 SHA 由远程历史决定，与本地不同属正常）。
 * 注意：本地 git status 可能显示"领先 origin/main"——树一致即已推送成功，可用 `npm run push:status` 核对。
 */
import https from 'node:https';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'lipeh1/yiqikan';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
}

function req(method, apiPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'yiqikan-push',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode >= 300) {
            reject(new Error(`${method} ${apiPath} -> ${res.statusCode} ${buf.slice(0, 300)}`));
          } else {
            resolve(buf ? JSON.parse(buf) : {});
          }
        });
      },
    );
    r.on('error', reject);
    r.setTimeout(60000, () => r.destroy(new Error('timeout ' + apiPath)));
    if (data) r.write(data);
    r.end();
  });
}

function gitToken() {
  // 从凭据管理器取 GitHub 令牌（不回显、不落盘）。
  // 用 execFileSync 直接喂 stdin：execSync 在 Windows 走 cmd.exe，管道语法不可用
  const out = execFileSync(
    'git',
    ['credential', 'fill'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: 'protocol=https\nhost=github.com\n\n',
      env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
    },
  ).toString();
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('拿不到 GitHub 凭据：先任意方式 git push 一次让凭据管理器存住令牌');
  return m[1].trim();
}

async function main() {
  const mode = process.argv[2] ?? 'push';
  const token = gitToken();

  const remoteHead = await req('GET', `/repos/${REPO}/commits/main`, null, token);
  console.log('远程 main =', remoteHead.sha.slice(0, 10));

  if (mode === 'status') {
    const runs = await req('GET', `/repos/${REPO}/actions/runs?per_page=1`, null, token);
    const r = runs.workflow_runs[0];
    console.log(
      '最近 CI：',
      r ? `${r.head_sha.slice(0, 7)} ${r.status}${r.conclusion ? ' / ' + r.conclusion : ''}` : '无运行记录',
    );
    // 树级比对：SHA 全一致即内容已同步
    const remoteTree = await req('GET', `/repos/${REPO}/git/trees/main?recursive=1`, null, token);
    const remoteMap = new Map(remoteTree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
    const localLines = sh('git ls-tree -r HEAD').trim().split('\n');
    const diff = [];
    for (const line of localLines) {
      const m = line.match(/^\d+\s+\w+\s+([0-9a-f]+)\t(.+)$/);
      if (m && remoteMap.get(m[2]) !== m[1]) diff.push(m[2]);
    }
    const remoteOnly = [...remoteMap.keys()].filter((p) => !localLines.some((l) => l.endsWith('\t' + p)));
    if (!diff.length && !remoteOnly.length) {
      console.log('本地 HEAD 与远程 main 文件树完全一致 ✅（本地显示的“领先”提交只是历史形状不同）');
    } else {
      console.log('待推送差异：', diff.concat(remoteOnly).join(', '));
    }
    return;
  }

  // —— push 模式 ——
  const remoteTree = await req('GET', `/repos/${REPO}/git/trees/main?recursive=1`, null, token);
  const known = new Set(remoteTree.tree.filter((e) => e.type === 'blob').map((e) => e.sha));

  const lines = sh('git ls-tree -r HEAD').trim().split('\n');
  const tree = [];
  let reused = 0;
  for (const line of lines) {
    const m = line.match(/^\d+\s+\w+\s+([0-9a-f]+)\t(.+)$/);
    if (!m) continue;
    let sha = m[1];
    if (!known.has(sha)) {
      const content = fs.readFileSync(path.join(ROOT, m[2])).toString('base64');
      const b = await req('POST', `/repos/${REPO}/git/blobs`, { content, encoding: 'base64' }, token);
      sha = b.sha;
      console.log('blob  +', m[2], '->', sha.slice(0, 10));
    } else {
      reused++;
    }
    tree.push({ path: m[2], mode: '100644', type: 'blob', sha });
  }
  console.log(`文件 ${tree.length} 个（复用 ${reused}）`);

  const t = await req('POST', `/repos/${REPO}/git/trees`, { tree }, token);
  const [an, ae, ad, cn, ce, cd] = sh('git log -1 --format=%an%n%ae%n%aI%n%cn%n%ce%n%cI').trim().split('\n');
  const message = sh('git log -1 --format=%B').replace(/\n+$/, '') + '\n';
  const c = await req(
    'POST',
    `/repos/${REPO}/git/commits`,
    {
      message,
      tree: t.sha,
      parents: [remoteHead.sha],
      author: { name: an, email: ae, date: ad },
      committer: { name: cn, email: ce, date: cd },
    },
    token,
  );
  await req('PATCH', `/repos/${REPO}/git/refs/heads/main`, { sha: c.sha }, token);
  console.log('已推送 ✅ 远程 main ->', c.sha);
  console.log('CI 会自动跑这轮提交，稍后可用 `npm run push:status` 查看');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
