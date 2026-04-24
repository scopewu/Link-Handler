// 设置页面逻辑
(function() {
  'use strict';

  let currentConfig = null;

  let redirectSearchKeyword = '';
  let trackingSearchKeyword = '';
  let currentModalType = null;
  let currentEditIndex = null; // 当前编辑的规则索引，null表示添加新模式

  function renderWhitelist() {
    const container = document.getElementById('whitelistContainer');
    container.innerHTML = '';

    const whitelist = currentConfig.whitelist || [];

    if (whitelist.length === 0) {
      container.innerHTML = `<div class="empty-state">${i18n.getMessage('noWhitelistDomains')}</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    // 倒序遍历，最新添加的显示在最前面
    for (let i = whitelist.length - 1; i >= 0; i--) {
      const item = document.createElement('div');
      item.className = 'whitelist-item';
      item.dataset.index = i;
      item.innerHTML = `
        <span class="whitelist-domain">${escapeHtml(whitelist[i])}</span>
        <button class="btn-icon delete-whitelist" title="${i18n.getMessage('deleteRule')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      `;
      fragment.appendChild(item);
    }
    container.appendChild(fragment);
  }

  async function addWhitelistDomain() {
    const input = document.getElementById('whitelistDomainInput');
    let domain = input.value.trim().toLowerCase();

    if (!domain) {
      showInputError(input);
      showToast(i18n.getMessage('domainRequired'), 'error');
      return;
    }

    if (domain.includes('://')) {
      try {
        const url = new URL(domain);
        domain = url.hostname;
      } catch {
        // 解析失败，保持原值交给后续验证
      }
    }

    if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(domain)) {
      showInputError(input);
      showToast(i18n.getMessage('domainInvalid'), 'error');
      return;
    }

    if (domain.startsWith('www.')) {
      domain = domain.slice(4);
    }

    if (!currentConfig.whitelist) {
      currentConfig.whitelist = [];
    }

    if (currentConfig.whitelist.includes(domain)) {
      showToast(i18n.getMessage('domainExists'), 'error');
      return;
    }

    currentConfig.whitelist.push(domain);
    input.value = '';
    renderWhitelist();

    const success = await saveConfig(currentConfig);
    if (success) {
      showToast(i18n.getMessage('savedSuccess'), 'success');
    } else {
      showToast(i18n.getMessage('savedError'), 'error');
    }
  }

  async function deleteWhitelistDomain(index) {
    if (!currentConfig.whitelist) return;
    currentConfig.whitelist.splice(index, 1);
    renderWhitelist();

    const success = await saveConfig(currentConfig);
    if (success) {
      showToast(i18n.getMessage('savedSuccess'), 'success');
    } else {
      showToast(i18n.getMessage('savedError'), 'error');
    }
  }

  // 初始化
  async function init() {
    currentConfig = await getConfig();
    renderGlobalSettings();
    renderRedirectRules();
    renderTrackingRules();
    renderWhitelist();
    bindEvents();
  }

  // 渲染全局设置
  function renderGlobalSettings() {
    const global = currentConfig.global;
    document.getElementById('removeTargetSameOrigin').checked = global.removeTargetSameOrigin !== false;
    document.getElementById('enableRedirect').checked = global.enableRedirect !== false;
    document.getElementById('enableTracking').checked = global.enableTracking !== false;
  }

  // 渲染重定向规则 - 静态卡片展示
  function renderRedirectRules() {
    const container = document.getElementById('redirectRules');
    container.innerHTML = '';

    const filteredRules = filterRules(currentConfig.redirectRules, redirectSearchKeyword);

    if (filteredRules.length === 0) {
      container.innerHTML = `<div class="empty-state">${redirectSearchKeyword ? i18n.getMessage('noSearchResults') : i18n.getMessage('noRules')}</div>`;
      return;
    }

    // 显示搜索结果统计
    if (redirectSearchKeyword) {
      const statsEl = document.createElement('div');
      statsEl.className = 'search-stats';
      statsEl.textContent = i18n.getMessage('searchResults', [filteredRules.length.toString(), currentConfig.redirectRules.length.toString()]);
      container.appendChild(statsEl);
    }

    filteredRules.forEach(({ rule, index }) => {
      const ruleEl = createRedirectRuleCard(rule, index);
      container.appendChild(ruleEl);
    });
  }

  // 创建重定向规则卡片 - 静态展示
  function createRedirectRuleCard(rule, index) {
    const div = document.createElement('div');
    div.className = 'rule-card' + (rule.enabled === false ? ' disabled' : '');
    div.dataset.index = index;
    div.dataset.type = 'redirect';

    const ruleTitle = rule.description
      ? `${i18n.getMessage('ruleNumber', (index + 1).toString())} - ${rule.description}`
      : i18n.getMessage('ruleNumber', (index + 1).toString());

    // 构建详情行
    const details = [];
    if (rule.domain) {
      details.push(`<span class="rule-detail"><strong>${i18n.getMessage('domain')}:</strong> ${escapeHtml(rule.domain)}</span>`);
    }
    if (rule.param) {
      details.push(`<span class="rule-detail"><strong>${i18n.getMessage('param')}:</strong> ${escapeHtml(rule.param)}</span>`);
    }

    div.innerHTML = `
      <div class="rule-card-header">
        <div class="rule-card-title">
          <span class="rule-status ${rule.enabled !== false ? 'enabled' : 'disabled'}"></span>
          <h3>${escapeHtml(ruleTitle)}</h3>
        </div>
        <div class="rule-card-actions">
          <label class="rule-toggle-label">
            <input type="checkbox" class="rule-toggle" ${rule.enabled !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-icon edit-rule" title="${i18n.getMessage('editRule')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon delete-rule" title="${i18n.getMessage('deleteRule')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rule-card-body">
        ${details.length > 0 ? details.join('') : '<span class="rule-detail empty">暂无配置</span>'}
      </div>
    `;

    return div;
  }

  // 渲染跟踪规则 - 静态卡片展示
  function renderTrackingRules() {
    const container = document.getElementById('trackingRules');
    container.innerHTML = '';

    const filteredRules = filterRules(currentConfig.trackingRules, trackingSearchKeyword);

    if (filteredRules.length === 0) {
      container.innerHTML = `<div class="empty-state">${trackingSearchKeyword ? i18n.getMessage('noSearchResults') : i18n.getMessage('noRules')}</div>`;
      return;
    }

    // 显示搜索结果统计
    if (trackingSearchKeyword) {
      const statsEl = document.createElement('div');
      statsEl.className = 'search-stats';
      statsEl.textContent = i18n.getMessage('searchResults', [filteredRules.length.toString(), currentConfig.trackingRules.length.toString()]);
      container.appendChild(statsEl);
    }

    filteredRules.forEach(({ rule, index }) => {
      const ruleEl = createTrackingRuleCard(rule, index);
      container.appendChild(ruleEl);
    });
  }

  // 创建跟踪规则卡片 - 静态展示
  function createTrackingRuleCard(rule, index) {
    const div = document.createElement('div');
    div.className = 'rule-card' + (rule.enabled === false ? ' disabled' : '');
    div.dataset.index = index;
    div.dataset.type = 'tracking';

    const ruleTitle = rule.description
      ? `${i18n.getMessage('ruleNumber', (index + 1).toString())} - ${rule.description}`
      : i18n.getMessage('ruleNumber', (index + 1).toString());

    // 构建详情行
    const details = [];
    if (rule.domain) {
      details.push(`<span class="rule-detail"><strong>${i18n.getMessage('domain')}:</strong> ${escapeHtml(rule.domain)}</span>`);
    }
    if (rule.removeAttributes && rule.removeAttributes.length > 0) {
      details.push(`<span class="rule-detail"><strong>${i18n.getMessage('removeAttributes')}:</strong> ${rule.removeAttributes.join(', ')}</span>`);
    }
    if (rule.cleanUrlParams && rule.cleanUrlParams.length > 0) {
      const paramsDisplay = rule.cleanUrlParams.includes('*') ? '*' : rule.cleanUrlParams.join(', ');
      details.push(`<span class="rule-detail"><strong>${i18n.getMessage('cleanUrlParams').replace('（输入 * 清除所有）', '').replace(' (use * for all)', '')}:</strong> ${paramsDisplay}</span>`);
    }
    if (rule.preventClickRewrite) {
      details.push(`<span class="rule-detail"><strong>${i18n.getMessage('preventClickRewrite')}:</strong> ✓</span>`);
    }

    div.innerHTML = `
      <div class="rule-card-header">
        <div class="rule-card-title">
          <span class="rule-status ${rule.enabled !== false ? 'enabled' : 'disabled'}"></span>
          <h3>${escapeHtml(ruleTitle)}</h3>
        </div>
        <div class="rule-card-actions">
          <label class="rule-toggle-label">
            <input type="checkbox" class="rule-toggle" ${rule.enabled !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-icon edit-rule" title="${i18n.getMessage('editRule')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon delete-rule" title="${i18n.getMessage('deleteRule')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rule-card-body">
        ${details.length > 0 ? details.join('') : '<span class="rule-detail empty">暂无配置</span>'}
      </div>
    `;

    return div;
  }

  // 转义 HTML 特殊字符
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 过滤规则（根据域名或描述搜索）
  function filterRules(rules, keyword) {
    if (!keyword || !keyword.trim()) {
      return rules.map((rule, index) => ({ rule, index }));
    }

    const lowerKeyword = keyword.toLowerCase().trim();
    const result = [];
    rules.forEach((rule, index) => {
      const domainMatch = (rule.domain || '').toLowerCase().includes(lowerKeyword);
      const descMatch = (rule.description || '').toLowerCase().includes(lowerKeyword);
      if (domainMatch || descMatch) {
        result.push({ rule, index });
      }
    });
    return result;
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

    // 重定向规则搜索
    const redirectSearchInput = document.getElementById('redirectSearch');
    if (redirectSearchInput) {
      redirectSearchInput.addEventListener('input', (e) => {
        redirectSearchKeyword = e.target.value;
        renderRedirectRules();
      });
    }

    // 跟踪规则搜索
    const trackingSearchInput = document.getElementById('trackingSearch');
    if (trackingSearchInput) {
      trackingSearchInput.addEventListener('input', (e) => {
        trackingSearchKeyword = e.target.value;
        renderTrackingRules();
      });
    }

    // 添加重定向规则
    document.getElementById('addRedirectRule').addEventListener('click', () => {
      openRuleModal('redirect');
    });

    // 添加跟踪规则
    document.getElementById('addTrackingRule').addEventListener('click', () => {
      openRuleModal('tracking');
    });

    // 白名单事件
    const whitelistInput = document.getElementById('whitelistDomainInput');
    whitelistInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addWhitelistDomain();
      }
    });
    const addWhitelistBtn = document.getElementById('addWhitelistDomain');
    addWhitelistBtn?.addEventListener('click', addWhitelistDomain);

    // 弹窗事件
    document.getElementById('closeRuleModal').addEventListener('click', closeRuleModal);
    document.getElementById('cancelRuleModal').addEventListener('click', closeRuleModal);
    document.getElementById('confirmRuleModal').addEventListener('click', confirmRuleModal);
    document.getElementById('ruleModal').addEventListener('click', (e) => {
      if (e.target.id === 'ruleModal') closeRuleModal();
    });

    // 全局设置实时保存
    document.getElementById('removeTargetSameOrigin').addEventListener('change', autoSaveGlobalSettings);
    document.getElementById('enableRedirect').addEventListener('change', autoSaveGlobalSettings);
    document.getElementById('enableTracking').addEventListener('change', autoSaveGlobalSettings);

    // 恢复默认
    document.getElementById('resetSettings').addEventListener('click', resetSettings);

    // 导出配置
    document.getElementById('exportSettings').addEventListener('click', exportSettings);

    // 导入配置
    document.getElementById('importSettings').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importSettings);

    // 委托事件：删除规则、切换启用状态、编辑规则
    document.addEventListener('click', handleDelegatedClick);
    document.addEventListener('change', handleDelegatedChange);
    document.addEventListener('click', handleTagRemove);
  }

  // 绑定弹窗内的标签输入事件
  function bindTagInputEvents(container) {
    const tagInputs = container.querySelectorAll('.tags-input input');
    tagInputs.forEach(input => {
      input.addEventListener('keydown', handleTagInput);
    });
  }

  // 解绑弹窗内的标签输入事件
  function unbindTagInputEvents(container) {
    const tagInputs = container.querySelectorAll('.tags-input input');
    tagInputs.forEach(input => {
      input.removeEventListener('keydown', handleTagInput);
    });
  }

  // 处理委托点击事件
  async function handleDelegatedClick(e) {
    const ruleCard = e.target.closest('.rule-card');

    // 删除规则
    if (e.target.classList.contains('delete-rule') || e.target.closest('.delete-rule')) {
      if (!ruleCard) return;
      const index = parseInt(ruleCard.dataset.index);
      const type = ruleCard.dataset.type;

      if (type === 'redirect') {
        currentConfig.redirectRules.splice(index, 1);
        renderRedirectRules();
      } else if (type === 'tracking') {
        currentConfig.trackingRules.splice(index, 1);
        renderTrackingRules();
      }

      // 自动保存
      const success = await saveConfig(currentConfig);
      if (success) {
        showToast(i18n.getMessage('savedSuccess'), 'success');
      } else {
        showToast(i18n.getMessage('savedError'), 'error');
      }
    }

    // 编辑规则
    if (e.target.classList.contains('edit-rule') || e.target.closest('.edit-rule')) {
      if (!ruleCard) return;
      const index = parseInt(ruleCard.dataset.index);
      const type = ruleCard.dataset.type;

      if (type === 'redirect') {
        openRuleModal('redirect', index);
      } else if (type === 'tracking') {
        openRuleModal('tracking', index);
      }
    }

    // 删除白名单域名
    if (e.target.classList.contains('delete-whitelist') || e.target.closest('.delete-whitelist')) {
      const whitelistItem = e.target.closest('.whitelist-item');
      if (whitelistItem) {
        const index = parseInt(whitelistItem.dataset.index);
        deleteWhitelistDomain(index);
      }
    }
  }

  // 处理委托变更事件
  async function handleDelegatedChange(e) {
    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard) return;

    const index = parseInt(ruleCard.dataset.index);
    const type = ruleCard.dataset.type;

    // 切换启用状态
    if (e.target.classList.contains('rule-toggle')) {
      if (type === 'redirect') {
        currentConfig.redirectRules[index].enabled = e.target.checked;
      } else if (type === 'tracking') {
        currentConfig.trackingRules[index].enabled = e.target.checked;
      }
      ruleCard.classList.toggle('disabled', !e.target.checked);

      // 自动保存
      const success = await saveConfig(currentConfig);
      if (success) {
        showToast(i18n.getMessage('savedSuccess'), 'success');
      } else {
        showToast(i18n.getMessage('savedError'), 'error');
      }
    }
  }

  // 处理标签输入
  function handleTagInput(e) {
    if (e.key !== 'Enter' && e.key !== ',') return;

    e.preventDefault();
    const input = e.target;
    const value = input.value.trim();
    if (!value) return;

    const tagsInput = input.closest('.tags-input');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escapeHtml(value)}<span class="remove">×</span>`;
    tagsInput.insertBefore(tag, input);
    input.value = '';
  }

  // 处理标签删除
  function handleTagRemove(e) {
    if (!e.target.classList.contains('remove')) return;
    e.target.closest('.tag').remove();
  }

  // 自动保存全局设置
  async function autoSaveGlobalSettings() {
    currentConfig.global = {
      removeTargetSameOrigin: document.getElementById('removeTargetSameOrigin').checked,
      enableRedirect: document.getElementById('enableRedirect').checked,
      enableTracking: document.getElementById('enableTracking').checked
    };

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
    renderWhitelist();
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
          throw new Error(i18n.getMessage('importError'));
        }

        currentConfig = imported;
        saveConfig(currentConfig);
        renderGlobalSettings();
        renderRedirectRules();
        renderTrackingRules();
        renderWhitelist();
        showToast(i18n.getMessage('importSettings'), 'success');
      } catch (err) {
        showToast(i18n.getMessage('importError') + ': ' + err.message, 'error');
      }
    };
    reader.readAsText(file);

    // 清空 input
    e.target.value = '';
  }

  // 打开规则弹窗
  // type: 'redirect' | 'tracking'
  // editIndex: 编辑时的规则索引，不传或为null表示添加新规则
  function openRuleModal(type, editIndex = null) {
    currentModalType = type;
    currentEditIndex = editIndex;
    const modal = document.getElementById('ruleModal');
    const title = document.getElementById('ruleModalTitle');
    const body = document.getElementById('ruleModalBody');
    const confirmBtn = document.getElementById('confirmRuleModal');

    const isEdit = editIndex !== null;
    const rule = isEdit
      ? (type === 'redirect' ? currentConfig.redirectRules[editIndex] : currentConfig.trackingRules[editIndex])
      : null;

    title.textContent = isEdit
      ? i18n.getMessage('editRule')
      : i18n.getMessage('addRule');
    confirmBtn.textContent = isEdit
      ? i18n.getMessage('save')
      : i18n.getMessage('addRule');

    if (type === 'redirect') {
      body.innerHTML = `
        <div class="modal-form">
          <div class="form-row">
            <div class="form-group full-width checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" id="modalRuleEnabled" ${!isEdit || (rule && rule.enabled !== false) ? 'checked' : ''}>
                <span>${i18n.getMessage('enabled')}</span>
              </label>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${i18n.getMessage('domain')}</label>
              <input type="text" id="modalRuleDomain" value="${isEdit && rule ? escapeHtml(rule.domain) : ''}" placeholder="${i18n.getMessage('domainPlaceholder')}">
            </div>
            <div class="form-group">
              <label>${i18n.getMessage('param')}</label>
              <input type="text" id="modalRuleParam" value="${isEdit && rule ? escapeHtml(rule.param) : 'target'}" placeholder="${i18n.getMessage('paramPlaceholder')}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group full-width">
              <label>${i18n.getMessage('description')}</label>
              <input type="text" id="modalRuleDesc" value="${isEdit && rule ? escapeHtml(rule.description) : ''}" placeholder="${i18n.getMessage('descPlaceholder')}">
            </div>
          </div>
        </div>
      `;
    } else {
      const removeAttrs = isEdit && rule && rule.removeAttributes ? rule.removeAttributes : [];
      const cleanParams = isEdit && rule && rule.cleanUrlParams ? rule.cleanUrlParams : [];

      body.innerHTML = `
        <div class="modal-form">
          <div class="form-row">
            <div class="form-group full-width checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" id="modalRuleEnabled" ${!isEdit || (rule && rule.enabled !== false) ? 'checked' : ''}>
                <span>${i18n.getMessage('enabled')}</span>
              </label>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${i18n.getMessage('domain')}</label>
              <input type="text" id="modalRuleDomain" value="${isEdit && rule ? escapeHtml(rule.domain) : ''}" placeholder="${i18n.getMessage('domainPlaceholder')}">
            </div>
            <div class="form-group">
              <label>${i18n.getMessage('description')}</label>
              <input type="text" id="modalRuleDesc" value="${isEdit && rule ? escapeHtml(rule.description) : ''}" placeholder="${i18n.getMessage('descPlaceholder')}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group full-width">
              <label>${i18n.getMessage('removeAttributes')}</label>
              <div class="tags-input" data-field="modalRemoveAttributes">
                ${removeAttrs.map(attr => `<span class="tag">${escapeHtml(attr)}<span class="remove">×</span></span>`).join('')}
                <input type="text" placeholder="${i18n.getMessage('attrsPlaceholder')}">
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group full-width">
              <label>${i18n.getMessage('cleanUrlParams')}</label>
              <div class="tags-input" data-field="modalCleanUrlParams">
                ${cleanParams.map(param => `<span class="tag">${escapeHtml(param)}<span class="remove">×</span></span>`).join('')}
                <input type="text" placeholder="${i18n.getMessage('attrsPlaceholder')}">
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group full-width checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" id="modalRulePreventClick" ${isEdit && rule && rule.preventClickRewrite ? 'checked' : ''}>
                <span>${i18n.getMessage('preventClickRewriteDesc')}</span>
              </label>
            </div>
          </div>
        </div>
      `;
    }

    modal.classList.add('show');

    // 绑定标签输入事件（仅在跟踪规则类型且有标签输入框时）
    if (type === 'tracking') {
      bindTagInputEvents(body);
    }

    const firstInput = body.querySelector('input[type="text"]');
    if (firstInput) firstInput.focus();
  }

  // 关闭规则弹窗
  function closeRuleModal() {
    const modalBody = document.getElementById('ruleModalBody');
    // 解绑标签输入事件
    unbindTagInputEvents(modalBody);

    document.getElementById('ruleModal').classList.remove('show');
    currentModalType = null;
    currentEditIndex = null;
  }

  // 显示输入框错误状态
  function showInputError(input) {
    input.style.borderColor = 'var(--accent-coral)';
    input.style.boxShadow = '0 0 0 3px rgba(255, 107, 107, 0.2)';
    input.focus();
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.boxShadow = '';
    }, 2000);
  }

  // 确认添加/编辑规则
  async function confirmRuleModal() {
    const body = document.getElementById('ruleModalBody');
    const enabled = body.querySelector('#modalRuleEnabled').checked;
    const isEdit = currentEditIndex !== null;

    if (currentModalType === 'redirect') {
      const domainInput = body.querySelector('#modalRuleDomain');
      const paramInput = body.querySelector('#modalRuleParam');
      const descInput = body.querySelector('#modalRuleDesc');
      const domain = domainInput.value.trim();
      const param = paramInput.value.trim();
      const description = descInput.value.trim();

      if (!domain) {
        showInputError(domainInput);
        showToast(i18n.getMessage('domainRequired'), 'error');
        return;
      }
      if (!param) {
        showInputError(paramInput);
        showToast(i18n.getMessage('paramRequired'), 'error');
        return;
      }

      const ruleData = {
        domain,
        param: param || 'target',
        enabled,
        description
      };

      if (isEdit) {
        currentConfig.redirectRules[currentEditIndex] = ruleData;
      } else {
        currentConfig.redirectRules.push(ruleData);
      }
      renderRedirectRules();
    } else if (currentModalType === 'tracking') {
      const domainInput = body.querySelector('#modalRuleDomain');
      const descInput = body.querySelector('#modalRuleDesc');
      const domain = domainInput.value.trim();
      const description = descInput.value.trim();
      const preventClick = body.querySelector('#modalRulePreventClick').checked;

      if (!domain) {
        showInputError(domainInput);
        showToast(i18n.getMessage('domainRequired'), 'error');
        return;
      }

      const removeAttrs = [];
      body.querySelectorAll('[data-field="modalRemoveAttributes"] .tag').forEach(tag => {
        removeAttrs.push(tag.childNodes[0].textContent.trim());
      });

      const cleanParams = [];
      body.querySelectorAll('[data-field="modalCleanUrlParams"] .tag').forEach(tag => {
        cleanParams.push(tag.childNodes[0].textContent.trim());
      });

      const ruleData = {
        domain,
        enabled,
        description,
        removeAttributes: removeAttrs,
        cleanUrlParams: cleanParams,
        preventClickRewrite: preventClick
      };

      if (isEdit) {
        currentConfig.trackingRules[currentEditIndex] = ruleData;
      } else {
        currentConfig.trackingRules.push(ruleData);
      }
      renderTrackingRules();
    }

    // 直接保存配置
    const success = await saveConfig(currentConfig);
    if (success) {
      showToast(i18n.getMessage('savedSuccess'), 'success');
    } else {
      showToast(i18n.getMessage('savedError'), 'error');
    }

    closeRuleModal();
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
