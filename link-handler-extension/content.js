// 内容脚本 - 链接处理器
(function() {
  'use strict';

  // 标记已处理的链接，避免重复处理
  const PROCESSED_MARK = 'data-link-handler-processed';

  // 当前配置
  let config = null;

  // 批处理队列
  let pendingLinks = [];
  let processTimer = null;

  // 统计计数器
  let stats = {
    totalProcessed: 0,
    redirectUnwrapped: 0,
    targetRemoved: 0,
    trackingCleaned: 0
  };

  let contentObserver = null;
  let isProcessing = false;
  const MAX_PENDING = 10000;
  let redirectRuleMap = new Map();
  let trackingRuleMap = new Map();

  function isWhitelisted(hostname) {
    if (!config.whitelist || config.whitelist.length === 0) return false;
    const normalized = hostname.replace(/^\[/, '').replace(/\]$/, '');
    return config.whitelist.some(domain => {
      const normalizedDomain = domain.replace(/^\[/, '').replace(/\]$/, '');
      return normalized === normalizedDomain || normalized.endsWith('.' + normalizedDomain);
    });
  }

  // 初始化
  async function init() {
    config = await getConfig();

    buildRuleMaps();

    // 检查当前页面是否在白名单中
    if (isWhitelisted(location.hostname)) {
      console.log('[Link Handler] Current site is whitelisted, skipping processing');
      return;
    }

    // 处理已有链接
    if (config.global.processExistingLinks) {
      processAllLinks();
    }

    // 监听动态内容（默认始终启用）
    observeDynamicContent();

    // 监听 SPA 路由变化（默认始终启用）
    listenToSPANavigation();
  }

  function buildRuleMaps() {
    redirectRuleMap.clear();
    trackingRuleMap.clear();

    config.redirectRules.forEach(rule => {
      if (rule.enabled !== false) {
        redirectRuleMap.set(rule.domain, rule);
      }
    });

    config.trackingRules.forEach(rule => {
      if (rule.enabled !== false) {
        trackingRuleMap.set(rule.domain, rule);
      }
    });
  }

  // 监听来自 popup 的配置更新
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'reprocess') {
        // 重新处理所有链接（跳过白名单网站）
        if (!isWhitelisted(location.hostname)) {
          document.querySelectorAll('[' + PROCESSED_MARK + ']').forEach(link => {
            link.removeAttribute(PROCESSED_MARK);
          });
          processAllLinks();
        }
      }
      if (message.action === 'getStats') {
        // 返回统计信息
        sendResponse(stats);
        return true; // 保持消息通道开启
      }
      if (message.action === 'reloadPage') {
        location.reload();
      }
    });
  }

  // 处理所有链接
  function processAllLinks() {
    if (isWhitelisted(location.hostname)) return;
    const links = document.querySelectorAll('a[href]:not([' + PROCESSED_MARK + '])');
    batchProcessLinks(links);
  }

  // 批量处理链接（性能优化）
  const scheduleProcess = typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (fn) => setTimeout(fn, 1);
  const cancelSchedule = typeof cancelIdleCallback !== 'undefined'
    ? cancelIdleCallback
    : clearTimeout;

  function batchProcessLinks(links) {
    if (links.length > 0) {
      if (pendingLinks.length + links.length > MAX_PENDING) {
        pendingLinks = pendingLinks.slice(-(MAX_PENDING - links.length));
      }
      pendingLinks.push(...links);
    }
    if (pendingLinks.length === 0 || isProcessing) return;

    if (processTimer) {
      cancelSchedule(processTimer);
    }

    processTimer = scheduleProcess(() => {
      isProcessing = true;
      const batch = pendingLinks.splice(0, 100);
      batch.forEach(link => processLink(link));
      isProcessing = false;

      if (pendingLinks.length > 0) {
        batchProcessLinks([]);
      }
    });
  }

  // 处理单个链接
  function processLink(link) {
    if (!link || !link.href || link.hasAttribute(PROCESSED_MARK)) {
      return;
    }

    // 标记为已处理
    link.setAttribute(PROCESSED_MARK, 'true');
    stats.totalProcessed++;

    try {
      // 阶段1: 处理重定向链接
      if (config.global.enableRedirect !== false) {
        const redirectRule = findRedirectRule(link.href);
        if (redirectRule && redirectRule.enabled !== false) {
          unwrapRedirectLink(link, redirectRule);
          stats.redirectUnwrapped++;
          return; // 重定向链接处理后，不再进行其他处理
        }
      }

      // 阶段2: 同域名/相对地址，移除 target
      if (shouldRemoveTarget(link)) {
        removeTargetAttribute(link);
        stats.targetRemoved++;
      }

      // 阶段3: 清理跟踪属性
      if (config.global.enableTracking !== false) {
        const trackingRule = findTrackingRule(link.href);
        if (trackingRule && trackingRule.enabled !== false) {
          cleanTrackingAttributes(link, trackingRule);
          if (trackingRule.cleanUrlParams && trackingRule.cleanUrlParams.length > 0) {
            cleanUrlParams(link, trackingRule.cleanUrlParams);
          }
          if (trackingRule.preventClickRewrite) {
            preventClickRewrite(link);
          }
          stats.trackingCleaned++;
        }
      }
    } catch (e) {
      console.error('[Link Handler] Error processing link:', e, link);
    }
  }

  function findRedirectRule(href) {
    try {
      const url = new URL(href);
      const directMatch = redirectRuleMap.get(url.hostname);
      if (directMatch && url.searchParams.has(directMatch.param)) return directMatch;
      for (const [domain, rule] of redirectRuleMap) {
        if (url.hostname.endsWith('.' + domain) && url.searchParams.has(rule.param)) {
          return rule;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  function findTrackingRule(href) {
    try {
      const url = new URL(href);
      const directMatch = trackingRuleMap.get(url.hostname);
      if (directMatch) return directMatch;
      for (const [domain, rule] of trackingRuleMap) {
        if (url.hostname.endsWith('.' + domain)) {
          return rule;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // 解析重定向链接
  function unwrapRedirectLink(link, rule) {
    try {
      const url = new URL(link.href);
      let realUrl = url.searchParams.get(rule.param);

      if (realUrl) {
        const MAX_DECODE_ITERATIONS = 5;
        let decodeIterations = 0;
        while (realUrl.includes('%') && decodeIterations < MAX_DECODE_ITERATIONS) {
          try {
            const decoded = decodeURIComponent(realUrl);
            if (decoded === realUrl) break;
            realUrl = decoded;
            decodeIterations++;
          } catch {
            break;
          }
        }

        // 验证 URL 安全性
        if (isValidUrl(realUrl)) {
          link.href = realUrl;
        }
      }
    } catch (e) {
      console.error('[Link Handler] Failed to unwrap redirect link:', e);
    }
  }

  function shouldRemoveTarget(link) {
    if (!link.hasAttribute('target')) return false;
    if (link.getAttribute('target') !== '_blank') return false;
    if (config.global.removeTargetSameOrigin === false) return false;

    const href = link.getAttribute('href') || '';

    return isSameOrigin(link) || isRelativeUrl(href);
  }

  function isRelativeUrl(href) {
    // 检查是否为相对 URL（不以协议或 // 开头）
    return href && !/^([a-zA-Z][a-zA-Z0-9+\-.]*:|\/\/)/.test(href);
  }

  function isSameOrigin(link) {
    try {
      const linkUrl = new URL(link.href);
      return linkUrl.origin === location.origin;
    } catch {
      return false;
    }
  }

  function removeTargetAttribute(link) {
    link.removeAttribute('target');
  }

  // 清理跟踪属性
  function cleanTrackingAttributes(link, rule) {
    if (!rule.removeAttributes) return;

    rule.removeAttributes.forEach(attr => {
      if (attr.endsWith('-')) {
        const attrs = link.getAttributeNames().filter(name => name.startsWith(attr));
        attrs.forEach(a => link.removeAttribute(a));
      } else if (link.hasAttribute(attr)) {
        link.removeAttribute(attr);
      }
    });
  }

  // 清理 URL 参数
  function cleanUrlParams(link, paramsToRemove) {
    try {
      const url = new URL(link.href);

      // 通配符 * 表示直接移除所有参数，产出干净 URL
      if (paramsToRemove.includes('*')) {
        if (url.search) {
          url.search = '';
          link.href = url.toString();
        }
        return;
      }

      let modified = false;

      paramsToRemove.forEach(param => {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          modified = true;
        }
      });

      if (modified) {
        link.href = url.toString();
      }
    } catch (e) {
      console.error('[Link Handler] Failed to clean URL params:', e);
    }
  }

  // 阻止点击重写：克隆节点移除直接监听器，stopImmediatePropagation 阻止父级事件委托
  function preventClickRewrite(link) {
    const clone = link.cloneNode(true);
    clone.setAttribute(PROCESSED_MARK, 'true');

    if (link.parentNode) {
      link.parentNode.replaceChild(clone, link);

      clone.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
      }, true);
    }
  }

  // 验证 URL 安全性
  function isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function observeDynamicContent() {
    if (!document.body) return;

    if (contentObserver) {
      contentObserver.disconnect();
    }

    contentObserver = new MutationObserver((mutations) => {
      const newLinks = [];

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 查找新增的链接
            if (node.tagName === 'A' && node.href) {
              if (!node.hasAttribute(PROCESSED_MARK)) {
                newLinks.push(node);
              }
            } else if (node.querySelectorAll) {
              const links = node.querySelectorAll('a[href]:not([' + PROCESSED_MARK + '])');
              newLinks.push(...links);
            }
          }
        });
      });

      if (newLinks.length > 0) {
        batchProcessLinks(newLinks);
      }
    });

    contentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[Link Handler] Observing dynamic content');
  }

  // 保存原始 history 方法，供其他扩展访问
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  if (!window.__linkHandler_original_history__) {
    window.__linkHandler_original_history__ = {
      pushState: originalPushState,
      replaceState: originalReplaceState
    };
  }

  function listenToSPANavigation() {
    if (window.__linkHandler_spa_patched__) return;
    window.__linkHandler_spa_patched__ = true;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      onNavigation();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      onNavigation();
    };

    window.addEventListener('popstate', onNavigation);

    function onNavigation() {
      if (isWhitelisted(location.hostname)) return;

      setTimeout(() => {
        // SPA 导航时清除已处理标记，因为框架可能复用 DOM 节点并更新 href
        document.querySelectorAll('[' + PROCESSED_MARK + ']').forEach(link => {
          link.removeAttribute(PROCESSED_MARK);
        });
        processAllLinks();
      }, 500);
    }
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
