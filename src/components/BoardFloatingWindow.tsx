/**
 * ChessKids - 可拖拽浮动棋盘窗口（参考腾讯棋牌对局窗口设计）
 * - 桌面端：独立悬浮窗口，标题栏拖拽移动，右下角可缩放（CSS resize），右上角提供浏览器全屏
 * - 移动端 / 横屏窄窗口：自动铺满视口（脱离浏览器窗口限制的沉浸体验）
 * - 与外部页面布局完全解耦（position: fixed），对局中可拖动窗口同时查看其他内容
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface BoardFloatingWindowProps {
  /** 窗口标题（显示在标题栏） */
  title: string;
  /** 关闭/还原回调（退出浮动窗口回到内嵌布局） */
  onClose: () => void;
  children: React.ReactNode;
}

export const BoardFloatingWindow: React.FC<BoardFloatingWindowProps> = ({
  title,
  onClose,
  children,
}) => {
  const winRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** 浏览器全屏被拒绝时的降级：铺满视口的"软件全屏"模式 */
  const [isMaximized, setIsMaximized] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  /** 初始位置：视口居中（不能用 CSS transform 居中，会与拖拽 left/top 冲突） */
  useEffect(() => {
    const el = winRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = Math.max(Math.round((window.innerWidth - w) / 2), 0) + 'px';
    el.style.top = Math.max(Math.round((window.innerHeight - h) / 2), 0) + 'px';
  }, []);

  /** 标题栏拖拽移动窗口（限制在视口内） */
  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active || !winRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = winRef.current.offsetWidth;
    const h = winRef.current.offsetHeight;
    const nx = Math.min(
      Math.max(dragRef.current.origX + (e.clientX - dragRef.current.startX), 0),
      Math.max(vw - w, 0),
    );
    const ny = Math.min(
      Math.max(dragRef.current.origY + (e.clientY - dragRef.current.startY), 0),
      Math.max(vh - h, 0),
    );
    winRef.current.style.left = nx + 'px';
    winRef.current.style.top = ny + 'px';
  }, []);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      const el = winRef.current;
      if (!el || !el.contains(e.target as Node)) return;
      // 铺满模式与按钮点击不触发拖拽
      if (isMaximized) return;
      if ((e.target as HTMLElement).closest('button')) return;
      const rect = el.getBoundingClientRect();
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: rect.left,
        origY: rect.top,
      };
      let captured = false;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        captured = true;
      } catch {
        // capture 不可用：退化为 window 级监听继续拖拽
      }
      if (!captured) {
        const pid = e.pointerId;
        const onWinMove = (ev: PointerEvent) => {
          if (ev.pointerId !== pid) return;
          onDragMove(ev as unknown as React.PointerEvent);
        };
        const cleanup = () => {
          dragRef.current.active = false;
          window.removeEventListener('pointermove', onWinMove);
          window.removeEventListener('pointerup', cleanup);
          window.removeEventListener('pointercancel', cleanup);
        };
        window.addEventListener('pointermove', onWinMove);
        window.addEventListener('pointerup', cleanup);
        window.addEventListener('pointercancel', cleanup);
      }
    },
    [onDragMove],
  );

  const onDragEnd = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  /** 浏览器全屏（脱离浏览器窗口限制）；权限被拒时降级为铺满视口的软件全屏 */
  const toggleFullscreen = useCallback(() => {
    const el = winRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (isMaximized) {
      setIsMaximized(false);
      return;
    }
    let p: Promise<void> | undefined;
    try {
      p = el.requestFullscreen();
    } catch {
      setIsMaximized(true);
      return;
    }
    if (p && typeof p.catch === 'function') {
      // 部分浏览器/WebView 下 fullscreen promise 可能永不 settle：加超时保护降级
      const guard = window.setTimeout(() => {
        if (!document.fullscreenElement) setIsMaximized(true);
      }, 500);
      p.then(() => window.clearTimeout(guard)).catch(() => {
        window.clearTimeout(guard);
        setIsMaximized(true);
      });
    } else {
      setIsMaximized(true);
    }
  }, [isMaximized]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const showMax = isFullscreen || isMaximized;
  return (
    <div className={`board-float-window${showMax ? ' board-float-max' : ''}`} ref={winRef}>
      <div
        className="board-float-titlebar"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="board-float-title">{title}</span>
        <div className="board-float-actions">
          <button
            className="board-float-btn"
            onClick={toggleFullscreen}
            title={showMax ? '退出全屏' : '浏览器全屏'}
            aria-label={showMax ? '退出全屏' : '浏览器全屏'}
          >
            {showMax ? '🗗' : '⛶'}
          </button>
          <button
            className="board-float-btn board-float-close"
            onClick={onClose}
            title="还原（退出浮动窗口）"
            aria-label="还原"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="board-float-body">{children}</div>
      <div className="board-float-resize" title="拖动右下角调整大小" />
    </div>
  );
};

export default BoardFloatingWindow;
