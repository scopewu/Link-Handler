// 设置页面逻辑（ES module）
// getConfig/saveConfig/DEFAULT_CONFIG 来自 config.js：它同时是 manifest 注入的
// content script（MV3 不支持模块），须保持 classic，模块直接引用其全局绑定。
import { i18n } from './i18n.js';
import * as RuleModal from './rule-modal.js';

let currentConfig = null;

let redirectSearchKeyword = '';
let trackingSearchKeyword = '';
let toastTimer = null;
let saveDebounceTimer = null;

// 常量
const TIMING = {
  INPUT_ERROR_DURATION: 2000,
  SAVE_DEBOUNCE: 500,
  TOAST_DURATION: 3000,
  TOAST_ERROR_DURATION: 5000
};

// 规则卡片操作图标
const ICONS = {
  edit: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
};

// 立即保存配置并按结果显示 Toast（successMessage 可覆盖默认的「保存成功」文案）
async function saveNow(config, successMessage) {
  const success = await saveConfig(config);
  if (success) {
    showToast(successMessage || i18n.getMessage('savedSuccess'), 'success');
  } else {
    showToast(i18n.getMessage('savedError'), 'error');
  }
  return success;
}

// 防抖保存
function debouncedSave(config) {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => saveNow(config), TIMING.SAVE_DEBOUNCE);
}

// 转义 HTML 特殊字符（输出会用于元素内容和双引号属性值两种上下文，引号必须一并转义）
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  // textContent->innerHTML 只转义 & < >，引号需手动补上，否则拼进属性值会被提前闭合
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 生成 tags-input 标签 HTML（全局参数/弹窗/回车新标签共用）
function tagHtml(value) {
  return `<span class="tag"><span class="tag-text">${escapeHtml(value)}</span><button type="button" class="tag-remove" aria-label="${i18n.getMessage('removeTag', [escapeHtml(value)])}">×</button></span>`;
}

// 重新渲染所有面板
function renderAll() {
  renderGlobalSettings();
  renderRedirectRules();
  renderTrackingRules();
  renderWhitelist();
}

async function init() {
  currentConfig = await getConfig();

  // 注入弹窗依赖（见 rule-modal.js）
  RuleModal.init({
    getConfig: () => currentConfig,
    renderAll,
    saveNow,
    showToast,
    showInputError,
    tagHtml,
    bindTagInputEvents,
    unbindTagInputEvents,
    collectTagValues
  });

  renderAll();
  bindEvents();
}

function renderWhitelist() {
  const container = document.getElementById('whitelistContainer');
  container.innerHTML = '';

  const whitelist = currentConfig.whitelist || [];

  if (whitelist.length === 0) {
    // 容器是 <ul>，空态也用 <li> 保持列表结构合法
    container.innerHTML = `<li class="empty-state">${i18n.getMessage('noWhitelistDomains')}</li>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  // 倒序遍历，最新添加的显示在最前面
  for (let i = whitelist.length - 1; i >= 0; i--) {
    const item = document.createElement('li');
    item.className = 'whitelist-item';
    item.dataset.index = i;
    item.innerHTML = `
      <span class="whitelist-domain">${escapeHtml(whitelist[i])}</span>
      <button class="btn-icon delete-whitelist" title="${i18n.getMessage('deleteRule')}" aria-label="${i18n.getMessage('deleteRule')}: ${escapeHtml(whitelist[i])}">
        ${ICONS.trash}
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

  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) && domain.split('.').every(octet => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  }) || /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(domain);
  const isDomain = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(domain);
  if (!isIp && !isDomain) {
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

  debouncedSave(currentConfig);
}

async function deleteWhitelistDomain(index) {
  if (!currentConfig.whitelist) return;
  currentConfig.whitelist.splice(index, 1);
  renderWhitelist();

  debouncedSave(currentConfig);
}

function renderGlobalSettings() {
  const global = currentConfig.global;
  document.getElementById('removeTargetSameOrigin').checked = global.removeTargetSameOrigin !== false;
  document.getElementById('enableRedirect').checked = global.enableRedirect !== false;
  document.getElementById('enableTracking').checked = global.enableTracking !== false;

  // 渲染全局通用跟踪参数标签（复用 tracking 规则的 .tags-input 结构）
  const params = Array.isArray(global.globalTrackingParams) ? global.globalTrackingParams : [];
  const container = document.getElementById('globalTrackingParamsInput');
  if (container) {
    container.innerHTML = params.map(p => tagHtml(p)).join('') +
      `<input type="text" id="globalTrackingParamsField" placeholder="${i18n.getMessage('globalTrackingParamsPlaceholder')}">`;
    bindTagInputEvents(container);
  }
}

// ---------- 规则列表渲染（重定向/跟踪规则共用一套渲染器） ----------

