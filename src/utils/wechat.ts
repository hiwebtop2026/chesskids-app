/**
 * 微信内置浏览器检测与工具函数
 * 微信内置浏览器（X5 内核）对 WebRTC / PeerJS 支持不完善，
 * 需要引导用户在系统默认浏览器中打开以正常使用联机对战功能
 */

/** 判断当前是否在微信内置浏览器中打开 */
export function isWeChatBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger/i.test(ua) || /wxwork/i.test(ua);
}

/** 判断是否为 iOS 设备 */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** 判断是否为 Android 设备 */
export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

/**
 * 在微信中尝试用默认浏览器打开当前链接
 * 微信不允许直接跳转外部浏览器，此函数用于复制链接并提示用户手动操作
 */
export function copyLinkForBrowserOpen(): string {
  return window.location.href;
}
