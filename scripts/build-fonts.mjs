#!/usr/bin/env node
/**
 * 字体自托管构建：从 Google Fonts 拉取 TTF，按 UI 实际字符子集化成 woff2 存入仓库。
 * 背景：fonts.googleapis.com 在国内不可达，CDN 引用会让衬线标题永远回退宋体。
 * 运行：node scripts/build-fonts.mjs（仅在改了界面文案需要新字符时重跑）
 *
 * 子集策略：
 * - 衬线（展示字体）只用于固定文案（标题/品牌/小节名），按需取字，体积最小；
 *   动态内容（昵称/聊天）由系统字体承接，不进子集。
 * - 正文干脆用系统字体栈（PingFang/雅黑原生足够好），不再 webfont。
 * - DM Mono 是纯拉丁小字体，按 ASCII 全量子集。
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web/src/assets/fonts');
fs.mkdirSync(OUT, { recursive: true });

// 衬线字体的全部固定文案（改了界面大字请同步更新这里的字符）
const SERIF_TEXT = [
  '今晚的电影，留给两个人。',
  '一起看',
  '进入放映室',
  '聊天',
  // 序号/标点/字母数字兜底
  '0123456789',
  'AaBbCcDdEeFfGgHhIiJjKkLlMnNoOpPqQrRsStTuUvVwWxXyYzZ',
  '，。：·—、！？（）',
].join('');

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
  await build('Noto+Serif+SC', '700', SERIF_TEXT, 'serif-700.woff2');
  await build('Noto+Serif+SC', '900', SERIF_TEXT, 'serif-900.woff2');
  await build('DM+Mono', '400', MONO_TEXT, 'mono-400.woff2');
  await build('DM+Mono', '500', MONO_TEXT, 'mono-500.woff2');
  console.log('完成 → web/src/assets/fonts/');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
