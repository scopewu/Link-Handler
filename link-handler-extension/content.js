// 内容脚本 - 链接处理器
(function() {
  'use strict';

  // 标记已处理的链接，避免重复处理
  const PROCESSED_MARK = 'data-link-handler-processed';
  const PREVENTED_MARK = 'data-link-handler-prevented';
  const LAST_HREF_DATA = 'linkHandlerLastHref';

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

  // SPA 导航防抖
  let navigationDebounceTimer = null;
  let lastUrl = location.href;

  function isWhitelisted(hostname) {
    if (!config || !config.whitelist || config.whitelist.length === 0) return false;
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
    processAllLinks();

    // 监听动态内容（默认始终启用）
    observeDynamicContent();

    // 监听 SPA 路由变化（默认始终启用）
    listenToSPANavigation();
  }

  function buildRuleMaps() {
    redirectRuleMap.clear();
    trackingRuleMap.clear();

    if (!config) return;

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
        // 重新加载配置后处理所有链接（跳过白名单网站）
        (async () => {
          config = await getConfig();
          buildRuleMaps();
          if (!isWhitelisted(location.hostname)) {
            clearProcessedMarksAndReprocess();
          }
        })();
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

  // 监听配置变化（设置页保存后，已打开的页面实时生效）
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes.linkHandlerConfig) return;
      (async () => {
        config = await getConfig();
        buildRuleMaps();
        if (!isWhitelisted(location.hostname)) {
          clearProcessedMarksAndReprocess();
        }
      })();
    });
  }

  // 处理所有链接
  function processAllLinks() {
    if (isWhitelisted(location.hostname)) return;
    const nodeList = document.querySelectorAll('a[href]:not([' + PROCESSED_MARK + '])');
    // NodeList 转数组，避免 spread 大集合导致栈溢出
    const links = [];
    for (let i = 0; i < nodeList.length; i++) {
      links.push(nodeList[i]);
    }
    batchProcessLinks(links);
  }

  // 清除已处理标记并重新处理所有链接
  function clearProcessedMarksAndReprocess() {
    // 重置统计
    stats = {
      totalProcessed: 0,
      redirectUnwrapped: 0,
      targetRemoved: 0,
      trackingCleaned: 0
    };

    document.querySelectorAll('[' + PROCESSED_MARK + ']').forEach(link => {
      link.removeAttribute(PROCESSED_MARK);
    });
    document.querySelectorAll('[' + PREVENTED_MARK + ']').forEach(link => {
      link.removeAttribute(PREVENTED_MARK);
    });
    processAllLinks();
  }

  // 批量处理链接（性能优化）
  const scheduleProcess = typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (fn) => setTimeout(fn, 16);
  const cancelSchedule = typeof cancelIdleCallback !== 'undefined'
    ? cancelIdleCallback
    : clearTimeout;

  function batchProcessLinks(links) {
    if (links.length > 0) {
      // 用 concat 而非 spread push，避免超大数组触发参数数量上限
      pendingLinks = pendingLinks.concat(links);
      if (pendingLinks.length > MAX_PENDING) {
        // 超出容量时丢弃最旧的，保留最新的 MAX_PENDING 条
        pendingLinks = pendingLinks.slice(-MAX_PENDING);
      }
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
    link.dataset[LAST_HREF_DATA] = link.getAttribute('href') || '';
    stats.totalProcessed++;

    // 阶段1: 处理重定向链接
    let wasRedirect = false;
    if (config.global.enableRedirect !== false) {
      const redirectRule = findRedirectRule(link.href);
      if (redirectRule && redirectRule.enabled !== false) {
        unwrapRedirectLink(link, redirectRule);
        stats.redirectUnwrapped++;
        wasRedirect = true;
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
        const actuallyCleaned = (trackingRule.removeAttributes && trackingRule.removeAttributes.length > 0) ||
                                (trackingRule.cleanUrlParams && trackingRule.cleanUrlParams.length > 0);
        if (actuallyCleaned || !wasRedirect) {
          stats.trackingCleaned++;
        }
      }
    }
  }

  function findRedirectRule(href) {
    try {
      const url = new URL(href);
      const directMatch = redirectRuleMap.get(url.hostname);
      if (directMatch && matchRedirectRule(url, directMatch)) return directMatch;
      for (const [domain, rule] of redirectRuleMap) {
        if (url.hostname.endsWith('.' + domain) && matchRedirectRule(url, rule)) return rule;
      }
      return null;
    } catch {
      return null;
    }
  }

  // 判断 URL 是否命中重定向规则：目标参数存在且非空，
  // 若规则声明了 pathPattern，则路径必须以该前缀开头（避免误伤站内正常链接）
  function matchRedirectRule(url, rule) {
    if (rule.pathPattern && !url.pathname.startsWith(rule.pathPattern)) return false;
    if (!url.searchParams.has(rule.param)) return false;
    const val = url.searchParams.get(rule.param);
    return !!(val && val.trim().length > 0);
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
          // 记录规范化后的属性值，与 MutationObserver 中的比较保持一致
          link.dataset[LAST_HREF_DATA] = link.getAttribute('href') || realUrl;
        }
      }
    } catch (e) {
      console.error('[Link Handler] Failed to unwrap redirect link:', e);
    }
  }

  function shouldRemoveTarget(link) {
    if (!link.hasAttribute('target')) return false;
    if (link.getAttribute('target') !== '_blank') return false;
    if (!config || config.global.removeTargetSameOrigin === false) return false;

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
        // 记录规范化后的属性值，与 MutationObserver 中的比较保持一致
        link.dataset[LAST_HREF_DATA] = link.getAttribute('href') || '';
      }
    } catch (e) {
      console.error('[Link Handler] Failed to clean URL params:', e);
    }
  }

  // 阻止点击重写：在 document 捕获阶段统一委托拦截
  // 捕获阶段先于目标元素上的任何监听器执行，能可靠打断网站的点击跟踪/链接重写；
  // 相比在每个链接上单独注册监听，也更省内存
  let clickRewriteGuardInstalled = false;

  function installClickRewriteGuard() {
    if (clickRewriteGuardInstalled) return;
    clickRewriteGuardInstalled = true;

    document.addEventListener('click', (e) => {
      // 只拦截主按钮点击，保留 Ctrl/Command/Shift/Alt + 点击的默认行为
      if (e.button !== 0) return;

      const link = e.target && e.target.closest ? e.target.closest('a[' + PREVENTED_MARK + ']') : null;
      if (!link) return;

      // 阻止事件继续传播，网站的 click 监听器不会触发
      // 不调用 preventDefault()，让浏览器继续执行默认导航
      // 这样普通点击正常跳转，Ctrl+Click 仍会在新标签页打开
      e.stopImmediatePropagation();
    }, true);
  }

  function preventClickRewrite(link) {
    if (link.hasAttribute(PREVENTED_MARK)) return;
    link.setAttribute(PREVENTED_MARK, 'true');
    installClickRewriteGuard();
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
    // 如果 body 还不存在，等待它出现（防御极端情况）
    if (!document.body) {
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          observeDynamicContent();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
      return;
    }

    if (contentObserver) {
      contentObserver.disconnect();
    }

    contentObserver = new MutationObserver((mutations) => {
      const newLinks = [];
      const changedLinks = [];

      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 查找新增的链接
              if (node.tagName === 'A' && node.href) {
                if (!node.hasAttribute(PROCESSED_MARK)) {
                  newLinks.push(node);
                }
              } else if (node.querySelectorAll) {
                const links = node.querySelectorAll('a[href]:not([' + PROCESSED_MARK + '])');
                for (let i = 0; i < links.length; i++) {
                  newLinks.push(links[i]);
                }
              }
            }
          });
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
          // SPA 经常复用 <a> 节点只改 href
          const target = mutation.target;
          if (target.tagName === 'A' && target.hasAttribute(PROCESSED_MARK)) {
            // 只有当 href 真正改变且不是我们自己修改时才重新处理
            const currentHref = target.getAttribute('href') || '';
            const processedHref = target.dataset.linkHandlerLastHref;
            if (currentHref !== processedHref) {
              target.removeAttribute(PROCESSED_MARK);
              target.removeAttribute(PREVENTED_MARK);
              changedLinks.push(target);
            }
          }
        }
      });

      const allLinks = newLinks.concat(changedLinks);
      if (allLinks.length > 0) {
        batchProcessLinks(allLinks);
      }
    });

    contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });

    console.log('[Link Handler] Observing dynamic content (including href changes)');
  }

  // SPA 导航消息来源标识（与 spa-hook.js 约定一致）
  const SPA_MESSAGE_SOURCE = 'link-handler-spa';

  function onNavigation() {
    if (isWhitelisted(location.hostname)) return;

    // 更新 lastUrl
    lastUrl = location.href;

    // 防抖：快速连续导航只执行最后一次
    if (navigationDebounceTimer) {
      clearTimeout(navigationDebounceTimer);
    }

    // 首次在 100ms 后执行（尽快响应）
    navigationDebounceTimer = setTimeout(() => {
      clearProcessedMarksAndReprocess();

      // 额外再执行两次，捕获异步加载的内容
      setTimeout(() => processAllLinks(), 300);
      setTimeout(() => processAllLinks(), 800);
    }, 100);
  }

  function listenToSPANavigation() {
    if (window.__linkHandler_spa_listening__) return;
    window.__linkHandler_spa_listening__ = true;

    window.addEventListener('popstate', onNavigation);
    window.addEventListener('hashchange', onNavigation);

    // 接收 MAIN world 中 spa-hook.js 转发的 pushState/replaceState 导航事件
    // （content script 运行在隔离世界，无法直接 patch 页面主世界的 history）
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SPA_MESSAGE_SOURCE || data.type !== 'navigation') return;
      onNavigation();
    });
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
