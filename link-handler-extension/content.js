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
    listenToSPANavigation();

    if (isWhitelisted(location.hostname)) return;

    processAllLinks();
    observeDynamicContent();
  }

  function addRuleToMap(map, rule) {
    const domain = normalizeHostname(rule.domain);
    const rules = map.get(domain) || [];
    rules.push(rule);
    map.set(domain, rules);
  }

  function buildRuleMaps() {
    redirectRuleMap.clear();
    trackingRuleMap.clear();

    if (!config) return;

    config.redirectRules.forEach(rule => {
      if (rule.enabled !== false) addRuleToMap(redirectRuleMap, rule);
    });

    config.trackingRules.forEach(rule => {
      if (rule.enabled !== false) addRuleToMap(trackingRuleMap, rule);
    });
  }

  // 消息来源标识（与 spa-hook.js 约定的契约）
  const SPA_MESSAGE_SOURCE = 'link-handler-spa';
  let sanitizePort = null;

  // 配置通过专用 MessagePort 下发，普通 window 消息不能修改清洗规则
  function sendSanitizeConfig() {
    try {
      const hosts = isWhitelisted(location.hostname)
        ? {}
        : buildSanitizeHostMap(config);

      if (!sanitizePort) {
        const channel = new MessageChannel();
        sanitizePort = channel.port1;
        window.postMessage({ source: SPA_MESSAGE_SOURCE, type: 'sanitize-channel' }, '*', [channel.port2]);
      }
      sanitizePort.postMessage({ hosts });
    } catch (e) {
      console.error('[Link Handler] Failed to send sanitize config:', e);
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

      if (isWhitelisted(location.hostname)) {
        stopProcessing();
        return;
      }

      clearProcessedMarksAndReprocess();
      observeDynamicContent();
      listenToSPANavigation();
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

  function stopProcessing() {
    pendingLinks = [];
    stats = createEmptyStats();

    if (processTimer) cancelSchedule(processTimer);
    processTimer = null;
    if (navigationDebounceTimer) clearTimeout(navigationDebounceTimer);
    navigationDebounceTimer = null;

    if (contentObserver) contentObserver.disconnect();
    contentObserver = null;
    document.querySelectorAll('[' + PREVENTED_MARK + ']').forEach(link => {
      link.removeAttribute(PREVENTED_MARK);
    });
  }

  const scheduleProcess = typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (fn) => setTimeout(fn, 16);
  const cancelSchedule = typeof cancelIdleCallback !== 'undefined'
    ? cancelIdleCallback
    : clearTimeout;

  function batchProcessLinks(links) {
    if (isWhitelisted(location.hostname)) return;

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
      processTimer = null;
      isProcessing = true;
      try {
        const batch = pendingLinks.splice(0, 100);
        batch.forEach(link => {
          try {
            processLink(link);
          } catch (e) {
            console.error('[Link Handler] Failed to process link:', e);
          }
        });
      } finally {
        isProcessing = false;
      }

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
    if (isWhitelisted(location.hostname) || !link || !link.href || link.hasAttribute(PROCESSED_MARK)) {
      return;
    }

    link.setAttribute(PROCESSED_MARK, 'true');
    recordHref(link);
    stats.totalProcessed++;

    // 原始 href 为空或纯锚点（#xxx）时，new URL 会按当前页面地址解析，
    // 页面自身的查询参数会被误当作链接参数；跳过重定向解析与跟踪清理，
    // 避免把同页锚点改写成带页面参数的绝对地址（锚点滚动变成整页跳转）
    const rawHref = link.getAttribute('href') || '';
    const isFragmentOnly = rawHref === '' || rawHref.startsWith('#');

    // 阶段1：重定向解析（规则表只含启用规则）
    if (!isFragmentOnly && config.global.enableRedirect !== false) {
      const redirectRule = findRuleFor(redirectRuleMap, link.href, matchRedirectRule);
      if (redirectRule && unwrapRedirectLink(link, redirectRule)) {
        stats.redirectUnwrapped++;
      }
    }

    // 阶段2：同域名/相对地址移除 target
    if (shouldRemoveTarget(link)) {
      link.removeAttribute('target');
      stats.targetRemoved++;
    }

    // 阶段3：清理跟踪属性（规则表只含启用规则）
    if (!isFragmentOnly && config.global.enableTracking !== false) {
      let trackingCounted = false; // 防止 per-domain 与全局双重计数
      const trackingRules = findRulesFor(trackingRuleMap, link.href, null);

      trackingRules.forEach(rule => {
        const attributesCleaned = cleanTrackingAttributes(link, rule);
        let paramsCleaned = false;
        if (rule.cleanUrlParams && rule.cleanUrlParams.length > 0) {
          paramsCleaned = cleanUrlParams(link, rule.cleanUrlParams);
        }
        if (rule.preventClickRewrite) {
          preventClickRewrite(link);
        }
        if (attributesCleaned || paramsCleaned) trackingCounted = true;
      });
      if (trackingCounted) stats.trackingCleaned++;

      // 全局通用跟踪参数（与按域名规则叠加）
      const globalParams = config.global.globalTrackingParams;
      if (globalParams && globalParams.length > 0) {
        const globallyCleaned = cleanUrlParams(link, globalParams);
        if (!trackingCounted && globallyCleaned) stats.trackingCleaned++;
      }
    }
  }

  // 按主机名查规则列表：精确匹配优先，其次后缀匹配；同域名规则全部保留
  function findRulesFor(ruleMap, href, matchFn) {
    try {
      const url = new URL(href);
      const hostname = normalizeHostname(url.hostname);
      const matchRules = rules => (rules || []).filter(rule => !matchFn || matchFn(url, rule));
      const direct = matchRules(ruleMap.get(hostname));
      if (direct.length > 0) return direct;

      const matches = [];
      for (const [domain, rules] of ruleMap) {
        if (hostname.endsWith('.' + domain)) matches.push(...matchRules(rules));
      }
      return matches;
    } catch {
      return [];
    }
  }

  function findRuleFor(ruleMap, href, matchFn) {
    return findRulesFor(ruleMap, href, matchFn)[0] || null;
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
        // get() 已解码外层；只有尚未形成有效 URL 时才兼容额外的整体编码
        while (!isValidUrl(realUrl) && realUrl.includes('%') && decodeIterations < MAX_DECODE_ITERATIONS) {
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
          return true;
        }
      }
    } catch (e) {
      console.error('[Link Handler] Failed to unwrap redirect link:', e);
    }
    return false;
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
    if (!Array.isArray(rule.removeAttributes)) return false;
    let modified = false;

    rule.removeAttributes.forEach(attr => {
      if (attr.endsWith('-')) {
        const attrs = link.getAttributeNames().filter(name => name.startsWith(attr));
        attrs.forEach(a => {
          link.removeAttribute(a);
          modified = true;
        });
      } else if (link.hasAttribute(attr)) {
        link.removeAttribute(attr);
        modified = true;
      }
    });
    return modified;
  }

  function cleanUrlParams(link, paramsToRemove) {
    try {
      const url = new URL(link.href);

      // 通配符 *：移除全部参数
      if (paramsToRemove.includes('*')) {
        if (!url.search) return false;
        url.search = '';
        link.href = url.toString();
        recordHref(link);
        return true;
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
      return modified;
    } catch (e) {
      console.error('[Link Handler] Failed to clean URL params:', e);
      return false;
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
    if (isWhitelisted(location.hostname)) return;

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
      if (isWhitelisted(location.hostname)) return;
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
          // 已处理、未处理和曾被移除 href 的锚点都允许重新入队
          const target = mutation.target;
          if (target.tagName === 'A') {
            const currentHref = target.getAttribute('href') || '';
            const processedHref = target.dataset.linkHandlerLastHref;
            const isProcessed = target.hasAttribute(PROCESSED_MARK);
            // 地址相同且标记仍在，说明是扩展自身写入或重复通知
            if (currentHref !== processedHref || !isProcessed) {
              target.removeAttribute(PROCESSED_MARK);
              target.removeAttribute(PREVENTED_MARK);
              if (target.href) changedLinks.push(target);
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
