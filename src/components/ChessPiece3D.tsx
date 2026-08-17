/**
 * ChessKids - 3D 立体效果国际象棋棋子组件 v2
 *
 * 增强版：径向渐变球面、多层高光系统、环境光遮蔽、边缘光、更精细的形体路径
 */

import React, { useId } from 'react';

export interface ChessPiece3DProps {
  piece: string;
  size?: number;
}

const PIECE_NAMES: Record<string, string> = {
  K: '白方国王', Q: '白方皇后', R: '白方车', B: '白方象', N: '白方马', P: '白方兵',
  k: '黑方国王', q: '黑方皇后', r: '黑方车', b: '黑方象', n: '黑方马', p: '黑方兵',
};

interface PieceColors {
  bodyStops: { offset: string; color: string }[];
  radialCenter: string;
  radialMid: string;
  radialEdge: string;
  stroke: string;
  highlight: string;
  rimLight: string;
  detail: string;
  aoColor: string;
}

const WHITE_COLORS: PieceColors = {
  bodyStops: [
    { offset: '0%', color: '#FFFFFF' },
    { offset: '25%', color: '#F0F0F0' },
    { offset: '55%', color: '#D4D4D4' },
    { offset: '80%', color: '#B0B0B0' },
    { offset: '100%', color: '#909090' },
  ],
  radialCenter: '#FFFFFF',
  radialMid: '#E0E0E0',
  radialEdge: '#A8A8A8',
  stroke: '#7A7A7A',
  highlight: 'rgba(255,255,255,0.85)',
  rimLight: 'rgba(200,220,255,0.45)',
  detail: '#5A5A5A',
  aoColor: 'rgba(80,80,80,0.25)',
};

const BLACK_COLORS: PieceColors = {
  bodyStops: [
    { offset: '0%', color: '#5A5A5A' },
    { offset: '25%', color: '#404040' },
    { offset: '55%', color: '#2A2A2A' },
    { offset: '80%', color: '#1C1C1C' },
    { offset: '100%', color: '#0E0E0E' },
  ],
  radialCenter: '#5A5A5A',
  radialMid: '#333333',
  radialEdge: '#121212',
  stroke: '#060606',
  highlight: 'rgba(140,140,140,0.7)',
  rimLight: 'rgba(100,120,160,0.35)',
  detail: '#A0A0A0',
  aoColor: 'rgba(0,0,0,0.4)',
};

