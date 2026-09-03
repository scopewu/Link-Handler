// 弹出窗口逻辑（ES module）
// getConfig / saveConfig 由 config.js 提供（classic，理由见 options.js 头部）
import { i18n } from './i18n.js';

async function init() {
  const config = await getConfig();

  document.getElementById('redirectCount').textContent = config.redirectRules.filter(r => r.enabled !== false).length;
  document.getElementById('trackingCount').textContent = config.trackingRules.filter(r => r.enabled !== false).length;

  await updateProcessedStats();

  await initWhitelistToggle(config);

  document.getElementById('processNow').addEventListener('click', processCurrentPage);
}

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

async function processCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { action: 'reprocess' });

      // 批处理走 requestIdleCallback，分两次刷新统计以拿到较新的结果
      setTimeout(() => updateProcessedStats(), 500);
      setTimeout(() => updateProcessedStats(), 1500);

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
    card.hidden = false;

    // 域名匹配见 config.js 的 findDomainMatch
    const matchedDomain = findDomainMatch(hostname, config.whitelist);
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

function updateWhitelistIcon(whitelisted) {
  const iconWrapper = document.getElementById('whitelistIconWrapper');
  if (iconWrapper) {
    iconWrapper.className = 'toggle-icon-wrapper' + (whitelisted ? ' enabled' : '');
  }
}

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

init();
