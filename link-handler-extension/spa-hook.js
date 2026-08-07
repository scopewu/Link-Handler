// SPA 导航钩子 - 链接处理器
// 本脚本运行在 MAIN world（见 manifest.json 的 world 字段），
// 可以拦截页面主世界脚本发起的 history.pushState / replaceState 调用。
// 拦截后通过 window.postMessage 通知隔离世界中的 content.js，
// 并按 content.js 下发的配置（type: 'sanitize-config'）清洗地址栏跟踪参数。
// 地址栏清洗的站点名单与参数列表完全由 config.js 驱动：
// 所有启用且配置了 cleanUrlParams 的跟踪规则都会默认清洗该站点地址栏，
// 与链接清洗共用同一参数列表，此处不再硬编码。
(function() {
  'use strict';

  // 防止重复注入
  if (window.__linkHandlerSpaHooked__) return;
  window.__linkHandlerSpaHooked__ = true;

  const MESSAGE_SOURCE = 'link-handler-spa';

  // 地址栏清洗参数映射：{ hostname: [参数列表] }
  // 由隔离世界中的 content.js 在配置就绪后通过消息下发；
  // 为空对象时表示当前页面无需清洗（白名单站点、跟踪清理总开关关闭等）。
  let sanitizeParamsByHost = {};

  function notifyNavigation() {
    try {
      window.postMessage({ source: MESSAGE_SOURCE, type: 'navigation', url: location.href }, '*');
    } catch (e) {
      // postMessage 不可用时静默忽略
    }
  }

  // 判断给定主机名是否需要清洗，返回参数列表或 null
  function getParamsToRemove(hostname) {
    if (sanitizeParamsByHost[hostname]) return sanitizeParamsByHost[hostname];
    for (const domain of Object.keys(sanitizeParamsByHost)) {
      if (hostname.endsWith('.' + domain)) {
        return sanitizeParamsByHost[domain];
      }
    }
    return null;
  }

  // 校验消息中的 hosts 结构：{ domain: [string, ...] }，防止页面脚本注入异常数据
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

      // 通配符 * 表示清除全部参数（与 content.js 的 cleanUrlParams 语义一致）
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

  // 清洗当前地址栏（配置到达后执行；使用原生 replaceState 避免进入我们自己的包装层造成递归）
  function sanitizeCurrentUrl() {
    const paramsToRemove = getParamsToRemove(location.hostname);
    if (!paramsToRemove) return;

    const sanitized = sanitizeUrl(location.href, paramsToRemove);
    if (sanitized !== location.href) {
      originalReplaceState.call(history, history.state, document.title || '', sanitized);
      notifyNavigation();
    }
  }

  // 接收隔离世界 content.js 下发的地址栏清洗配置（见 config.js 的 buildSanitizeHostMap）
  // 每次配置变化（用户修改规则/白名单）后都会重新下发，因此这里总是以最新配置为准
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== 'sanitize-config') return;
    if (!isValidHosts(data.hosts)) return;

    sanitizeParamsByHost = data.hosts;
    // 配置到达后立即清洗一次当前地址栏，覆盖页面加载早期的等待窗口
    sanitizeCurrentUrl();
  });
})();
