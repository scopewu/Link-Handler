// SPA 导航钩子 - 链接处理器
// 运行在 MAIN world（见 manifest.json），拦截 pushState/replaceState 并 postMessage
// 通知隔离世界的 content.js；同时按其下发的配置清洗地址栏跟踪参数
// （参数列表由 config.js 驱动，与链接清洗共用，此处不硬编码）。
(function() {
  'use strict';

  // 防止重复注入
  if (window.__linkHandlerSpaHooked__) return;
  window.__linkHandlerSpaHooked__ = true;

  const MESSAGE_SOURCE = 'link-handler-spa';

  // 地址栏清洗参数映射 { hostname: [参数] }，由 content.js 下发；空对象 = 无需清洗
  let sanitizeParamsByHost = {};

  function notifyNavigation() {
    try {
      window.postMessage({ source: MESSAGE_SOURCE, type: 'navigation', url: location.href }, '*');
    } catch (e) {
      // postMessage 不可用时静默忽略
    }
  }

  function getParamsToRemove(hostname) {
    if (sanitizeParamsByHost[hostname]) return sanitizeParamsByHost[hostname];
    for (const domain of Object.keys(sanitizeParamsByHost)) {
      if (hostname.endsWith('.' + domain)) {
        return sanitizeParamsByHost[domain];
      }
    }
    return null;
  }

  // 校验 hosts 结构，防页面脚本注入
  function isValidHosts(hosts) {
    if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts)) return false;
    for (const domain of Object.keys(hosts)) {
      const params = hosts[domain];
      if (!Array.isArray(params)) return false;
      if (params.some(p => typeof p !== 'string')) return false;
    }
    return true;
  }

  // 清洗 URL 中的跟踪参数；若无需清洗则原样返回
  function sanitizeUrl(urlString, paramsToRemove) {
    try {
      const url = new URL(urlString, location.href);
      const params = paramsToRemove || getParamsToRemove(url.hostname);
      if (!params || params.length === 0) return urlString;

      let modified = false;

      // 通配符 *：清除全部参数（与 content.js 语义一致）
      if (params.includes('*')) {
        if (url.search) {
          url.search = '';
          modified = true;
        }
      } else {
        params.forEach(param => {
          if (url.searchParams.has(param)) {
            url.searchParams.delete(param);
            modified = true;
          }
        });
      }

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

  // 清洗当前地址栏；用原生 replaceState 避免进入自己的包装层造成递归
  function sanitizeCurrentUrl() {
    const paramsToRemove = getParamsToRemove(location.hostname);
    if (!paramsToRemove) return;

    const sanitized = sanitizeUrl(location.href, paramsToRemove);
    if (sanitized !== location.href) {
      originalReplaceState.call(history, history.state, document.title || '', sanitized);
      notifyNavigation();
    }
  }

  // 接收 content.js 下发的清洗配置，总是以最新下发为准
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== 'sanitize-config') return;
    if (!isValidHosts(data.hosts)) return;

    sanitizeParamsByHost = data.hosts;
    // 配置到达立即清洗一次，覆盖加载早期的等待窗口
    sanitizeCurrentUrl();
  });
})();
