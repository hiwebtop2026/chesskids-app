/**
 * ChessKids - 应用入口
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

/**
 * 全局错误兜底：捕获未被 ErrorBoundary 覆盖的运行时异常与 Promise 拒绝
 * （事件回调、异步任务、WebSocket/WebGL 回调中的错误），避免静默崩溃/白屏，
 * 并提供可见提示与一键刷新恢复。
 */
function setupGlobalErrorHandlers() {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const showFatalHint = (label: string, detail: unknown) => {
    console.error(`[Global] ${label}:`, detail);
    try {
      let el = document.getElementById('global-error-hint');
      if (!el) {
        el = document.createElement('div');
        el.id = 'global-error-hint';
        el.style.cssText =
          'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;' +
          'background:rgba(35,35,35,.94);color:#fff;padding:10px 16px;border-radius:10px;' +
          'font-size:13px;max-width:86vw;box-shadow:0 4px 20px rgba(0,0,0,.35);' +
          'font-family:system-ui,sans-serif;display:flex;align-items:center;gap:10px;';
        const msg = document.createElement('span');
        msg.className = 'global-error-msg';
        const btn = document.createElement('button');
        btn.textContent = '刷新恢复';
        btn.style.cssText =
          'flex-shrink:0;background:#ff7043;color:#fff;border:none;border-radius:6px;' +
          'padding:5px 12px;font-size:12px;cursor:pointer;';
        btn.onclick = () => window.location.reload();
        el.appendChild(msg);
        el.appendChild(btn);
        document.body.appendChild(el);
      }
      const msg = el.querySelector('.global-error-msg');
      if (msg) {
        const e = detail as any;
        const text = `${label}：${e?.message || e?.name || '未知错误'}`;
        msg.textContent = text.length > 60 ? text.slice(0, 60) + '…' : text;
      }
      el.style.display = 'flex';
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        el.style.display = 'none';
      }, 6000);
    } catch {
      // 提示本身失败不影响主流程
    }
  };

  // 仅处理 JS 运行时错误（资源加载错误不致命，忽略）
  window.addEventListener('error', (e) => {
    if (!e.error) return;
    showFatalHint('页面出现异常', e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    showFatalHint('异步任务异常', e.reason);
  });
}

setupGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
