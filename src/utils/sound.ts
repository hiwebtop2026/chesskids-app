/**
 * 中国象棋音效与国风背景音乐系统
 *
 * - 音效（Web Audio 合成）：走子 / 吃子 / 将军 / 胜利 / 失败 / 点击
 * - 背景音乐：真实国风古筝轻音乐 MP3 循环播放
 *   （曲目来自 Pixabay License 免费商用音乐，无需署名：
 *    "Smooth As Silk" by kaazoom —— 古筝轻柔中国风）
 * - 开关状态 localStorage 持久化；支持曲目切换
 * - 浏览器自动播放策略：须在用户首次交互后解锁
 */

// ===== 背景音乐曲目（public/audio 下，Pixabay License 免费商用） =====
export const BGM_TRACKS = [
  { src: '/audio/xiangqi-bgm.mp3', label: '古筝轻曲' },
  { src: '/audio/xiangqi-bgm-full.mp3', label: '古筝全曲' },
  { src: '/audio/xiangqi-bgm-morning.mp3', label: '清晨古风' },
  { src: '/audio/xiangqi-bgm-spring.mp3', label: '泉水笛韵' },
];

// ===== 状态 =====
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmAudio: HTMLAudioElement | null = null;
let bgmIndex = 0;
let bgmVolume = loadVolumePref();
let musicOn = loadPref('xiangqi_music', true);
let sfxOn = loadPref('xiangqi_sfx', true);
let unlocked = false;

function loadVolumePref(): number {
  try {
    const v = localStorage.getItem('xiangqi_bgm_volume');
    if (v === null) return 0.25;
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.25;
  } catch {
    return 0.25;
  }
}

function loadPref(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}
function savePref(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// ===== AudioContext（仅音效用） =====
function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(masterGain);
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
  return ctx;
}

/** 首次用户交互解锁（组件挂载后绑定一次 pointerdown） */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  ensureCtx();
  if (musicOn) startMusic();
}

/** 当前是否已解锁 */
export function isAudioUnlocked() {
  return unlocked;
}

// ===== 开关 =====
export function isMusicEnabled() {
  return musicOn;
}
export function isSfxEnabled() {
  return sfxOn;
}
export function setMusicEnabled(on: boolean) {
  musicOn = on;
  savePref('xiangqi_music', on);
  if (on) {
    ensureCtx();
    startMusic();
  } else {
    stopMusic();
  }
}
export function setSfxEnabled(on: boolean) {
  sfxOn = on;
  savePref('xiangqi_sfx', on);
}

// ===== 背景音乐（真实古筝 MP3 播放） =====
function startMusic() {
  if (!musicOn) return;
  if (bgmAudio) {
    bgmAudio.volume = bgmVolume;
    bgmAudio.play().catch(() => undefined);
    return;
  }
  try {
    const audio = new Audio();
    audio.src = BGM_TRACKS[bgmIndex].src;
    audio.loop = true;
    audio.volume = bgmVolume;
    // 挂载到 body（隐藏），便于控制与调试
    audio.id = 'xiangqi-bgm-audio';
    audio.style.display = 'none';
    try {
      document.body.appendChild(audio);
    } catch {
      /* ignore */
    }
    audio.addEventListener('error', () => {
      // 曲目加载失败：静默降级（音效不受影响）
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
    });
    bgmAudio = audio;
    audio.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function stopMusic() {
  if (bgmAudio) {
    try {
      bgmAudio.pause();
    } catch {
      /* ignore */
    }
  }
}

/** 当前曲目索引（用于 UI 显示） */
export function getBgmTrackIndex() {
  return bgmIndex;
}

/** 当前背景音乐音量（0~1） */
export function getBgmVolume() {
  return bgmVolume;
}

/** 调节背景音乐音量（0~1），实时生效并持久化 */
export function setBgmVolume(v: number) {
  bgmVolume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem('xiangqi_bgm_volume', String(bgmVolume));
  } catch {
    /* ignore */
  }
  if (bgmAudio) {
    try {
      bgmAudio.volume = bgmVolume;
    } catch {
      /* ignore */
    }
  }
}

/** 切换下一首背景音乐 */
export function cycleBgmTrack() {
  bgmIndex = (bgmIndex + 1) % BGM_TRACKS.length;
  if (musicOn && bgmAudio) {
    try {
      bgmAudio.pause();
    } catch {
      /* ignore */
    }
    bgmAudio = null;
    startMusic();
  }
  return BGM_TRACKS[bgmIndex];
}

// ===== 音效（Web Audio 合成） =====
/** 单个短音：频率/时长/波形/音量/滑音 */
function tone(
  dest: AudioNode,
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; vol?: number; glideTo?: number; delay?: number } = {},
) {
  if (!ctx) return;
  const { type = 'sine', vol = 0.5, glideTo, delay = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 木鱼/敲击噪声 */
function knock(dest: AudioNode, freq: number, dur: number, vol: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function play(name: 'move' | 'capture' | 'check' | 'win' | 'lose' | 'click') {
  if (!sfxOn || !ensureCtx() || !sfxGain) return;
  const d = sfxGain;
  switch (name) {
    case 'move': // 走子：短促木声
      knock(d, 520, 0.09, 0.35);
      tone(d, 780, 0.07, { type: 'sine', vol: 0.12 });
      break;
    case 'capture': // 吃子：低沉重击 + 回音
      knock(d, 300, 0.14, 0.5);
      knock(d, 240, 0.12, 0.35);
      tone(d, 620, 0.1, { type: 'triangle', vol: 0.18, delay: 0.05 });
      break;
    case 'check': // 将军：警示上行双音
      tone(d, 660, 0.14, { type: 'square', vol: 0.16 });
      tone(d, 880, 0.18, { type: 'square', vol: 0.16, delay: 0.12 });
      break;
    case 'win': // 胜利：五声上行琶音 + 明亮收尾和弦 + 小鼓点（欢快）
      [392, 440, 494, 587, 659, 784].forEach((f, i) =>
        tone(d, f, 0.3, { type: 'triangle', vol: 0.24, delay: i * 0.1 }),
      );
      // 收尾明亮和弦（G 大三和弦）
      [392, 494, 587].forEach((f) => tone(d, f, 0.7, { type: 'sine', vol: 0.18, delay: 0.62 }));
      // 喜庆小鼓点
      knock(d, 880, 0.08, 0.2);
      knock(d, 1100, 0.08, 0.18);
      knock(d, 880, 0.12, 0.22);
      break;
    case 'lose': // 输棋：温和下行 + 低音安慰（不打击、不刺耳）
      [494, 440, 392, 330].forEach((f, i) =>
        tone(d, f, 0.4, { type: 'sine', vol: 0.16, delay: i * 0.16 }),
      );
      tone(d, 196, 0.9, { type: 'sine', vol: 0.12, delay: 0.66 });
      break;
    case 'click': // 按钮点击：轻短音
      tone(d, 720, 0.05, { type: 'sine', vol: 0.15 });
      break;
  }
}

export function playSfx(name: 'move' | 'capture' | 'check' | 'win' | 'lose' | 'click') {
  play(name);
}

/** 页面隐藏时暂停音乐，恢复时继续（省电 + 避免后台噪音） */
export function initAudioAutoPause() {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopMusic();
    } else if (musicOn && unlocked) {
      startMusic();
    }
  });
}
