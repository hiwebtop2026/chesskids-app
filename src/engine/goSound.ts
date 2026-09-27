/**
 * ChessKids - 围棋音效合成（Web Audio，无需外部音频文件）
 * 落子清脆石子声 / 提子闷响 / 胜利上行琶音 / 失败下行低音 / 和棋中性双音
 * 全部低音量，不干扰对局
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

/** 落子：清脆的石子敲击声（高频瞬态 + 短衰减） */
export function playGoMove() {
  tone(2100, 0, 0.09, 'triangle', 0.14);
  tone(900, 0.002, 0.10, 'sine', 0.12, 500);
  tone(3200, 0.004, 0.05, 'square', 0.05);
}

/** 提子：闷响 + 轻微上升 */
export function playGoCapture() {
  tone(520, 0, 0.14, 'sine', 0.13, 700);
  tone(1200, 0.01, 0.07, 'triangle', 0.07);
}

/** 胜利：上行琶音（C5-E5-G5-C6）+ 亮尾 */
export function playGoWin() {
  tone(523.25, 0, 0.16, 'triangle', 0.16);
  tone(659.25, 0.1, 0.16, 'triangle', 0.16);
  tone(783.99, 0.2, 0.16, 'triangle', 0.16);
  tone(1046.5, 0.3, 0.42, 'triangle', 0.18);
  tone(1568, 0.34, 0.24, 'sine', 0.06);
}

/** 失败：下行低音（A3-F3-D3） */
export function playGoLose() {
  tone(220, 0, 0.28, 'sine', 0.14, 174.61);
  tone(174.61, 0.18, 0.34, 'sine', 0.12, 146.83);
  tone(110, 0.3, 0.5, 'sine', 0.1, 82.41);
}

/** 和棋：中性双音 */
export function playGoDraw() {
  tone(392, 0, 0.18, 'triangle', 0.12);
  tone(523.25, 0.16, 0.22, 'triangle', 0.12);
}