// 渲染规则列表；buildDetails(rule) 返回详情行片段，type 供委托事件区分类别
function renderRuleList(type, containerId, rules, keyword, buildDetails) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const filteredRules = filterRules(rules, keyword);

  if (filteredRules.length === 0) {
    container.innerHTML = `<div class="empty-state">${keyword ? i18n.getMessage('noSearchResults') : i18n.getMessage('noRules')}</div>`;
    return;
  }

  if (keyword) {
    const statsEl = document.createElement('div');
    statsEl.className = 'search-stats';
    statsEl.textContent = i18n.getMessage('searchResults', [filteredRules.length.toString(), rules.length.toString()]);
    container.appendChild(statsEl);
  }

  // 倒序展示，新添加的规则在上方；dataset.index 仍为真实索引，委托事件不受影响
  for (let i = filteredRules.length - 1; i >= 0; i--) {
    const { rule, index } = filteredRules[i];
    container.appendChild(createRuleCard(type, rule, index, buildDetails));
  }
}

function createRuleCard(type, rule, index, buildDetails) {
  const card = document.createElement('article');
  card.className = 'rule-card' + (rule.enabled === false ? ' disabled' : '');
  card.dataset.index = index;
  card.dataset.type = type;

  const ruleTitle = rule.description
    ? `${i18n.getMessage('ruleNumber', (index + 1).toString())} - ${rule.description}`
    : i18n.getMessage('ruleNumber', (index + 1).toString());

  const details = buildDetails(rule);

  card.innerHTML = `
    <div class="rule-card-header">
      <div class="rule-card-title">
        <span class="rule-status ${rule.enabled !== false ? 'enabled' : 'disabled'}"></span>
        <h3>${escapeHtml(ruleTitle)}</h3>
      </div>
      <div class="rule-card-actions">
        <label class="rule-toggle-label">
          <input type="checkbox" class="rule-toggle" ${rule.enabled !== false ? 'checked' : ''} aria-label="${escapeHtml(ruleTitle)}">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn-icon edit-rule" title="${i18n.getMessage('editRule')}" aria-label="${i18n.getMessage('editRule')}">
          ${ICONS.edit}
        </button>
        <button class="btn-icon delete-rule" title="${i18n.getMessage('deleteRule')}" aria-label="${i18n.getMessage('deleteRule')}">
          ${ICONS.trash}
        </button>
      </div>
    </div>
    <div class="rule-card-body">
      ${details.length > 0 ? details.join('') : `<span class="rule-detail empty">${i18n.getMessage('noConfig')}</span>`}
    </div>
  `;

  return card;
}

// 重定向规则详情行
function redirectRuleDetails(rule) {
  const details = [];
  if (rule.domain) {
    details.push(`<span class="rule-detail"><strong>${i18n.getMessage('domain')}:</strong> ${escapeHtml(rule.domain)}</span>`);
  }
  if (rule.param) {
    details.push(`<span class="rule-detail"><strong>${i18n.getMessage('param')}:</strong> ${escapeHtml(rule.param)}</span>`);
  }
  return details;
}

// 跟踪规则详情行
function trackingRuleDetails(rule) {
  const details = [];
  if (rule.domain) {
    details.push(`<span class="rule-detail"><strong>${i18n.getMessage('domain')}:</strong> ${escapeHtml(rule.domain)}</span>`);
  }
  if (rule.removeAttributes && rule.removeAttributes.length > 0) {
    details.push(`<span class="rule-detail"><strong>${i18n.getMessage('removeAttributes')}:</strong> ${escapeHtml(rule.removeAttributes.join(', '))}</span>`);
  }
  if (rule.cleanUrlParams && rule.cleanUrlParams.length > 0) {
    const paramsDisplay = rule.cleanUrlParams.includes('*') ? '*' : escapeHtml(rule.cleanUrlParams.join(', '));
    const paramsLabel = i18n.getMessage('cleanUrlParams').split('（')[0].split(' (')[0];
    details.push(`<span class="rule-detail"><strong>${escapeHtml(paramsLabel)}:</strong> ${paramsDisplay}</span>`);
  }
  if (rule.preventClickRewrite) {
    details.push(`<span class="rule-detail"><strong>${i18n.getMessage('preventClickRewrite')}:</strong> ✓</span>`);
  }
  return details;
}

function renderRedirectRules() {
  renderRuleList('redirect', 'redirectRules', currentConfig.redirectRules, redirectSearchKeyword, redirectRuleDetails);
}

function renderTrackingRules() {
  renderRuleList('tracking', 'trackingRules', currentConfig.trackingRules, trackingSearchKeyword, trackingRuleDetails);
}

