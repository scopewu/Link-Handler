// SPA 导航钩子 - 链接处理器
// 本脚本运行在 MAIN world（见 manifest.json 的 world 字段），
// 可以拦截页面主世界脚本发起的 history.pushState / replaceState 调用。
// 拦截后通过 window.postMessage 通知隔离世界中的 content.js。
(function() {
  'use strict';

  // 防止重复注入
  if (window.__linkHandlerSpaHooked__) return;
  window.__linkHandlerSpaHooked__ = true;

  const MESSAGE_SOURCE = 'link-handler-spa';

  function notifyNavigation() {
    try {
      window.postMessage({ source: MESSAGE_SOURCE, type: 'navigation', url: location.href }, '*');
    } catch (e) {
      // postMessage 不可用时静默忽略
    }
  }

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    notifyNavigation();
    return result;
  };

  history.replaceState = function(...args) {
    const result = originalReplaceState.apply(this, args);
    notifyNavigation();
    return result;
  };
})();
