/**
 * ChessKids - 五子棋音效引擎（Web Audio 合成，无需外部音频文件）
 * 落子敲击 / 悔棋 / 胜利琶音 / 失败下行 / 和棋双音
 * 所有音效低音量、短促，不打断背景音乐
 */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** 单个音符 */
function tone(
  freq: number,
  start: number,
  dur: number,
  vol: number,
  type: OscillatorType = 'sine',
  dest?: AudioNode,
): void {
  const c = audioCtx;
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(dest || c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** 落子：短促木石敲击（低频衰减正弦 + 一点噪声感） */
export function playGomokuMove(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(460, t);
  o.frequency.exponentialRampToValueAtTime(170, t + 0.09);
  g.gain.setValueAtTime(0.32, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + 0.15);
}

/** 悔棋 / 提示：轻柔上滑音 */
export function playGomokuUndo(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(330, t, 0.12, 0.1, 'sine');
  tone(440, t + 0.08, 0.16, 0.1, 'sine');
}

/** 胜利：明亮上行琶音 C5-E5-G5-C6 + 高音收尾 */
export function playGomokuWin(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const seq = [523.25, 659.25, 783.99, 1046.5];
  seq.forEach((f, i) => tone(f, t + i * 0.09, 0.26, 0.15, 'triangle'));
  tone(1318.5, t + 0.38, 0.55, 0.16, 'sine');
  tone(1568, t + 0.44, 0.4, 0.1, 'sine');
}

/** 失败：下行低音 G4-Eb4-C4-G3 */
export function playGomokuLose(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const seq = [392, 311.13, 261.63, 196];
  seq.forEach((f, i) => tone(f, t + i * 0.13, 0.32, 0.13, 'sine'));
}

/** 和棋：中性双音 + 微收尾 */
export function playGomokuDraw(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(440, t, 0.28, 0.13, 'sine');
  tone(523.25, t + 0.18, 0.32, 0.13, 'sine');
  tone(659.25, t + 0.36, 0.22, 0.08, 'sine');
}
