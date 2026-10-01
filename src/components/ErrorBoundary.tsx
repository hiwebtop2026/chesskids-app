/**
 * ChessKids - React 错误边界
 * 防止单个模块崩溃导致整个应用白屏
 */

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Module crashed:', error, errorInfo);
  }

  handleReset = () => {
    // 资源加载类错误（动态 chunk 404/加载失败）——重渲染无法解决，直接整页刷新拉取最新资源
    const msg = this.state.error?.message || '';
    if (/dynamic|chunk|loading|fetch|import/i.test(msg)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '未知错误';
      const isResourceError = /dynamic|chunk|loading|fetch|import/i.test(msg);
      return (
        <div className="module error-boundary-fallback">
          <div className="module-header">
            <h2>😵 出错了</h2>
            <p>{isResourceError ? '资源加载失败（可能是网络波动或版本更新），将自动刷新加载最新版本' : '这个模块遇到了问题，请尝试刷新或切换到其他功能'}</p>
          </div>
          <div className="error-detail">
            <p className="error-message">{msg}</p>
            <button className="control-btn reset-btn" onClick={this.handleReset}>
              {isResourceError ? '🔄 刷新重试' : '🔄 重试'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
