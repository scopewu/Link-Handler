// SPA 导航钩子 - 链接处理器
// 本脚本运行在 MAIN world（见 manifest.json 的 world 字段），
// 可以拦截页面主世界脚本发起的 history.pushState / replaceState 调用。
// 拦截后通过 window.postMessage 通知隔离世界中的 content.js，
// 并对特定站点（如 Bilibili）清洗地址栏中的跟踪参数。
(function() {
  'use strict';

  // 防止重复注入
  if (window.__linkHandlerSpaHooked__) return;
  window.__linkHandlerSpaHooked__ = true;

  const MESSAGE_SOURCE = 'link-handler-spa';

  // Bilibili 跟踪参数黑名单（与 config.js 中的 bilibili 规则保持一致）
  const BILIBILI_TRACKING_PARAMS = [
    'spm_id_from', 'from_spmid', 'vd_source', 'from', 'seid',
    'share_source', 'share_medium', 'share_plat', 'share_session_id',
    'share_tag', 'timestamp', 'unique_k', 'up_id',
    '-Arouter', 'is_story_h5', 'broadcast_type', 'trackid'
  ];

  // 需要清洗地址栏参数的主机名映射
  const SANITIZE_HOSTS = {
    'bilibili.com': BILIBILI_TRACKING_PARAMS
  };

  function notifyNavigation() {
    try {
      window.postMessage({ source: MESSAGE_SOURCE, type: 'navigation', url: location.href }, '*');
    } catch (e) {
      // postMessage 不可用时静默忽略
    }
  }

  // 判断给定主机名是否需要清洗
  function getParamsToRemove(hostname) {
    const direct = SANITIZE_HOSTS[hostname];
    if (direct) return direct;
    for (const domain of Object.keys(SANITIZE_HOSTS)) {
      if (hostname.endsWith('.' + domain)) {
        return SANITIZE_HOSTS[domain];
      }
    }
    return null;
  }

  // 清洗 URL 中的跟踪参数；若无需清洗则原样返回
  function sanitizeUrl(urlString, paramsToRemove) {
    try {
      const url = new URL(urlString, location.href);
      const params = paramsToRemove || getParamsToRemove(url.hostname);
      if (!params || params.length === 0) return urlString;

      let modified = false;
      params.forEach(param => {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          modified = true;
        }
      });

      return modified ? url.toString() : urlString;
    } catch {
      return urlString;
    }
  }

  // 清洗 history.pushState/replaceState 的参数列表
  function sanitizeHistoryArgs(args) {
    if (args.length < 3) return args;
    const url = args[2];
    if (url === null || url === undefined) return args;
    if (typeof url !== 'string' && typeof url !== 'object') return args;

    const paramsToRemove = getParamsToRemove(location.hostname);
    if (!paramsToRemove) return args;

    const sanitized = sanitizeUrl(url, paramsToRemove);
    if (sanitized === url) return args;
    return [args[0], args[1], sanitized];
  }

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    const sanitizedArgs = sanitizeHistoryArgs(args);
    const result = originalPushState.apply(this, sanitizedArgs);
    notifyNavigation();
    return result;
  };

  history.replaceState = function(...args) {
    const sanitizedArgs = sanitizeHistoryArgs(args);
    const result = originalReplaceState.apply(this, sanitizedArgs);
    notifyNavigation();
    return result;
  };

  // 清洗当前地址栏（页面首次加载时可能已携带跟踪参数）
  // 使用原生 replaceState 避免进入我们自己的包装层造成递归
  function sanitizeCurrentUrl() {
    const paramsToRemove = getParamsToRemove(location.hostname);
    if (!paramsToRemove) return;

    const sanitized = sanitizeUrl(location.href, paramsToRemove);
    if (sanitized !== location.href) {
      originalReplaceState.call(history, history.state, document.title || '', sanitized);
      notifyNavigation();
    }
  }

  // 尽早执行一次初始清洗
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sanitizeCurrentUrl);
  } else {
    sanitizeCurrentUrl();
  }
})();
