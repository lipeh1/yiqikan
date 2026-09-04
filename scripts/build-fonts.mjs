#!/usr/bin/env node
/**
 * 字体自托管构建：从 Google Fonts 拉取 TTF，按 UI 实际字符子集化成 woff2 存入仓库。
 * 背景：fonts.googleapis.com 在国内不可达，CDN 引用会让衬线标题永远回退宋体。
 * 运行：node scripts/build-fonts.mjs（仅在改了界面文案需要新字符时重跑）
 *
 * 子集策略：
 * - 展示层已改无衬线工具风（腾讯会议/TDesign 方向），不再子集衬线；
 *   只保留 DM Mono 给房间码/时间戳/状态标签，按 ASCII 全量子集。
 * - 动态内容（昵称/聊天）与正文由系统字体栈承接，不进子集。
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web/src/assets/fonts');
fs.mkdirSync(OUT, { recursive: true });

const MONO_TEXT = [
  ' !"#$%&\'()*+,-./0123456789:;<=>?@',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '[\\]^_`',
  'abcdefghijklmnopqrstuvwxyz',
  '{|}~·—→',
].join('');

function get(url, binary = false) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'curl/7.64' } }, (res) => {
        if (res.statusCode >= 300 && res.headers.location) return resolve(get(res.headers.location, binary));
        if (res.statusCode >= 300) return reject(new Error(`${res.statusCode} ${url}`));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

// 旧版 UA 会让 Google Fonts 返回 TTF 直链（woff2 需现代 UA）
async function fontUrls(cssUrl) {
  const css = (await get(cssUrl)).toString();
  return [...css.matchAll(/url\((https:[^)]+\.ttf)\)/g)].map((m) => m[1]);
}

async function build(family, weight, text, outName) {
  const urls = await fontUrls(
    `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`,
  );
  if (!urls.length) throw new Error(`${family} ${weight} 没拿到 TTF 直链`);
  const ttf = await get(urls[0]);
  const woff2 = await subsetFont(ttf, text, { targetFormat: 'woff2' });
  const file = path.join(OUT, outName);
  fs.writeFileSync(file, woff2);
  console.log(`${outName}: ${(woff2.length / 1024).toFixed(1)} KB`);
}

(async () => {
  await build('DM+Mono', '400', MONO_TEXT, 'mono-400.woff2');
  await build('DM+Mono', '500', MONO_TEXT, 'mono-500.woff2');
  console.log('完成 → web/src/assets/fonts/');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