// 验证导入配置的结构
function validateConfigStructure(config) {
  if (!config || typeof config !== 'object') return false;
  if (!Array.isArray(config.redirectRules)) return false;
  if (!Array.isArray(config.trackingRules)) return false;
  if (!config.global || typeof config.global !== 'object') return false;

  for (const rule of config.redirectRules) {
    if (!rule.domain || typeof rule.domain !== 'string') return false;
    if (!rule.param || typeof rule.param !== 'string') return false;
  }

  for (const rule of config.trackingRules) {
    if (!rule.domain || typeof rule.domain !== 'string') return false;
  }

  if (config.whitelist && !Array.isArray(config.whitelist)) return false;

  return true;
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
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const tabPanels = document.querySelectorAll('.tab-panel');

  // 激活指定标签页；setFocus 为 true 时把焦点移到按钮上（键盘导航场景）
  function activateTab(button, setFocus = false) {
    const tabId = button.dataset.tab;
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
      btn.tabIndex = -1;
    });
    tabPanels.forEach(panel => panel.classList.remove('active'));
    button.classList.add('active');
    button.setAttribute('aria-selected', 'true');
    button.tabIndex = 0;
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if (setFocus) button.focus();
    localStorage.setItem('linkHandlerActiveTab', tabId);
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => activateTab(button));
  });

  // 键盘导航（WAI-ARIA Tabs 模式：方向键/Home/End，自动激活）
  document.querySelector('.tab-nav').addEventListener('keydown', (e) => {
    const currentIndex = tabButtons.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabButtons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabButtons.length - 1;
    }
    if (nextIndex === null) return;

    e.preventDefault();
    activateTab(tabButtons[nextIndex], true);
  });

  const savedTab = localStorage.getItem('linkHandlerActiveTab');
  if (savedTab) {
    const savedButton = document.querySelector(`[data-tab="${savedTab}"]`);
    if (savedButton) savedButton.click();
  }
}

function bindEvents() {
  initTabs();

  const redirectSearchInput = document.getElementById('redirectSearch');
  if (redirectSearchInput) {
    redirectSearchInput.addEventListener('input', (e) => {
      redirectSearchKeyword = e.target.value;
      renderRedirectRules();
    });
  }

  const trackingSearchInput = document.getElementById('trackingSearch');
  if (trackingSearchInput) {
    trackingSearchInput.addEventListener('input', (e) => {
      trackingSearchKeyword = e.target.value;
      renderTrackingRules();
    });
  }

  document.getElementById('addRedirectRule').addEventListener('click', () => {
    RuleModal.open('redirect');
  });

  document.getElementById('addTrackingRule').addEventListener('click', () => {
    RuleModal.open('tracking');
  });

  // 白名单表单提交（点击按钮或在输入框按回车均触发 submit）
  document.getElementById('whitelistForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addWhitelistDomain();
  });

  // 全局设置实时保存
  document.getElementById('removeTargetSameOrigin').addEventListener('change', autoSaveGlobalSettings);
  document.getElementById('enableRedirect').addEventListener('change', autoSaveGlobalSettings);
  document.getElementById('enableTracking').addEventListener('change', autoSaveGlobalSettings);

  // 全局参数标签：回车/删除已是 document 级委托，此处监听容器变化触发防抖保存
  const globalParamsInput = document.getElementById('globalTrackingParamsInput');
  if (globalParamsInput) {
    globalParamsInput.addEventListener('input', saveGlobalTrackingParams);
    globalParamsInput.addEventListener('click', (e) => {
      if (e.target.closest('.tag-remove')) saveGlobalTrackingParams();
    });
  }

  document.getElementById('resetSettings').addEventListener('click', resetSettings);

  document.getElementById('exportSettings').addEventListener('click', exportSettings);

  document.getElementById('importSettings').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importSettings);

  // 委托事件：删除规则、切换启用状态、编辑规则、标签删除
  document.addEventListener('click', handleDelegatedClick);
  document.addEventListener('change', handleDelegatedChange);
  document.addEventListener('click', handleTagRemove);
}

// ---------- 标签输入部件（tags-input，全局参数与弹窗共用） ----------

function bindTagInputEvents(container) {
  const tagInputs = container.querySelectorAll('.tags-input input');
  tagInputs.forEach(input => {
    input.addEventListener('keydown', handleTagInput);
  });
}

function unbindTagInputEvents(container) {
  const tagInputs = container.querySelectorAll('.tags-input input');
  tagInputs.forEach(input => {
    input.removeEventListener('keydown', handleTagInput);
  });
}

// 处理标签输入（回车/逗号提交）
function handleTagInput(e) {
  if (e.key !== 'Enter' && e.key !== ',') return;

  e.preventDefault();
  const input = e.target;
  const value = input.value.trim();
  if (!value) return;

  const tagsInput = input.closest('.tags-input');
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.innerHTML = tagHtml(value);
  tagsInput.insertBefore(tag, input);
  input.value = '';
}

