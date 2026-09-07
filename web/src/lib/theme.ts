// 主题模式：跟随 TDesign 的 theme-mode 属性约定（html[theme-mode='dark']），
// 自研 CSS 与 tdesign 组件由此同步换肤。默认跟随系统，手动切换后记住选择。
export type ThemeMode = 'light' | 'dark';

const KEY = 'yiqikan-theme';

export function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.setAttribute('theme-mode', mode);
  // 移动端浏览器外壳颜色同步
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#181818' : '#eeeeee');
  // 首次应用主题前不开颜色过渡（CSS 里的 theme-ready 门控），避免首屏从浅色淡入闪变
  if (!root.classList.contains('theme-ready')) {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('theme-ready')));
  }
}

export function persistTheme(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
}
