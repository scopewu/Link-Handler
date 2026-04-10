// 弹出窗口逻辑
(function() {
  'use strict';

  async function init() {
    // 获取配置
    const config = await getConfig();

    // 恢复开关状态
    document.getElementById('enableExtension').checked = config.global.enabled !== false;

    // 更新开关图标状态
    updateToggleIcon(config.global.enabled !== false);

    // 更新统计
    document.getElementById('redirectCount').textContent = config.redirectRules.filter(r => r.enabled !== false).length;
    document.getElementById('trackingCount').textContent = config.trackingRules.filter(r => r.enabled !== false).length;

    await updateProcessedStats();

    document.getElementById('processNow').addEventListener('click', processCurrentPage);
    document.getElementById('enableExtension').addEventListener('change', toggleExtension);
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

  // 更新开关图标视觉状态
  function updateToggleIcon(enabled) {
    const iconWrapper = document.querySelector('.toggle-icon-wrapper');
    if (iconWrapper) {
      iconWrapper.className = 'toggle-icon-wrapper' + (enabled ? ' enabled' : '');
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

  // 切换扩展启用状态
  async function toggleExtension(e) {
    const enabled = e.target.checked;

    updateToggleIcon(enabled);

    // 保存到配置
    try {
      const config = await getConfig();
      config.global.enabled = enabled;
      await saveConfig(config);
      console.log('[Link Handler] Extension enabled:', enabled);

      // 通知当前标签页
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { action: 'configUpdated', enabled: enabled });
        }
      } catch {}
    } catch (e) {
      console.error('[Link Handler] Failed to save toggle state:', e);
    }
  }

  // 初始化
  document.addEventListener('DOMContentLoaded', init);
})();
