// 设置页面逻辑
(function() {
  'use strict';

  let currentConfig = null;

  // 初始化
  async function init() {
    currentConfig = await getConfig();
    renderGlobalSettings();
    renderRedirectRules();
    renderTrackingRules();
    bindEvents();
  }

  // 渲染全局设置
  function renderGlobalSettings() {
    const global = currentConfig.global;
    document.getElementById('removeTargetSameOrigin').checked = global.removeTargetSameOrigin;
    document.getElementById('removeTargetRelative').checked = global.removeTargetRelative;
    document.getElementById('removeTargetAfterUnwrap').checked = global.removeTargetAfterUnwrap !== false;
    document.getElementById('enableForDynamicContent').checked = global.enableForDynamicContent !== false;
  }

  // 渲染重定向规则
  function renderRedirectRules() {
    const container = document.getElementById('redirectRules');
    container.innerHTML = '';

    if (currentConfig.redirectRules.length === 0) {
      container.innerHTML = `<div class="empty-state">${i18n.getMessage('noRules')}</div>`;
      return;
    }

    currentConfig.redirectRules.forEach((rule, index) => {
      const ruleEl = createRedirectRuleElement(rule, index);
      container.appendChild(ruleEl);
    });
  }

  // 创建重定向规则元素
  function createRedirectRuleElement(rule, index) {
    const div = document.createElement('div');
    div.className = 'rule-item' + (rule.enabled === false ? ' disabled' : '');
    div.dataset.index = index;
    div.dataset.type = 'redirect';

    const ruleTitle = rule.description
      ? `${i18n.getMessage('ruleNumber', (index + 1).toString())} - ${rule.description}`
      : i18n.getMessage('ruleNumber', (index + 1).toString());

    div.innerHTML = `
      <div class="rule-header">
        <h3>${ruleTitle}</h3>
        <div class="rule-toggle">
          <label class="rule-enabled">
            <input type="checkbox" ${rule.enabled !== false ? 'checked' : ''}>
            <span>${i18n.getMessage('enabled')}</span>
          </label>
          <button class="btn btn-danger delete-rule">${i18n.getMessage('deleteRule')}</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${i18n.getMessage('domain')}</label>
          <input type="text" class="rule-domain" value="${rule.domain || ''}" placeholder="${i18n.getMessage('domainPlaceholder')}">
        </div>
        <div class="form-group">
          <label>${i18n.getMessage('param')}</label>
          <input type="text" class="rule-param" value="${rule.param || ''}" placeholder="${i18n.getMessage('paramPlaceholder')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group full-width">
          <label>${i18n.getMessage('description')}</label>
          <input type="text" class="rule-desc" value="${rule.description || ''}" placeholder="${i18n.getMessage('descPlaceholder')}">
        </div>
      </div>
    `;

    return div;
  }

  // 渲染跟踪规则
  function renderTrackingRules() {
    const container = document.getElementById('trackingRules');
    container.innerHTML = '';

    if (currentConfig.trackingRules.length === 0) {
      container.innerHTML = `<div class="empty-state">${i18n.getMessage('noRules')}</div>`;
      return;
    }

    currentConfig.trackingRules.forEach((rule, index) => {
      const ruleEl = createTrackingRuleElement(rule, index);
      container.appendChild(ruleEl);
    });
  }

  // 创建跟踪规则元素
  function createTrackingRuleElement(rule, index) {
    const div = document.createElement('div');
    div.className = 'rule-item' + (rule.enabled === false ? ' disabled' : '');
    div.dataset.index = index;
    div.dataset.type = 'tracking';

    const ruleTitle = rule.description
      ? `${i18n.getMessage('ruleNumber', (index + 1).toString())} - ${rule.description}`
      : i18n.getMessage('ruleNumber', (index + 1).toString());

    div.innerHTML = `
      <div class="rule-header">
        <h3>${ruleTitle}</h3>
        <div class="rule-toggle">
          <label class="rule-enabled">
            <input type="checkbox" ${rule.enabled !== false ? 'checked' : ''}>
            <span>${i18n.getMessage('enabled')}</span>
          </label>
          <button class="btn btn-danger delete-rule">${i18n.getMessage('deleteRule')}</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${i18n.getMessage('domain')}</label>
          <input type="text" class="rule-domain" value="${rule.domain || ''}" placeholder="${i18n.getMessage('domainPlaceholder')}">
        </div>
        <div class="form-group">
          <label>${i18n.getMessage('description')}</label>
          <input type="text" class="rule-desc" value="${rule.description || ''}" placeholder="${i18n.getMessage('descPlaceholder')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group full-width">
          <label>${i18n.getMessage('removeAttributes')}</label>
          <div class="tags-input" data-field="removeAttributes">
            ${(rule.removeAttributes || []).map(attr => `<span class="tag">${attr}<span class="remove">×</span></span>`).join('')}
            <input type="text" placeholder="${i18n.getMessage('attrsPlaceholder')}">
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group full-width">
          <label>${i18n.getMessage('cleanUrlParams')}</label>
          <div class="tags-input" data-field="cleanUrlParams">
            ${(rule.cleanUrlParams || []).map(param => `<span class="tag">${param}<span class="remove">×</span></span>`).join('')}
            <input type="text" placeholder="${i18n.getMessage('attrsPlaceholder')}">
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="checkbox-label" style="padding: 0;">
            <input type="checkbox" class="rule-prevent-click" ${rule.preventClickRewrite ? 'checked' : ''}>
            <span>${i18n.getMessage('preventClickRewriteDesc')}</span>
          </label>
        </div>
      </div>
    `;

    return div;
  }

  // 从 DOM 收集当前表单值到 currentConfig（重新渲染前调用，防止丢失未保存的编辑）
  function collectCurrentValues() {
    // 收集重定向规则
    document.querySelectorAll('#redirectRules .rule-item').forEach((item, index) => {
      if (currentConfig.redirectRules[index]) {
        const domain = item.querySelector('.rule-domain');
        const param = item.querySelector('.rule-param');
        const desc = item.querySelector('.rule-desc');
        if (domain) currentConfig.redirectRules[index].domain = domain.value.trim();
        if (param) currentConfig.redirectRules[index].param = param.value.trim();
        if (desc) currentConfig.redirectRules[index].description = desc.value.trim();
      }
    });

    // 收集跟踪规则
    document.querySelectorAll('#trackingRules .rule-item').forEach((item, index) => {
      if (currentConfig.trackingRules[index]) {
        const domain = item.querySelector('.rule-domain');
        const desc = item.querySelector('.rule-desc');
        const preventClick = item.querySelector('.rule-prevent-click');
        if (domain) currentConfig.trackingRules[index].domain = domain.value.trim();
        if (desc) currentConfig.trackingRules[index].description = desc.value.trim();
        if (preventClick) currentConfig.trackingRules[index].preventClickRewrite = preventClick.checked;

        const removeAttrs = [];
        item.querySelectorAll('[data-field="removeAttributes"] .tag').forEach(tag => {
          removeAttrs.push(tag.childNodes[0].textContent.trim());
        });
        currentConfig.trackingRules[index].removeAttributes = removeAttrs;

        const cleanParams = [];
        item.querySelectorAll('[data-field="cleanUrlParams"] .tag').forEach(tag => {
          cleanParams.push(tag.childNodes[0].textContent.trim());
        });
        currentConfig.trackingRules[index].cleanUrlParams = cleanParams;
      }
    });
  }

  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset.tab;
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        localStorage.setItem('linkHandlerActiveTab', tabId);
      });
    });

    const savedTab = localStorage.getItem('linkHandlerActiveTab');
    if (savedTab) {
      const savedButton = document.querySelector(`[data-tab="${savedTab}"]`);
      if (savedButton) savedButton.click();
    }
  }

  function bindEvents() {
    initTabs();

    // 添加重定向规则
    document.getElementById('addRedirectRule').addEventListener('click', () => {
      collectCurrentValues();
      currentConfig.redirectRules.push({
        domain: '',
        param: 'target',
        enabled: true,
        description: ''
      });
      renderRedirectRules();
    });

    // 添加跟踪规则
    document.getElementById('addTrackingRule').addEventListener('click', () => {
      collectCurrentValues();
      currentConfig.trackingRules.push({
        domain: '',
        enabled: true,
        description: '',
        removeAttributes: [],
        cleanUrlParams: [],
        preventClickRewrite: false
      });
      renderTrackingRules();
    });

    // 保存设置
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    // 恢复默认
    document.getElementById('resetSettings').addEventListener('click', resetSettings);

    // 导出配置
    document.getElementById('exportSettings').addEventListener('click', exportSettings);

    // 导入配置
    document.getElementById('importSettings').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importSettings);

    // 委托事件：删除规则、切换启用状态、标签输入
    document.addEventListener('click', handleDelegatedClick);
    document.addEventListener('change', handleDelegatedChange);
    document.addEventListener('keydown', handleTagInput);
    document.addEventListener('click', handleTagRemove);
  }

  // 处理委托点击事件
  function handleDelegatedClick(e) {
    // 删除规则
    if (e.target.classList.contains('delete-rule') || e.target.closest('.delete-rule')) {
      const ruleItem = e.target.closest('.rule-item');
      const index = parseInt(ruleItem.dataset.index);
      const type = ruleItem.dataset.type;

      collectCurrentValues();

      if (type === 'redirect') {
        currentConfig.redirectRules.splice(index, 1);
        renderRedirectRules();
      } else if (type === 'tracking') {
        currentConfig.trackingRules.splice(index, 1);
        renderTrackingRules();
      }
    }
  }

  // 处理委托变更事件
  function handleDelegatedChange(e) {
    const ruleItem = e.target.closest('.rule-item');
    if (!ruleItem) return;

    const index = parseInt(ruleItem.dataset.index);
    const type = ruleItem.dataset.type;

    // 切换启用状态
    if (e.target.classList.contains('rule-toggle')) {
      if (type === 'redirect') {
        currentConfig.redirectRules[index].enabled = e.target.checked;
      } else if (type === 'tracking') {
        currentConfig.trackingRules[index].enabled = e.target.checked;
      }
      ruleItem.classList.toggle('disabled', !e.target.checked);
    }
  }

  // 处理标签输入
  function handleTagInput(e) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    if (!e.target.closest('.tags-input')) return;

    e.preventDefault();
    const input = e.target;
    const value = input.value.trim();
    if (!value) return;

    const tagsInput = input.closest('.tags-input');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${value}<span class="remove">×</span>`;
    tagsInput.insertBefore(tag, input);
    input.value = '';
  }

  // 处理标签删除
  function handleTagRemove(e) {
    if (!e.target.classList.contains('remove')) return;
    e.target.closest('.tag').remove();
  }

  // 保存设置
  async function saveSettings() {
    // 收集全局设置
    currentConfig.global = {
      removeTargetSameOrigin: document.getElementById('removeTargetSameOrigin').checked,
      removeTargetRelative: document.getElementById('removeTargetRelative').checked,
      removeTargetAfterUnwrap: document.getElementById('removeTargetAfterUnwrap').checked,
      enableForDynamicContent: document.getElementById('enableForDynamicContent').checked
    };

    // 收集规则表单值
    collectCurrentValues();

    // 保存
    const success = await saveConfig(currentConfig);
    if (success) {
      showToast(i18n.getMessage('savedSuccess'), 'success');
    } else {
      showToast(i18n.getMessage('savedError'), 'error');
    }
  }

  // 恢复默认设置
  async function resetSettings() {
    if (!confirm(i18n.getMessage('resetConfirm'))) return;

    currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    await saveConfig(currentConfig);
    renderGlobalSettings();
    renderRedirectRules();
    renderTrackingRules();
    showToast(i18n.getMessage('resetSettings'), 'success');
  }

  // 导出配置
  function exportSettings() {
    const dataStr = JSON.stringify(currentConfig, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `link-handler-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(i18n.getMessage('exportSettings'), 'success');
  }

  // 导入配置
  function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);

        // 验证配置结构
        if (!imported.redirectRules || !imported.trackingRules || !imported.global) {
          throw new Error('无效的配置文件');
        }

        currentConfig = imported;
        saveConfig(currentConfig);
        renderGlobalSettings();
        renderRedirectRules();
        renderTrackingRules();
        showToast(i18n.getMessage('importSettings'), 'success');
      } catch (err) {
        showToast(i18n.getMessage('importError') + ': ' + err.message, 'error');
      }
    };
    reader.readAsText(file);

    // 清空 input
    e.target.value = '';
  }

  // 显示提示
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