function renderPieceBody(
  type: string,
  c: PieceColors,
  mainFill: string,
  radialFill: string,
  highlightFill: string,
  rimFill: string,
  aoFill: string,
): React.ReactNode {
  switch (type) {
    case 'P': return (
      <React.Fragment>
        {/* 环境光遮蔽底 */}
        <ellipse cx="50" cy="93" rx="26" ry="5" fill={aoFill} />
        {/* 底座 */}
        <ellipse cx="50" cy="88" rx="28" ry="6" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="85" rx="25" ry="4.5" fill={mainFill} stroke={c.stroke} strokeWidth="1" />
        {/* 底座高光 */}
        <ellipse cx="50" cy="86" rx="20" ry="2.5" fill={highlightFill} opacity="0.4" />
        {/* 颈部 */}
        <path d="M35,84 Q38,72 36,66 Q34,60 38,56 L62,56 Q66,60 64,66 Q62,72 65,84 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 颈环 */}
        <ellipse cx="50" cy="56" rx="16" ry="3.5" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 颈环高光 */}
        <ellipse cx="50" cy="55" rx="12" ry="1.5" fill={highlightFill} opacity="0.5" />
        {/* 球形头部 */}
        <circle cx="50" cy="38" r="16" fill={radialFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 头部主高光 */}
        <ellipse cx="43" cy="31" rx="6" ry="5" fill={highlightFill} opacity="0.7" />
        {/* 头部镜面反射 */}
        <ellipse cx="41" cy="29" rx="2.5" ry="2" fill="#FFFFFF" opacity="0.85" />
        {/* 头部边缘光 */}
        <path d="M58,48 Q64,42 62,34" fill="none" stroke={rimFill} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </React.Fragment>
    );

    case 'R': return (
      <React.Fragment>
        <ellipse cx="50" cy="93" rx="28" ry="5" fill={aoFill} />
        {/* 底座 */}
        <ellipse cx="50" cy="88" rx="30" ry="6" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="85" rx="27" ry="4.5" fill={mainFill} stroke={c.stroke} strokeWidth="1" />
        <ellipse cx="50" cy="86" rx="22" ry="2.5" fill={highlightFill} opacity="0.35" />
        {/* 主体收腰 */}
        <path d="M36,84 Q34,70 38,52 L62,52 Q66,70 64,84 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 中部环 */}
        <ellipse cx="50" cy="52" rx="14" ry="3.5" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="51" rx="10" ry="1.5" fill={highlightFill} opacity="0.5" />
        {/* 城垛底座 */}
        <rect x="34" y="38" width="32" height="14" rx="2" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 城垛齿 */}
        <path d="M34,38 L34,28 L39,28 L39,22 L44,22 L44,28 L50,28 L50,22 L55,22 L55,28 L61,28 L61,22 L66,22 L66,28 L66,38 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" strokeLinejoin="round" />
        {/* 城垛高光 */}
        <rect x="36" y="39" width="5" height="11" fill={highlightFill} opacity="0.4" />
        <rect x="52" y="24" width="4" height="4" fill={highlightFill} opacity="0.3" />
        {/* 主体高光 */}
        <path d="M40,55 Q38,70 42,82 L46,82 Q43,70 44,55 Z" fill={highlightFill} opacity="0.3" />
        {/* 边缘光 */}
        <path d="M60,82 Q63,65 60,52" fill="none" stroke={rimFill} strokeWidth="1.5" opacity="0.5" />
      </React.Fragment>
    );

    case 'B': return (
      <React.Fragment>
        <ellipse cx="50" cy="93" rx="26" ry="5" fill={aoFill} />
        {/* 底座 */}
        <ellipse cx="50" cy="88" rx="27" ry="6" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="85" rx="24" ry="4.5" fill={mainFill} stroke={c.stroke} strokeWidth="1" />
        <ellipse cx="50" cy="86" rx="19" ry="2.5" fill={highlightFill} opacity="0.35" />
        {/* 主体 */}
        <path d="M36,84 Q34,66 38,50 L62,50 Q66,66 64,84 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 中部环 */}
        <ellipse cx="50" cy="50" rx="13" ry="3" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="49" rx="9" ry="1.2" fill={highlightFill} opacity="0.5" />
        {/* 帽身 */}
        <path d="M42,48 Q36,34 46,18 Q48,15 50,14 Q52,15 54,18 Q64,34 58,48 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 帽顶圆球 */}
        <circle cx="50" cy="10" r="4" fill={radialFill} stroke={c.stroke} strokeWidth="1" />
        <ellipse cx="49" cy="8" rx="1.5" ry="1" fill="#FFFFFF" opacity="0.8" />
        {/* 裂口 */}
        <path d="M50,20 L50,40" stroke={c.stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* 高光 */}
        <path d="M44,46 Q40,34 46,22 Q48,20 49,19" fill="none" stroke={highlightFill} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        <path d="M40,55 Q38,68 42,80 L46,80 Q43,68 44,55 Z" fill={highlightFill} opacity="0.25" />
        {/* 边缘光 */}
        <path d="M56,46 Q60,34 54,22" fill="none" stroke={rimFill} strokeWidth="1.5" opacity="0.5" />
      </React.Fragment>
    );

    case 'N': return (
      <React.Fragment>
        <ellipse cx="50" cy="93" rx="29" ry="5" fill={aoFill} />
        {/* 底座 */}
        <ellipse cx="50" cy="88" rx="30" ry="6" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="85" rx="27" ry="4.5" fill={mainFill} stroke={c.stroke} strokeWidth="1" />
        <ellipse cx="50" cy="86" rx="22" ry="2.5" fill={highlightFill} opacity="0.35" />
        {/* 底座环 */}
        <ellipse cx="50" cy="82" rx="24" ry="3" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 马头主体 */}
        <path d="M72,82 L72,54 C72,38 64,24 48,16 C42,12 36,10 30,6 C27,9 26,14 28,20 C30,26 35,30 40,32 C32,32 25,40 22,50 C19,60 24,66 30,68 L38,62 C41,57 45,56 49,58 C56,62 60,70 60,82 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" strokeLinejoin="round" />
        {/* 马鬃毛 */}
        <path d="M48,16 C56,20 62,28 66,40 C68,48 69,56 69,62" fill="none" stroke={c.stroke} strokeWidth="1" opacity="0.5" />
        <path d="M52,18 C58,24 62,32 64,42" fill="none" stroke={c.stroke} strokeWidth="0.8" opacity="0.4" />
        {/* 眼睛 */}
        <circle cx="40" cy="30" r="2.5" fill={c.detail} />
        <circle cx="39" cy="29" r="1" fill="#FFFFFF" opacity="0.6" />
        {/* 鼻孔 */}
        <ellipse cx="29" cy="20" rx="1.5" ry="1" fill={c.detail} />
        {/* 嘴部线条 */}
        <path d="M28,24 Q32,28 38,30" fill="none" stroke={c.stroke} strokeWidth="0.8" opacity="0.5" />
        {/* 面部高光 */}
        <path d="M44,12 C48,14 52,18 55,24 L52,28 C49,22 46,18 42,15 Z" fill={highlightFill} opacity="0.45" />
        {/* 颈部高光 */}
        <path d="M62,45 Q66,55 65,68 L61,68 Q62,55 59,48 Z" fill={highlightFill} opacity="0.25" />
        {/* 边缘光 */}
        <path d="M68,78 Q72,60 70,46" fill="none" stroke={rimFill} strokeWidth="2" opacity="0.5" />
      </React.Fragment>
    );

    case 'Q': return (
      <React.Fragment>
        <ellipse cx="50" cy="93" rx="28" ry="5" fill={aoFill} />
        {/* 底座 */}
        <ellipse cx="50" cy="88" rx="30" ry="6" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="85" rx="27" ry="4.5" fill={mainFill} stroke={c.stroke} strokeWidth="1" />
        <ellipse cx="50" cy="86" rx="22" ry="2.5" fill={highlightFill} opacity="0.35" />
        {/* 主体 */}
        <path d="M35,84 Q33,62 37,44 L63,44 Q67,62 65,84 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 中部环 */}
        <ellipse cx="50" cy="44" rx="15" ry="3.5" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="43" rx="11" ry="1.5" fill={highlightFill} opacity="0.5" />
        {/* 皇冠底座 */}
        <path d="M36,42 L36,30 L64,30 L64,42 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 皇冠尖（五尖） */}
        <path d="M36,30 L30,14 L38,24 L42,10 L46,22 L50,6 L54,22 L58,10 L62,24 L70,14 L64,30 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" strokeLinejoin="round" />
        {/* 尖顶圆球 */}
        <circle cx="30" cy="14" r="3.5" fill={radialFill} stroke={c.stroke} strokeWidth="1" />
        <circle cx="42" cy="10" r="3.5" fill={radialFill} stroke={c.stroke} strokeWidth="1" />
        <circle cx="50" cy="6" r="4" fill={radialFill} stroke={c.stroke} strokeWidth="1" />
        <circle cx="58" cy="10" r="3.5" fill={radialFill} stroke={c.stroke} strokeWidth="1" />
        <circle cx="70" cy="14" r="3.5" fill={radialFill} stroke={c.stroke} strokeWidth="1" />
        {/* 圆球高光 */}
        <circle cx="29" cy="13" r="1.2" fill="#FFFFFF" opacity="0.8" />
        <circle cx="49" cy="5" r="1.5" fill="#FFFFFF" opacity="0.85" />
        <circle cx="69" cy="13" r="1.2" fill="#FFFFFF" opacity="0.8" />
        {/* 皇冠高光 */}
        <path d="M38,28 L42,28 L40,14 Z" fill={highlightFill} opacity="0.3" />
        {/* 主体高光 */}
        <path d="M40,48 Q38,62 42,80 L46,80 Q43,62 44,48 Z" fill={highlightFill} opacity="0.25" />
        {/* 边缘光 */}
        <path d="M60,80 Q63,62 60,46" fill="none" stroke={rimFill} strokeWidth="1.5" opacity="0.5" />
      </React.Fragment>
    );

    case 'K': return (
      <React.Fragment>
        <ellipse cx="50" cy="93" rx="28" ry="5" fill={aoFill} />
        {/* 底座 */}
        <ellipse cx="50" cy="88" rx="30" ry="6" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="85" rx="27" ry="4.5" fill={mainFill} stroke={c.stroke} strokeWidth="1" />
        <ellipse cx="50" cy="86" rx="22" ry="2.5" fill={highlightFill} opacity="0.35" />
        {/* 主体 */}
        <path d="M34,84 Q32,62 36,48 L64,48 Q68,62 66,84 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 中部环 */}
        <ellipse cx="50" cy="48" rx="16" ry="3.5" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        <ellipse cx="50" cy="47" rx="12" ry="1.5" fill={highlightFill} opacity="0.5" />
        {/* 王冠底座 */}
        <path d="M36,46 L36,34 L64,34 L64,46 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 王冠装饰带 */}
        <rect x="36" y="38" width="28" height="4" fill={highlightFill} opacity="0.25" />
        <circle cx="42" cy="40" r="1.5" fill={c.detail} opacity="0.6" />
        <circle cx="50" cy="40" r="1.5" fill={c.detail} opacity="0.6" />
        <circle cx="58" cy="40" r="1.5" fill={c.detail} opacity="0.6" />
        {/* 球形顶部 */}
        <circle cx="50" cy="28" r="12" fill={radialFill} stroke={c.stroke} strokeWidth="1.2" />
        {/* 十字架 */}
        <path d="M46,4 L54,4 L54,12 L62,12 L62,18 L54,18 L54,26 L46,26 L46,18 L38,18 L38,12 L46,12 Z" fill={mainFill} stroke={c.stroke} strokeWidth="1.2" strokeLinejoin="round" />
        {/* 十字架高光 */}
        <rect x="47" y="5" width="2" height="20" fill={highlightFill} opacity="0.5" />
        {/* 球形高光 */}
        <ellipse cx="45" cy="24" rx="4" ry="3.5" fill={highlightFill} opacity="0.6" />
        <ellipse cx="44" cy="23" rx="1.5" ry="1.2" fill="#FFFFFF" opacity="0.9" />
        {/* 球形边缘光 */}
        <path d="M58,32 Q62,28 60,22" fill="none" stroke={rimFill} strokeWidth="2" opacity="0.5" />
        {/* 主体高光 */}
        <path d="M38,52 Q36,65 40,80 L44,80 Q41,65 42,52 Z" fill={highlightFill} opacity="0.25" />
        {/* 边缘光 */}
        <path d="M62,80 Q65,62 62,50" fill="none" stroke={rimFill} strokeWidth="1.5" opacity="0.5" />
      </React.Fragment>
    );

    default:
      return null;
  }
}

