/**
 * ChessKids - 围棋规则学习模块
 * 章节式学习：落子/气/提子/打劫/胜负/术语 + 9 路交互演示棋盘
 */
import React, { useState } from 'react';
import { GoBoard } from '../components/GoBoard';
import { createGoBoard, goPlaceStone, cloneGoBoard, type GoBoard as GoBoardT, type GoColor } from '../engine/go';

interface Demo {
  key: string;
  title: string;
  text: string;
  board: GoBoardT;
  hint: string;
}

const DEMOS: Demo[] = [
  {
    key: 'place',
    title: '落子与气',
    text: '围棋在交叉点上落子。每个棋子有上下左右四个相邻交叉点，称为"气"。气的多少决定棋子的死活。',
    board: (() => {
      const b = createGoBoard(9);
      b[3][3] = 'b';
      b[3][4] = 'b';
      b[4][3] = 'b';
      return b;
    })(),
    hint: '示例：三颗黑子连在一起，共享气，比单子更难被吃掉。',
  },
  {
    key: 'capture',
    title: '提子（吃子）',
    text: '当一个棋子的气全部被堵住（无气），它就被提走。包围对方棋子并堵住最后一气即可吃子。',
    board: (() => {
      const b = createGoBoard(9);
      // 黑子被白子包围，只剩一口气
      b[4][4] = 'b';
      b[3][4] = 'w'; b[5][4] = 'w'; b[4][3] = 'w'; b[4][5] = 'w';
      return b;
    })(),
    hint: '示例：中央黑子只剩一口气，白方落在 (4,5) 右侧一口即可提走它。',
  },
  {
    key: 'ko',
    title: '打劫',
    text: '如果双方都能互相提掉一个子，且局面会无限循环，规则禁止立即回提。必须隔一手才能提回，这就是打劫。',
    board: (() => {
      const b = createGoBoard(9);
      b[3][3] = 'b'; b[3][4] = 'b'; b[3][5] = 'w';
      b[4][3] = 'w'; b[4][5] = 'b';
      b[5][3] = 'w'; b[5][4] = 'w';
      b[4][4] = 'b'; // 黑提白（简单劫）
      return b;
    })(),
    hint: '示例：右上角形成一个简单劫争，白方不能立即回提黑子，需先在其他地方落子。',
  },
  {
    key: 'score',
    title: '胜负判定',
    text: '对局结束后，双方连续 Pass 则结束。采用中国数子法：黑贴 3¾ 子（约 7.5 目），黑子+领地 ≥ 185 胜，否则白胜。',
    board: createGoBoard(9),
    hint: '记住：占领的地盘（围住的空点）+ 活子数，谁多谁赢。',
  },
];

const TERMS = [
  { t: '气', d: '棋子相邻的空交叉点' },
  { t: '眼', d: '一块棋围成的空点（真眼是活棋的关键）' },
  { t: '活棋', d: '有两个真眼，永远不会被吃掉的棋' },
  { t: '死棋', d: '没有两只眼、迟早会被提掉的棋' },
  { t: '劫', d: '双方互相提子的循环争抢' },
  { t: '先手/后手', d: '黑先落子为先行，白后落子' },
  { t: '贴目', d: '黑方先行优势，终局白方获得 7.5 目补偿' },
  { t: '官子', d: '终局阶段确定边界的收尾着法' },
];

export const GoRulesLearning: React.FC = () => {
  const [active, setActive] = useState(0);
  const [board, setBoard] = useState<GoBoardT>(() => cloneGoBoard(DEMOS[0].board));
  const [demoColor, setDemoColor] = useState<GoColor>('b');

  const switchDemo = (i: number) => {
    setActive(i);
    setBoard(cloneGoBoard(DEMOS[i].board));
  };

  const handleClick = (r: number, c: number) => {
    if (active === 3) return; // 胜负章节不做交互
    const res = goPlaceStone(board, r, c, demoColor, null);
    if (res.board) {
      setBoard(res.board);
      setDemoColor(demoColor === 'b' ? 'w' : 'b');
    }
  };

  const demo = DEMOS[active];

  return (
    <div className="module go-rules">
      <div className="module-header">
        <h2>📖 围棋规则学习</h2>
        <p>从落子到胜负，一步步学会围棋</p>
      </div>
      <div className="rules-layout">
        <div className="rules-toc">
          {DEMOS.map((d, i) => (
            <button key={d.key} className={`rules-toc-item ${active === i ? 'active' : ''}`} onClick={() => switchDemo(i)}>
              {i + 1}. {d.title}
            </button>
          ))}
        </div>
        <div className="rules-demo">
          <h3>{demo.title}</h3>
          <p className="rules-demo-text">{demo.text}</p>
          <div className="rules-demo-board">
            <GoBoard
              board={board}
              size={9}
              onIntersectionClick={handleClick}
              interactive={active !== 3}
            />
          </div>
          <p className="rules-demo-hint">💡 {demo.hint}</p>
          {active !== 3 && (
            <button className="ctrl-btn" onClick={() => { setBoard(cloneGoBoard(demo.board)); setDemoColor('b'); }}>
              🔄 重置演示
            </button>
          )}
        </div>
      </div>
      <div className="go-terms">
        <h3>📚 常用术语</h3>
        <div className="go-terms-grid">
          {TERMS.map((tm) => (
            <div key={tm.t} className="go-term-card">
              <strong>{tm.t}</strong>
              <span>{tm.d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GoRulesLearning;
