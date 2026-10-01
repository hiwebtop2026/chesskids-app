/**
 * PeerJS 统一加载器 —— 多 CDN 回退 + 智能重试 + 本地缓存
 *
 * 解决问题：
 * 1. 单一 CDN（如 esm.sh）在国内不稳定导致联网初始化失败
 * 2. 各模块重复实现 loadPeerJS，维护成本高
 * 3. 缺少重试和降级机制
 *
 * 加载策略（按优先级自动降级）：
 * 1. 上次成功的 CDN（localStorage 缓存）
 * 2. ESM 模式：jsdelivr → unpkg → npmmirror → esm.sh
 * 3. UMD 模式：jsdelivr → cdnjs → unpkg（script 标签注入）
 * 4. 全部失败：抛出带详细诊断的错误
 */

export type PeerClass = new (...args: any[]) => any;

// 缓存 Promise，避免重复加载
let loadPromise: Promise<PeerClass> | null = null;
// 记录成功的 CDN 索引，下次优先使用
let lastSuccessfulCdn: string | null = null;

const CDN_KEY = 'peerjs_last_cdn';

// ESM CDN 源列表（国内优先）
const ESM_SOURCES = [
  { name: 'jsdelivr-esm', url: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', type: 'umd' as const },
  { name: 'unpkg-esm', url: 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', type: 'umd' as const },
  { name: 'cdnjs', url: 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js', type: 'umd' as const },
  { name: 'npmmirror', url: 'https://registry.npmmirror.com/peerjs/1.5.4/files/dist/peerjs.min.js', type: 'umd' as const },
  { name: 'esm.sh', url: 'https://esm.sh/peerjs@1.5.4', type: 'esm' as const },
  { name: 'jsdelivr-esm', url: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm', type: 'esm' as const },
];

/**
 * 通过 script 标签加载 UMD 版本的 PeerJS
 * 加载后 window.Peer 可用
 */
function loadScript(url: string, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    if ((window as any).Peer) {
      resolve((window as any).Peer);
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`加载超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    function cleanup() {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    }

    script.onload = () => {
      cleanup();
      const Peer = (window as any).Peer;
      if (Peer) {
        resolve(Peer);
      } else {
        reject(new Error('脚本加载成功但未找到 Peer 全局变量'));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('脚本加载失败'));
    };

    document.head.appendChild(script);
  });
}

/**
 * 通过动态 import 加载 ESM 版本的 PeerJS
 */
async function loadEsm(url: string, timeoutMs = 8000): Promise<any> {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`加载超时 (${timeoutMs}ms)`)), timeoutMs);
  });

  const mod = await Promise.race([
    import(/* @vite-ignore */ url),
    timeout,
  ]) as any;

  // 兼容不同导出格式
  const Peer = mod.default || mod.Peer || mod;
  if (!Peer || typeof Peer !== 'function') {
    throw new Error('模块导出格式不正确');
  }
  return Peer;
}

/**
 * 尝试从多个 CDN 加载 PeerJS
 * 优先使用上次成功的 CDN
 */
async function loadFromCdns(): Promise<PeerClass> {
  // 从 localStorage 读取上次成功的 CDN
  let savedCdn: string | null = null;
  try {
    savedCdn = localStorage.getItem(CDN_KEY);
  } catch { /* 忽略存储错误 */ }

  // 重排 CDN 列表：上次成功的排最前
  let sources = [...ESM_SOURCES];
  if (savedCdn) {
    const idx = sources.findIndex((s) => s.name === savedCdn);
    if (idx > 0) {
      const [saved] = sources.splice(idx, 1);
      sources.unshift(saved);
    }
  }

  const errors: string[] = [];

  for (const source of sources) {
    try {
      let Peer: any;
      if (source.type === 'esm') {
        Peer = await loadEsm(source.url);
      } else {
        Peer = await loadScript(source.url);
      }

      // 加载成功，缓存 CDN 名称
      try {
        localStorage.setItem(CDN_KEY, source.name);
      } catch { /* 忽略 */ }
      lastSuccessfulCdn = source.name;
      console.info(`[peerjs-loader] 从 ${source.name} 加载成功`);
      return Peer as PeerClass;
    } catch (err: any) {
      const msg = `${source.name}(${source.type}): ${err?.message || err}`;
      errors.push(msg);
      console.warn(`[peerjs-loader] ${msg}`);
    }
  }

  // 全部失败
  throw new Error(
    `PeerJS 加载失败，已尝试 ${sources.length} 个 CDN 源：\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}\n\n` +
    `建议：检查网络连接或切换网络后重试。`
  );
}

/**
 * 获取 PeerJS 构造函数
 * 自动处理多 CDN 回退、重试、缓存
 */
export function loadPeerJS(): Promise<PeerClass> {
  if (loadPromise) return loadPromise;

  loadPromise = loadFromCdns().catch((err) => {
    // 失败时清除缓存，允许重试
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

/**
 * 强制重新加载（用于用户手动重试）
 */
export function reloadPeerJS(): Promise<PeerClass> {
  loadPromise = null;
  return loadPeerJS();
}

/**
 * 获取加载状态诊断信息
 */
export function getPeerJSLoadStatus(): {
  loaded: boolean;
  lastCdn: string | null;
  savedCdn: string | null;
} {
  let savedCdn: string | null = null;
  try {
    savedCdn = localStorage.getItem(CDN_KEY);
  } catch { /* 忽略 */ }

  return {
    loaded: loadPromise !== null && lastSuccessfulCdn !== null,
    lastCdn: lastSuccessfulCdn,
    savedCdn,
  };
}

/**
 * 清除缓存的 CDN 偏好
 */
export function clearPeerJSCache(): void {
  loadPromise = null;
  lastSuccessfulCdn = null;
  try {
    localStorage.removeItem(CDN_KEY);
  } catch { /* 忽略 */ }
}
