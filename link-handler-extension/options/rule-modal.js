// 规则编辑弹窗（设置页，ES module）
// 打开/关闭/键盘交互/表单确认；依赖由 options.js 调用 init(deps) 注入，避免双向耦合。
import { i18n } from './i18n.js';

// 依赖：{ getConfig, renderAll, saveNow, showToast, showInputError, tagHtml,
//       bindTagInputEvents, unbindTagInputEvents, collectTagValues }
let deps = null;

let currentModalType = null;
let currentEditIndex = null; // 当前编辑的规则索引，null 表示添加新模式
let modalTriggerEl = null; // 打开弹窗的触发元素，关闭弹窗后归还焦点

// 注入依赖并绑定静态按钮事件
function init(context) {
  deps = context;

  document.getElementById('closeRuleModal').addEventListener('click', close);
  document.getElementById('cancelRuleModal').addEventListener('click', close);
  document.getElementById('confirmRuleModal').addEventListener('click', confirm);
  // 点击遮罩关闭（事件目标是遮罩自身时）
  document.getElementById('ruleModal').addEventListener('click', (e) => {
    if (e.target.id === 'ruleModal') close();
  });
}

// type: 'redirect' | 'tracking'；editIndex 为 null 表示添加新规则
function open(type, editIndex = null) {
  currentModalType = type;
  currentEditIndex = editIndex;
  modalTriggerEl = document.activeElement;
  const modal = document.getElementById('ruleModal');
  const title = document.getElementById('ruleModalTitle');
  const body = document.getElementById('ruleModalBody');
  const confirmBtn = document.getElementById('confirmRuleModal');

  const config = deps.getConfig();
  const isEdit = editIndex !== null;
  const rule = isEdit
    ? (type === 'redirect' ? config.redirectRules[editIndex] : config.trackingRules[editIndex])
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
            <label for="modalRuleDomain">${i18n.getMessage('domain')}</label>
            <input type="text" id="modalRuleDomain" placeholder="${i18n.getMessage('domainPlaceholder')}">
          </div>
          <div class="form-group">
            <label for="modalRuleParam">${i18n.getMessage('param')}</label>
            <input type="text" id="modalRuleParam" placeholder="${i18n.getMessage('paramPlaceholder')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group full-width">
            <label for="modalRuleDesc">${i18n.getMessage('description')}</label>
            <input type="text" id="modalRuleDesc" placeholder="${i18n.getMessage('descPlaceholder')}">
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
            <label for="modalRuleDomain">${i18n.getMessage('domain')}</label>
            <input type="text" id="modalRuleDomain" placeholder="${i18n.getMessage('domainPlaceholder')}">
          </div>
          <div class="form-group">
            <label for="modalRuleDesc">${i18n.getMessage('description')}</label>
            <input type="text" id="modalRuleDesc" placeholder="${i18n.getMessage('descPlaceholder')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group full-width">
            <label for="modalRemoveAttrsInput">${i18n.getMessage('removeAttributes')}</label>
            <div class="tags-input" data-field="modalRemoveAttributes">
              ${removeAttrs.map(attr => deps.tagHtml(attr)).join('')}
              <input type="text" id="modalRemoveAttrsInput" placeholder="${i18n.getMessage('attrsPlaceholder')}">
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group full-width">
            <label for="modalCleanUrlParamsInput">${i18n.getMessage('cleanUrlParams')}</label>
            <div class="tags-input" data-field="modalCleanUrlParams">
              ${cleanParams.map(param => deps.tagHtml(param)).join('')}
              <input type="text" id="modalCleanUrlParamsInput" placeholder="${i18n.getMessage('attrsPlaceholder')}">
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

  // 通过 DOM 属性填充编辑值，避免把规则字段拼进 HTML 属性（引号可导致属性注入）
  const domainInput = body.querySelector('#modalRuleDomain');
  if (domainInput) domainInput.value = isEdit && rule ? (rule.domain || '') : '';
  const paramInput = body.querySelector('#modalRuleParam');
  if (paramInput) paramInput.value = isEdit && rule ? (rule.param || '') : 'target';
  const descInput = body.querySelector('#modalRuleDesc');
  if (descInput) descInput.value = isEdit && rule ? (rule.description || '') : '';

  modal.classList.add('show');
  // 弹窗打开期间监听键盘：Esc 关闭、Tab 焦点循环
  document.addEventListener('keydown', handleKeydown, true);

  // 仅跟踪规则有标签输入
  if (type === 'tracking') {
    deps.bindTagInputEvents(body);
  }

  const firstInput = body.querySelector('input[type="text"]');
  if (firstInput) firstInput.focus();
}