export const ChessPiece3D: React.FC<ChessPiece3DProps> = ({ piece, size = 48 }) => {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '');

  const isWhite = /^[A-Z]$/.test(piece);
  const type = piece.toUpperCase();
  const c = isWhite ? WHITE_COLORS : BLACK_COLORS;

  const mainId = `cp3d-body-${uid}`;
  const radialId = `cp3d-radial-${uid}`;
  const highlightId = `cp3d-hl-${uid}`;
  const rimId = `cp3d-rim-${uid}`;
  const aoId = `cp3d-ao-${uid}`;
  const shadowId = `cp3d-shadow-${uid}`;
  const shadow2Id = `cp3d-shadow2-${uid}`;

  const mainFill = `url(#${mainId})`;
  const radialFill = `url(#${radialId})`;
  const highlightFill = `url(#${highlightId})`;
  const rimFill = `url(#${rimId})`;
  const aoFill = `url(#${aoId})`;

  const body = renderPieceBody(type, c, mainFill, radialFill, highlightFill, rimFill, aoFill);

  if (body === null) return null;

  const ariaLabel = PIECE_NAMES[piece] ?? `棋子 ${piece}`;

  return (
    <svg
      className="chess-piece-3d"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        {/* 主体纵向渐变（5 色标，更精细的体积感） */}
        <linearGradient id={mainId} x1="0.3" y1="0" x2="0.7" y2="1">
          {c.bodyStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>

        {/* 球面径向渐变（模拟 3D 球体光照） */}
        <radialGradient id={radialId} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stopColor={c.radialCenter} />
          <stop offset="45%" stopColor={c.radialMid} />
          <stop offset="100%" stopColor={c.radialEdge} />
        </radialGradient>

        {/* 高光渐变（左上方白色反射） */}
        <linearGradient id={highlightId} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={c.highlight} />
          <stop offset="100%" stopColor={c.highlight} stopOpacity="0" />
        </linearGradient>

        {/* 边缘光渐变（右下方冷色调反射） */}
        <linearGradient id={rimId} x1="1" y1="0.5" x2="0.6" y2="1">
          <stop offset="0%" stopColor={c.rimLight} />
          <stop offset="100%" stopColor={c.rimLight} stopOpacity="0" />
        </linearGradient>

        {/* 环境光遮蔽渐变 */}
        <radialGradient id={aoId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={c.aoColor} />
          <stop offset="70%" stopColor={c.aoColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c.aoColor} stopOpacity="0" />
        </radialGradient>

        {/* 近距柔和投影 */}
        <filter id={shadowId} x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.3" />
        </filter>

        {/* 远距大范围投影 */}
        <filter id={shadow2Id} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* 地面投影 */}
      <ellipse cx="50" cy="94" rx="32" ry="6" fill="#000000" opacity="0.15" />

      {/* 棋子主体 */}
      <g filter={`url(#${shadowId})`}>
        <g filter={`url(#${shadow2Id})`}>{body}</g>
      </g>
    </svg>
  );
};

export default ChessPiece3D;
