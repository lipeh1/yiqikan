import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// TDesign 组件库样式（tooltip/dropdown 等通用控件），必须先于自定义样式引入
import 'tdesign-react/es/style/index.css';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
