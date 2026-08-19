// 内容脚本 - 链接处理器
(function() {
  'use strict';

  const PROCESSED_MARK = 'data-link-handler-processed';
  const PREVENTED_MARK = 'data-link-handler-prevented';
  const LAST_HREF_DATA = 'linkHandlerLastHref';

  let config = null;

  let pendingLinks = [];
  let processTimer = null;

  function createEmptyStats() {
    return {
      totalProcessed: 0,
      redirectUnwrapped: 0,
      targetRemoved: 0,
      trackingCleaned: 0
    };
  }

  let stats = createEmptyStats();

  let contentObserver = null;
  let isProcessing = false;
  const MAX_PENDING = 10000;
  let redirectRuleMap = new Map();
  let trackingRuleMap = new Map();

  // SPA 导航防抖
  let navigationDebounceTimer = null;
  let lastUrl = location.href;

  function isWhitelisted(hostname) {
    // 域名匹配见 config.js 的 findDomainMatch
    return findDomainMatch(hostname, config && config.whitelist) !== null;
  }

  async function init() {
    config = await getConfig();

    buildRuleMaps();

    sendSanitizeConfig();

    if (isWhitelisted(location.hostname)) return;

    processAllLinks();

    observeDynamicContent();

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

  // 消息来源标识（与 spa-hook.js 约定的契约）
  const SPA_MESSAGE_SOURCE = 'link-handler-spa';

  // 向 MAIN world 下发地址栏清洗配置；白名单页面下发空表以禁用
  function sendSanitizeConfig() {
    try {
      const hosts = isWhitelisted(location.hostname)
        ? {}
        : buildSanitizeHostMap(config);
      window.postMessage({ source: SPA_MESSAGE_SOURCE, type: 'sanitize-config', hosts }, '*');
    } catch (e) {
      // postMessage 不可用时静默忽略
    }
  }

  // 重载配置并重扫：popup 的 reprocess 与 storage.onChanged 几乎同时到达，防抖合并
  let reprocessTimer = null;
  const REPROCESS_DEBOUNCE_MS = 150;

  function scheduleReprocess() {
    if (reprocessTimer) clearTimeout(reprocessTimer);
    reprocessTimer = setTimeout(async () => {
      reprocessTimer = null;
      config = await getConfig();
      buildRuleMaps();
      sendSanitizeConfig();
      if (!isWhitelisted(location.hostname)) {
        clearProcessedMarksAndReprocess();
      }
    }, REPROCESS_DEBOUNCE_MS);
  }

  // 监听来自 popup 的配置更新
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'reprocess') {
        scheduleReprocess();
      }
      if (message.action === 'getStats') {
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
      scheduleReprocess();
    });
  }

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

  function clearProcessedMarksAndReprocess() {
    stats = createEmptyStats();

    document.querySelectorAll('[' + PROCESSED_MARK + ']').forEach(link => {
      link.removeAttribute(PROCESSED_MARK);
    });
    document.querySelectorAll('[' + PREVENTED_MARK + ']').forEach(link => {
      link.removeAttribute(PREVENTED_MARK);
    });
    processAllLinks();
  }

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

  // 记录规范化后的 href，供 MutationObserver 判断 href 变化是否由本扩展引起
  function recordHref(link, fallback = '') {
    link.dataset[LAST_HREF_DATA] = link.getAttribute('href') || fallback;
  }

  function processLink(link) {
    if (!link || !link.href || link.hasAttribute(PROCESSED_MARK)) {
      return;
    }

    link.setAttribute(PROCESSED_MARK, 'true');
    recordHref(link);
    stats.totalProcessed++;

    // 阶段1：重定向解析（规则表只含启用规则）
    let wasRedirect = false;
    if (config.global.enableRedirect !== false) {
      const redirectRule = findRuleFor(redirectRuleMap, link.href, matchRedirectRule);
      if (redirectRule) {
        unwrapRedirectLink(link, redirectRule);
        stats.redirectUnwrapped++;
        wasRedirect = true;
      }
    }

    // 阶段2：同域名/相对地址移除 target
    if (shouldRemoveTarget(link)) {
      link.removeAttribute('target');
      stats.targetRemoved++;
    }

    // 阶段3：清理跟踪属性（规则表只含启用规则）
    if (config.global.enableTracking !== false) {
      let trackingCounted = false; // 防止 per-domain 与全局双重计数

      const trackingRule = findRuleFor(trackingRuleMap, link.href, null);
      if (trackingRule) {
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
          trackingCounted = true;
        }
      }

      // 全局通用跟踪参数（与按域名规则叠加）
      const globalParams = config.global.globalTrackingParams;
      if (globalParams && globalParams.length > 0) {
        const before = link.getAttribute('href');
        cleanUrlParams(link, globalParams);
        // 避免与 per-domain 块重复计数
        if (!trackingCounted && link.getAttribute('href') !== before) {
          stats.trackingCleaned++;
        }
      }
    }
  }

  // 按主机名查规则表：精确匹配优先，其次后缀匹配；matchFn 为可选的逐规则校验
  function findRuleFor(ruleMap, href, matchFn) {
    try {
      const url = new URL(href);
      const direct = ruleMap.get(url.hostname);
      if (direct && (!matchFn || matchFn(url, direct))) return direct;
      for (const [domain, rule] of ruleMap) {
        if (url.hostname.endsWith('.' + domain) && (!matchFn || matchFn(url, rule))) return rule;
      }
      return null;
    } catch {
      return null;
    }
  }

  // 目标参数存在且非空；声明 pathPattern 时路径需以该前缀开头
  function matchRedirectRule(url, rule) {
    if (rule.pathPattern && !url.pathname.startsWith(rule.pathPattern)) return false;
    if (!url.searchParams.has(rule.param)) return false;
    const val = url.searchParams.get(rule.param);
    return !!(val && val.trim().length > 0);
  }

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

        if (isValidUrl(realUrl)) {
          link.href = realUrl;
          recordHref(link, realUrl);
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
    // 不以协议或 // 开头
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

  function cleanUrlParams(link, paramsToRemove) {
    try {
      const url = new URL(link.href);

      // 通配符 *：移除全部参数
      if (paramsToRemove.includes('*')) {
        if (url.search) {
          url.search = '';
          link.href = url.toString();
          recordHref(link);
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
        recordHref(link);
      }
    } catch (e) {
      console.error('[Link Handler] Failed to clean URL params:', e);
    }
  }

  // 阻止点击重写：document 捕获阶段统一委托拦截（捕获先于目标监听器，可靠打断重写且省内存）
  let clickRewriteGuardInstalled = false;

  function installClickRewriteGuard() {
    if (clickRewriteGuardInstalled) return;
    clickRewriteGuardInstalled = true;

    document.addEventListener('click', (e) => {
      // 只拦截主按钮点击，保留 Ctrl/Command/Shift/Alt + 点击的默认行为
      if (e.button !== 0) return;

      const link = e.target && e.target.closest ? e.target.closest('a[' + PREVENTED_MARK + ']') : null;
      if (!link) return;

      // 只 stopImmediatePropagation 不 preventDefault：打断网站监听器，默认导航照常（Ctrl+Click 仍开新标签）
      e.stopImmediatePropagation();
    }, true);
  }

  function preventClickRewrite(link) {
    if (link.hasAttribute(PREVENTED_MARK)) return;
    link.setAttribute(PREVENTED_MARK, 'true');
    installClickRewriteGuard();
  }

  function isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function observeDynamicContent() {
    // body 不存在时等待其出现
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
            // href 真正改变且非本扩展修改时才重处理
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
  }

  function onNavigation() {
    if (isWhitelisted(location.hostname)) return;

    // 地址未变时不重扫：频繁触发的导航事件（如 Bilibili）重跑全量扫描只会卡顿
    const currentUrl = location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    if (navigationDebounceTimer) {
      clearTimeout(navigationDebounceTimer);
    }

    navigationDebounceTimer = setTimeout(() => {
      clearProcessedMarksAndReprocess();

      // 再补两次扫描，捕获异步加载内容
      setTimeout(() => processAllLinks(), 300);
      setTimeout(() => processAllLinks(), 800);
    }, 100);
  }

  function listenToSPANavigation() {
    if (window.__linkHandler_spa_listening__) return;
    window.__linkHandler_spa_listening__ = true;

    window.addEventListener('popstate', onNavigation);
    window.addEventListener('hashchange', onNavigation);

    // 接收 spa-hook.js 转发的导航事件（隔离世界无法 patch 主世界 history）
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SPA_MESSAGE_SOURCE || data.type !== 'navigation') return;
      onNavigation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
