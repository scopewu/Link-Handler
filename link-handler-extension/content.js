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

  // 初始化
  async function init() {
    config = await getConfig();

    // 检查全局启用状态
    if (config.global.enabled === false) {
      console.log('[Link Handler] Extension is disabled');
      return;
    }

    // 处理已有链接
    if (config.global.processExistingLinks) {
      processAllLinks();
    }

    // 监听动态内容
    if (config.global.enableForDynamicContent) {
      observeDynamicContent();
    }

    // 监听 SPA 路由变化
    listenToSPANavigation();
  }

  // 监听来自 popup 的配置更新
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'configUpdated') {
        if (message.enabled === false) {
          // 扩展被禁用，不做任何处理
          config.global.enabled = false;
        } else {
          // 扩展被启用，重新初始化
          config.global.enabled = true;
          processAllLinks();
          if (config.global.enableForDynamicContent) {
            observeDynamicContent();
          }
        }
      }
      if (message.action === 'reprocess') {
        // 重新处理所有链接
        if (config.global.enabled !== false) {
          document.querySelectorAll('a:not([' + PROCESSED_MARK + '])').forEach(link => {
            pendingLinks.push(link);
          });
          batchProcessLinks([]);
        }
      }
    });
  }

  // 处理所有链接
  function processAllLinks() {
    const links = document.querySelectorAll('a[href]:not([' + PROCESSED_MARK + '])');
    batchProcessLinks(links);
  }

  // 批量处理链接（性能优化）
  function batchProcessLinks(links) {
    if (links.length === 0) return;

    pendingLinks.push(...links);

    if (processTimer) {
      clearTimeout(processTimer);
    }

    // 使用 requestIdleCallback 或 setTimeout 批量处理
    const scheduleProcess = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : (fn) => setTimeout(fn, 1);

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

    try {
      // 阶段1: 处理重定向链接
      const redirectRule = findRedirectRule(link.href);
      if (redirectRule && redirectRule.enabled !== false) {
        unwrapRedirectLink(link, redirectRule);
        return; // 重定向链接处理后，不再进行其他处理
      }

      // 阶段2: 同域名/相对地址，移除 target
      if (shouldRemoveTarget(link)) {
        removeTargetAttribute(link);
      }

      // 阶段3: 清理跟踪属性
      const trackingRule = findTrackingRule(link.href);
      if (trackingRule && trackingRule.enabled !== false) {
        cleanTrackingAttributes(link, trackingRule);
        if (trackingRule.cleanUrlParams && trackingRule.cleanUrlParams.length > 0) {
          cleanUrlParams(link, trackingRule.cleanUrlParams);
        }
        if (trackingRule.preventClickRewrite) {
          preventClickRewrite(link);
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
        if (!rule.enabled) return false;
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

          // 移除 target 属性（在同一标签页打开）
          // if (config.global.removeTargetAfterUnwrap) {
          //   link.removeAttribute('target');
          // }
        }
      }
    } catch (e) {
      console.error('[Link Handler] Failed to unwrap redirect link:', e);
    }
  }

  // 判断是否应该移除 target
  function shouldRemoveTarget(link) {
    if (!link.hasAttribute('target')) return false;
    if (link.getAttribute('target') !== '_blank') return false;

    const href = link.getAttribute('href') || '';

    // 相对地址
    if (config.global.removeTargetRelative && isRelativeUrl(href)) {
      return true;
    }

    // 同域名
    if (config.global.removeTargetSameOrigin && isSameOrigin(link)) {
      return true;
    }

    return false;
  }

  // 判断是否为相对地址
  function isRelativeUrl(href) {
    return href && !href.match(/^[a-z][a-z0-9+.-]*:/i);
  }

  // 判断是否为同域名
  function isSameOrigin(link) {
    try {
      const linkUrl = new URL(link.href);
      return linkUrl.origin === location.origin;
    } catch {
      return false;
    }
  }

  // 移除 target 属性
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

  // 监听 SPA 路由变化
  function listenToSPANavigation() {
    // 监听 history 变化
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

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
