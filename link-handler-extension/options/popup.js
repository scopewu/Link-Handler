// 弹出窗口逻辑
(function() {
  'use strict';

  async function init() {
    // 获取配置
    const config = await getConfig();

    // 更新统计
    document.getElementById('redirectCount').textContent = config.redirectRules.filter(r => r.enabled !== false).length;
    document.getElementById('trackingCount').textContent = config.trackingRules.filter(r => r.enabled !== false).length;

    await updateProcessedStats();

    await initWhitelistToggle(config);

    document.getElementById('processNow').addEventListener('click', processCurrentPage);
  }

  // 更新已处理链接统计
  async function updateProcessedStats() {
    const totalProcessedDom = document.getElementById('totalProcessed');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStats' });
        if (response && response.totalProcessed > 0) {
          totalProcessedDom.textContent = response.totalProcessed;
        } else {
          totalProcessedDom.textContent = '0';
        }
      } else {
        totalProcessedDom.textContent = '-';
      }
    } catch (e) {
      totalProcessedDom.textContent = '-';
    }
  }

  // 处理当前页面
  async function processCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: 'reprocess' });

        // 等待处理后更新统计
        setTimeout(async () => {
          await updateProcessedStats();
        }, 100);

        // 视觉反馈
        const btn = document.getElementById('processNow');
        const originalText = btn.textContent;
        btn.textContent = i18n.getMessage('processingSuccess');
        setTimeout(() => {
          btn.textContent = originalText;
          i18n.localizePage();
        }, 1500);
      }
    } catch (e) {
      console.error('[Link Handler] Failed to process page:', e);
      const btn = document.getElementById('processNow');
      btn.textContent = i18n.getMessage('processingError');
      setTimeout(() => {
        btn.textContent = i18n.getMessage('processNow');
        i18n.localizePage();
      }, 1500);
    }
  }

  async function initWhitelistToggle(config) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;

      const url = new URL(tab.url);
      const hostname = url.hostname;
      if (!hostname) return;

      const card = document.getElementById('whitelistCard');
      const hostnameEl = document.getElementById('currentSiteHostname');
      const toggle = document.getElementById('whitelistToggle');
      const descEl = document.getElementById('whitelistToggleDesc');

      hostnameEl.textContent = hostname;
      card.style.display = '';

      const matchedDomain = findWhitelistMatch(hostname, config.whitelist);
      const whitelisted = matchedDomain !== null;
      toggle.checked = whitelisted;
      updateWhitelistIcon(whitelisted);

      if (whitelisted && matchedDomain !== hostname) {
        // 继承自父域名，禁用开关并显示来源
        toggle.disabled = true;
        descEl.textContent = i18n.getMessage('whitelistInheritedDesc', [matchedDomain]);
      } else {
        toggle.disabled = false;
        descEl.textContent = i18n.getMessage('whitelistSiteDesc');
        toggle.addEventListener('change', (e) => handleWhitelistToggle(e, hostname, tab.id));
      }
    } catch (e) {
      console.error('[Link Handler] Failed to init whitelist toggle:', e);
    }
  }

  // 检查域名是否在白名单中（与 content.js 保持一致）
  function isHostnameWhitelisted(hostname, whitelist) {
    if (!whitelist || whitelist.length === 0) return false;
    return whitelist.some(domain => {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  }

  // 查找匹配的白名单域名（精确匹配优先，返回匹配的域名或 null）
  function findWhitelistMatch(hostname, whitelist) {
    if (!whitelist || whitelist.length === 0) return null;
    let suffixMatch = null;
    for (const domain of whitelist) {
      if (hostname === domain) return domain;
      if (hostname.endsWith('.' + domain)) {
        suffixMatch = domain;
      }
    }
    return suffixMatch;
  }

  // 更新白名单图标视觉状态
  function updateWhitelistIcon(whitelisted) {
    const iconWrapper = document.getElementById('whitelistIconWrapper');
    if (iconWrapper) {
      iconWrapper.className = 'toggle-icon-wrapper' + (whitelisted ? ' enabled' : '');
    }
  }

  // 处理白名单开关切换
  async function handleWhitelistToggle(e, hostname, tabId) {
    const addToWhitelist = e.target.checked;
    try {
      const config = await getConfig();
      if (!Array.isArray(config.whitelist)) config.whitelist = [];

      let cleanHostname = hostname;
      if (cleanHostname.startsWith('www.')) cleanHostname = cleanHostname.slice(4);

      if (addToWhitelist) {
        if (!config.whitelist.includes(cleanHostname)) {
          config.whitelist.push(cleanHostname);
        }
      } else {
        config.whitelist = config.whitelist.filter(d => d !== cleanHostname);
      }

      await saveConfig(config);
      updateWhitelistIcon(addToWhitelist);

      try {
        await chrome.tabs.sendMessage(tabId, { action: 'reloadPage' });
      } catch {
        // 内容脚本未运行（如 chrome:// 页面），静默忽略
      }
    } catch (err) {
      console.error('[Link Handler] Failed to toggle whitelist:', err);
      e.target.checked = !addToWhitelist;
      updateWhitelistIcon(!addToWhitelist);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