function close() {
  const modalBody = document.getElementById('ruleModalBody');
  deps.unbindTagInputEvents(modalBody);
  document.removeEventListener('keydown', handleKeydown, true);

  document.getElementById('ruleModal').classList.remove('show');
  currentModalType = null;
  currentEditIndex = null;

  // 焦点归还触发元素（触发元素可能已因列表重渲染被销毁，需先确认存在）
  if (modalTriggerEl && document.contains(modalTriggerEl)) {
    modalTriggerEl.focus();
  }
  modalTriggerEl = null;
}

// 弹窗键盘交互：Esc 关闭，Tab 键把焦点循环限制在弹窗内（焦点陷阱）
function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key !== 'Tab') return;

  const modal = document.getElementById('ruleModal');
  const focusable = Array.from(modal.querySelectorAll('button, input'))
    .filter(el => !el.disabled);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeOutside = !modal.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || activeOutside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || activeOutside)) {
    e.preventDefault();
    first.focus();
  }
}

async function confirm() {
  const body = document.getElementById('ruleModalBody');
  const config = deps.getConfig();
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
      deps.showInputError(domainInput);
      deps.showToast(i18n.getMessage('domainRequired'), 'error');
      return;
    }
    if (!param) {
      deps.showInputError(paramInput);
      deps.showToast(i18n.getMessage('paramRequired'), 'error');
      return;
    }

    // 以旧规则为基础展开，保留 UI 未覆盖的字段（如 pathPattern）
    const ruleData = {
      ...(isEdit ? config.redirectRules[currentEditIndex] : {}),
      domain,
      param,
      enabled,
      description
    };

    if (isEdit) {
      config.redirectRules[currentEditIndex] = ruleData;
    } else {
      config.redirectRules.push(ruleData);
    }
  } else if (currentModalType === 'tracking') {
    const domainInput = body.querySelector('#modalRuleDomain');
    const descInput = body.querySelector('#modalRuleDesc');
    const domain = domainInput.value.trim();
    const description = descInput.value.trim();
    const preventClick = body.querySelector('#modalRulePreventClick').checked;

    if (!domain) {
      deps.showInputError(domainInput);
      deps.showToast(i18n.getMessage('domainRequired'), 'error');
      return;
    }

    const removeAttrs = deps.collectTagValues(body, 'modalRemoveAttributes');
    const cleanParams = deps.collectTagValues(body, 'modalCleanUrlParams');

    // 以旧规则为基础展开，保留 UI 未覆盖的字段
    const ruleData = {
      ...(isEdit ? config.trackingRules[currentEditIndex] : {}),
      domain,
      enabled,
      description,
      removeAttributes: removeAttrs,
      cleanUrlParams: cleanParams,
      preventClickRewrite: preventClick
    };

    if (isEdit) {
      config.trackingRules[currentEditIndex] = ruleData;
    } else {
      config.trackingRules.push(ruleData);
    }
  } else {
    return;
  }

  // 先刷新再关闭：刷新会销毁触发元素，close() 已安全处理焦点归还
  await deps.saveNow(config);
  deps.renderAll();
  close();
}

// 由 options.js `import * as RuleModal` 使用
export { init, open };
