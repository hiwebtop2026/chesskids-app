/**
 * 微信内置浏览器引导页
 * 检测到在微信中打开联机对战链接时，引导用户在系统默认浏览器中打开
 */

import React, { useState } from 'react';
import { isIOS, isAndroid, copyLinkForBrowserOpen } from '../utils/wechat';

export interface WeChatGuideProps {
  roomCode: string;
  gameType: 'chess' | 'xiangqi';
  onClose?: () => void;
}

export const WeChatGuide: React.FC<WeChatGuideProps> = ({ roomCode, gameType, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [copiedRoom, setCopiedRoom] = useState(false);

  const displayRoom = roomCode.replace(/^[CX]-/, '');
  const gameName = gameType === 'chess' ? '国际象棋' : '中国象棋';
  const link = copyLinkForBrowserOpen();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(displayRoom);
      setCopiedRoom(true);
      setTimeout(() => setCopiedRoom(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = displayRoom;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedRoom(true);
      setTimeout(() => setCopiedRoom(false), 2000);
    }
  };

  return (
    <div className="wechat-guide-overlay">
      <div className="wechat-guide-card">
        <div className="wechat-guide-icon">
          {isIOS() ? '🍎' : '🤖'}
        </div>
        <h2 className="wechat-guide-title">请在浏览器中打开</h2>
        <p className="wechat-guide-desc">
          微信内置浏览器不支持联机对战功能<br />
          请按以下步骤在浏览器中打开，即可开始 {gameName} 对弈
        </p>

        <div className="wechat-guide-steps">
          {isIOS() ? (
            <>
              <div className="guide-step">
                <span className="step-num">1</span>
                <span className="step-text">点击右上角 <strong>···</strong> 按钮</span>
              </div>
              <div className="guide-step">
                <span className="step-num">2</span>
                <span className="step-text">选择「<strong>在浏览器中打开</strong>」</span>
              </div>
              <div className="guide-step">
                <span className="step-num">3</span>
                <span className="step-text">在浏览器中自动加入房间</span>
              </div>
            </>
          ) : isAndroid() ? (
            <>
              <div className="guide-step">
                <span className="step-num">1</span>
                <span className="step-text">点击右上角 <strong>···</strong> 按钮</span>
              </div>
              <div className="guide-step">
                <span className="step-num">2</span>
                <span className="step-text">选择「<strong>在浏览器打开</strong>」</span>
              </div>
              <div className="guide-step">
                <span className="step-num">3</span>
                <span className="step-text">在浏览器中自动加入房间</span>
              </div>
            </>
          ) : (
            <>
              <div className="guide-step">
                <span className="step-num">1</span>
                <span className="step-text">复制下方链接</span>
              </div>
              <div className="guide-step">
                <span className="step-num">2</span>
                <span className="step-text">在手机浏览器中粘贴打开</span>
              </div>
              <div className="guide-step">
                <span className="step-num">3</span>
                <span className="step-text">自动加入 {gameName} 房间</span>
              </div>
            </>
          )}
        </div>

        <div className="wechat-guide-info">
          <div className="info-row">
            <span className="info-label">🎯 房间号</span>
            <div className="info-value-group">
              <span className="room-code-big">{displayRoom}</span>
              <button className="mini-copy-btn" onClick={copyRoomCode}>
                {copiedRoom ? '已复制' : '复制'}
              </button>
            </div>
          </div>
          <div className="info-row">
            <span className="info-label">🔗 链接</span>
            <div className="info-value-group">
              <span className="link-text">{link.length > 40 ? link.slice(0, 40) + '...' : link}</span>
              <button className="mini-copy-btn" onClick={copyLink}>
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>
        </div>

        <p className="wechat-guide-tip">
          💡 小提示：也可以直接告诉好友 6 位房间号，在游戏内手动输入加入
        </p>

        {onClose && (
          <button className="wechat-guide-close" onClick={onClose}>
            我知道了
          </button>
        )}
      </div>
    </div>
  );
};
