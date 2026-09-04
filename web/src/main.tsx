import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// TDesign 组件库样式（tooltip/dropdown 等通用控件），必须先于自定义样式引入
import 'tdesign-react/es/style/index.css';
import App from './App';
import './index.css';
import { applyTheme, getInitialTheme } from './lib/theme';

// 首帧前定主题，避免浅色闪一下再变暗
applyTheme(getInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
