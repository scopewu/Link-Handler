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

  // 检查域名是否在白名单中（域名后缀匹配）
  function isWhitelisted(hostname) {
    if (!config.whitelist || config.whitelist.length === 0) return false;
    return config.whitelist.some(domain => {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  }

  // 初始化
  async function init() {
    config = await getConfig();

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
      pendingLinks.push(...links);
    }
    if (pendingLinks.length === 0) return;

    if (processTimer) {
      cancelSchedule(processTimer);
    }

    processTimer = scheduleProcess(() => {
      const batch = pendingLinks.splice(0, 100); // 每批处理100个
      batch.forEach(link => processLink(link));

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

  // 查找重定向规则
  function findRedirectRule(href) {
    try {
      const url = new URL(href);
      return config.redirectRules.find(rule => {
        if (!rule.enabled || !url.searchParams.has(rule.param)) return false;
        return url.hostname === rule.domain || url.hostname.endsWith('.' + rule.domain);
      });
    } catch {
      return null;
    }
  }

  // 查找跟踪规则
  function findTrackingRule(href) {
    try {
      const url = new URL(href);
      return config.trackingRules.find(rule => {
        if (!rule.enabled) return false;
        return url.hostname === rule.domain || url.hostname.endsWith('.' + rule.domain);
      });
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
        // URL 解码（可能需要多次解码）
        while (realUrl.includes('%')) {
          try {
            const decoded = decodeURIComponent(realUrl);
            if (decoded === realUrl) break;
            realUrl = decoded;
          } catch {
            break;
          }
        }

        // 验证 URL 安全性
        if (isValidUrl(realUrl)) {
          const oldHref = link.href;
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
        // 前缀匹配，如 data-v-
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

  // 阻止点击重写
  function preventClickRewrite(link) {
    // 克隆节点以移除所有事件监听器
    const clone = link.cloneNode(true);

    // 复制重要的属性
    const href = link.href;
    const text = link.textContent;

    // 替换节点
    if (link.parentNode) {
      link.parentNode.replaceChild(clone, link);

      // 添加干净的点击处理
      clone.addEventListener('click', (e) => {
        // 检查是否是左键点击且无修饰键
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = href;
        }
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

  // 监听动态内容变化
  function observeDynamicContent() {
    if (!document.body) return;
    const observer = new MutationObserver((mutations) => {
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

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[Link Handler] Observing dynamic content');
  }

  // 保存原始 history 方法，供其他扩展访问
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  // 将原始方法挂载到 window，便于其他扩展获取
  if (!window.__linkHandlerOriginalMethods__) {
    window.__linkHandlerOriginalMethods__ = {
      pushState: originalPushState,
      replaceState: originalReplaceState
    };
  }

  // 监听 SPA 路由变化
  function listenToSPANavigation() {
    if (window.__linkHandlerPatched__) return;
    window.__linkHandlerPatched__ = true;

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
      // 延迟处理，等待页面渲染
      setTimeout(() => {
        // 清除已处理标记，重新处理
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