// 标签删除（document 级委托）
function handleTagRemove(e) {
  if (!e.target.closest('.tag-remove')) return;
  e.target.closest('.tag').remove();
}

// 收集标签容器中的所有值，包括输入框里尚未按回车提交的残留文本
function collectTagValues(body, field) {
  const values = [];
  body.querySelectorAll('[data-field="' + field + '"] .tag').forEach(tag => {
    const textSpan = tag.querySelector('.tag-text');
    const value = textSpan ? textSpan.textContent.trim() : tag.childNodes[0].textContent.trim();
    if (value) values.push(value);
  });
  const container = body.querySelector('[data-field="' + field + '"]');
  const pendingInput = container ? container.querySelector('input') : null;
  if (pendingInput && pendingInput.value.trim()) {
    values.push(pendingInput.value.trim());
  }
  return values;
}

// ---------- 委托事件 ----------

// 委托点击（closest 从自身开始向上查找，天然覆盖按钮与其内部）
async function handleDelegatedClick(e) {
  const ruleCard = e.target.closest('.rule-card');

  // 删除规则
  if (e.target.closest('.delete-rule')) {
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

    debouncedSave(currentConfig);
  }

  // 编辑规则
  if (e.target.closest('.edit-rule')) {
    if (!ruleCard) return;
    const index = parseInt(ruleCard.dataset.index);
    RuleModal.open(ruleCard.dataset.type, index);
  }

  // 删除白名单域名
  if (e.target.closest('.delete-whitelist')) {
    const whitelistItem = e.target.closest('.whitelist-item');
    if (whitelistItem) {
      const index = parseInt(whitelistItem.dataset.index);
      deleteWhitelistDomain(index);
    }
  }
}

// 委托变更（规则启用开关）
async function handleDelegatedChange(e) {
  const ruleCard = e.target.closest('.rule-card');
  if (!ruleCard) return;

  const index = parseInt(ruleCard.dataset.index);
  const type = ruleCard.dataset.type;

  if (e.target.classList.contains('rule-toggle')) {
    if (type === 'redirect') {
      currentConfig.redirectRules[index].enabled = e.target.checked;
    } else if (type === 'tracking') {
      currentConfig.trackingRules[index].enabled = e.target.checked;
    }
    ruleCard.classList.toggle('disabled', !e.target.checked);

    debouncedSave(currentConfig);
  }
}

// ---------- 全局设置 ----------

// 自动保存全局设置
function autoSaveGlobalSettings() {
  // 用 spread 保留 globalTrackingParams 等 UI 未覆盖的字段，
  // 否则重建对象会把这些字段擦掉
  currentConfig.global = {
    ...currentConfig.global,
    removeTargetSameOrigin: document.getElementById('removeTargetSameOrigin').checked,
    enableRedirect: document.getElementById('enableRedirect').checked,
    enableTracking: document.getElementById('enableTracking').checked
  };

  debouncedSave(currentConfig);
}

// 收集并保存全局通用跟踪参数
function saveGlobalTrackingParams() {
  const values = collectTagValues(document.getElementById('tab-tracking'), 'globalTrackingParams');
  currentConfig.global = { ...currentConfig.global, globalTrackingParams: values };
  debouncedSave(currentConfig);
}

// ---------- 恢复默认 / 导入 / 导出 ----------

async function resetSettings() {
  if (!confirm(i18n.getMessage('resetConfirm'))) return;

  currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  await saveNow(currentConfig, i18n.getMessage('resetSettings'));
  renderAll();
}

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

function importSettings(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const imported = JSON.parse(event.target.result);

      if (!validateConfigStructure(imported)) {
        throw new Error(i18n.getMessage('importError'));
      }

      currentConfig = imported;
      await saveNow(currentConfig, i18n.getMessage('importSettings'));
      renderAll();
    } catch (err) {
      showToast(i18n.getMessage('importError') + ': ' + err.message, 'error');
    }
  };
  reader.readAsText(file);

  e.target.value = '';
}

// ---------- 通用 UI 反馈 ----------

function showInputError(input) {
  input.style.borderColor = 'var(--accent-coral)';
  input.style.boxShadow = '0 0 0 3px rgba(255, 107, 107, 0.2)';
  input.focus();
  setTimeout(() => {
    input.style.borderColor = '';
    input.style.boxShadow = '';
  }, TIMING.INPUT_ERROR_DURATION);
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  // 错误提示需要屏幕阅读器立即打断播报，普通提示排队播报
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.textContent = message;
  toast.className = 'toast show ' + type;

  if (toastTimer) clearTimeout(toastTimer);
  const duration = type === 'error' ? TIMING.TOAST_ERROR_DURATION : TIMING.TOAST_DURATION;
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// 模块 defer 语义，DOM 已就绪，直接启动
init();
