import React from 'react';

/**
 * 掼蛋大小王牌面图案（经典小丑形象）
 * - 大王（big=true）：红色丑角帽 + 金色铃铛 + 红脸 + 咧嘴笑（红 JOKER）
 * - 小王（big=false）：灰黑丑角帽 + 银铃 + 灰脸 + 微笑（黑 JOKER）
 * 参考经典斗地主 JOKER 牌面：小丑头像 + 四角 JOKER 字样
 */
export function GuandanJoker({ big }: { big: boolean }): React.JSX.Element {
  const main = big ? '#e53935' : '#5a5a5a';
  const dark = big ? '#b71c1c' : '#333333';
  const bell = big ? '#ffd54f' : '#e0e0e0';
  const face = big ? '#ffcdd2' : '#eeeeee';
  const blush = big ? 'rgba(198,40,40,.35)' : 'rgba(120,120,120,.30)';
  const smile = big ? '#8e0000' : '#424242';
  return (
    <svg viewBox="0 0 120 130" width="46" height="50" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}>
      {/* 丑角三尖帽 */}
      <path d="M60 4 L26 52 L94 52 Z" fill={main} opacity="0.9" />
      <path d="M60 4 L60 52" stroke={dark} strokeWidth="2" opacity="0.5" />
      {/* 帽尖铃 */}
      <circle cx="60" cy="8" r="6" fill={bell} stroke={dark} strokeWidth="1.5" />
      <circle cx="60" cy="8" r="2" fill={dark} />
      {/* 帽檐两侧铃 */}
      <circle cx="30" cy="50" r="4" fill={bell} stroke={dark} strokeWidth="1.5" />
      <circle cx="90" cy="50" r="4" fill={bell} stroke={dark} strokeWidth="1.5" />
      {/* 帽檐 */}
      <rect x="20" y="50" width="80" height="8" rx="4" fill={dark} />
      {/* 脸 */}
      <circle cx="60" cy="82" r="26" fill={face} stroke={dark} strokeWidth="2" />
      {/* 眼睛 */}
      <circle cx="49" cy="78" r="3.5" fill={dark} />
      <circle cx="71" cy="78" r="3.5" fill={dark} />
      <circle cx="50.5" cy="76.5" r="1.2" fill="#fff" />
      <circle cx="72.5" cy="76.5" r="1.2" fill="#fff" />
      {/* 微笑（大王咧嘴 / 小王微笑） */}
      <path d={big ? 'M42 92 Q60 104 78 92' : 'M44 90 Q60 97 76 90'} stroke={smile} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 腮红 */}
      <circle cx="40" cy="90" r="5" fill={blush} />
      <circle cx="80" cy="90" r="5" fill={blush} />
      {/* 领结 */}
      <path d="M60 112 L42 103 L42 121 Z M60 112 L78 103 L78 121 Z" fill={main} stroke={dark} strokeWidth="1.5" />
      <circle cx="60" cy="112" r="4" fill={bell} />
    </svg>
  );
}
