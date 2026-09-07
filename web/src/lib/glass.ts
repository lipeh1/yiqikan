// hyalite（web/public/hyalite.js，经典脚本挂 window.Hyalite）的极简封装。
// 只在 Chromium 生效（真折射）；其余浏览器由 CSS 里 var(--hyalite, blur(...)) 的
// 兜底磨砂接管，JS 不做任何事。用法见 https://github.com/VII-Cae/hyalite--liquid-glass

interface HyaliteWatch {
  stop(): void;
}

interface HyaliteApi {
  watch(root: Element, selector: string, opts?: Record<string, unknown>): HyaliteWatch;
  supported(): boolean;
}

declare global {
  interface Window {
    Hyalite?: HyaliteApi;
  }
}

/**
 * 挂上全页 .glass 元素的液态玻璃。返回清理函数供 effect 卸载用。
 * 参数面向「浮在视频上的面板」：中心磨砂给足（文本可读），色散关掉
 * （背面是逐帧重滤的视频，省两次位移合成），materialize 让玻璃以
 * 「弯光渐强」而非淡入的方式出现。
 */
export function initGlass(): () => void {
  const hyalite = window.Hyalite;
  if (!hyalite?.supported()) return () => {};
  const watcher = hyalite.watch(document.body, '.glass', {
    bevel: 12,
    thickness: 9,
    blur: 8,
    dispersion: 0,
    rim: 0.4,
    materialize: 240,
  });
  return () => watcher.stop();
}
