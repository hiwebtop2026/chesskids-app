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
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="module error-boundary-fallback">
          <div className="module-header">
            <h2>😵 出错了</h2>
            <p>这个模块遇到了问题，请尝试刷新或切换到其他功能</p>
          </div>
          <div className="error-detail">
            <p className="error-message">{this.state.error?.message || '未知错误'}</p>
            <button className="control-btn reset-btn" onClick={this.handleReset}>
              🔄 重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
