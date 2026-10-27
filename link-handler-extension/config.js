// 默认配置 - 链接处理器扩展
const DEFAULT_CONFIG = {
  // 重定向链接解析规则
  redirectRules: [
    {
      id: 'redirect-juejin',
      domain: 'link.juejin.cn',
      param: 'target',
      enabled: true,
      description: '掘金链接跳转'
    },
    {
      id: 'redirect-zhihu',
      domain: 'link.zhihu.com',
      param: 'target',
      enabled: true,
      description: '知乎链接跳转'
    },
    {
      id: 'redirect-weibo',
      domain: 'weibo.cn',
      param: 'url',
      enabled: true,
      description: '微博短链接'
    },
    {
      id: 'redirect-csdn',
      domain: 'link.csdn.net',
      param: 'target',
      enabled: true,
      description: 'CSDN 链接跳转'
    },
    {
      id: 'redirect-jianshu',
      domain: 'jianshu.com',
      param: 'to',
      pathPattern: '/go',
      enabled: true,
      description: '简书外链跳转'
    },
    {
      id: 'redirect-bilibili',
      domain: 'link.bilibili.com',
      param: 'url',
      enabled: true,
      description: 'B站链接跳转'
    },
    {
      id: 'redirect-jd',
      domain: 'link.jd.com',
      param: 'to',
      enabled: true,
      description: '京东联盟链接'
    },
    {
      id: 'redirect-taobao',
      domain: 's.click.taobao.com',
      param: 'u',
      enabled: true,
      description: '淘宝联盟链接'
    },
    {
      id: 'redirect-sspai',
      domain: 'sspai.com',
      param: 'target',
      pathPattern: '/link',
      enabled: true,
      description: '少数派链接跳转'
    },
    {
      id: 'redirect-reddit',
      domain: 'out.reddit.com',
      param: 'url',
      enabled: true,
      description: 'Reddit 出站链接'
    },
    {
      id: 'redirect-facebook',
      domain: 'facebook.com',
      param: 'u',
      pathPattern: '/l.php',
      enabled: true,
      description: 'Facebook 链接跳转'
    }
  ],

  // 跟踪清理规则
  trackingRules: [
    {
      id: 'tracking-bilibili',
      domain: 'bilibili.com',
      enabled: true,
      description: 'Bilibili 跟踪清理',
      removeAttributes: ['data-spmid', 'data-mod', 'data-idx', 'data-report-id'],
      preventClickRewrite: true,
      // 黑名单制：只删跟踪参数，保留 p（分P）、t（时间戳）等功能参数
      cleanUrlParams: [
        'spm_id_from', 'from_spmid', 'vd_source', 'from', 'seid',
        'share_source', 'share_medium', 'share_plat', 'share_session_id',
        'share_tag', 'timestamp', 'unique_k', 'up_id',
        '-Arouter', 'is_story_h5', 'broadcast_type', 'trackid'
      ]
    },
    {
      id: 'tracking-weibo',
      domain: 'weibo.com',
      enabled: true,
      description: '微博跟踪清理',
      removeAttributes: ['suda-uatrack', 'suda-data', 'action-data', 'bpfilter'],
      preventClickRewrite: true,
      cleanUrlParams: ['weibo_id', 'refer_flag']
    },
    {
      id: 'tracking-zhihu',
      domain: 'zhihu.com',
      enabled: true,
      description: '知乎跟踪清理',
      removeAttributes: ['data-za-detail-view-id', 'data-za-element-name', 'data-za-extra-module'],
      preventClickRewrite: false,
      cleanUrlParams: ['utm_content', 'utm_medium', 'utm_source']
    },
    {
      id: 'tracking-juejin',
      domain: 'juejin.cn',
      enabled: true,
      description: '掘金跟踪清理',
      removeAttributes: [],
      preventClickRewrite: false,
      cleanUrlParams: ['utm_source', 'utm_medium', 'utm_campaign']
    },
    {
      id: 'tracking-jianshu',
      domain: 'jianshu.com',
      enabled: true,
      description: '简书跟踪清理',
      removeAttributes: ['data-original'],
      preventClickRewrite: false,
      cleanUrlParams: ['utm_source', 'utm_medium']
    },
    {
      id: 'tracking-csdn',
      domain: 'csdn.net',
      enabled: true,
      description: 'CSDN 跟踪清理',
      removeAttributes: ['data-report-query', 'data-report-click'],
      preventClickRewrite: false,
      cleanUrlParams: []
    },
  ],

  // 白名单（域名后缀匹配，满足白名单的网站不处理链接）
  whitelist: ['localhost', '::1', '127.0.0.1', 'deepseek.com'],

  // 全局设置
  global: {
    removeTargetSameOrigin: true,
    enableRedirect: true,
    enableTracking: true,
    // 全局通用跟踪参数黑名单：对所有非白名单链接生效，与按域名规则叠加
    globalTrackingParams: [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid'
    ]
  }
};

// 存储格式版本：只保存与内置配置的差异，升级后新增内置规则可自动生效
const STORAGE_VERSION = 3;

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createRuleId(type) {
  const prefix = type === 'tracking' ? 'custom-tracking' : 'custom-redirect';
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return prefix + '-' + globalThis.crypto.randomUUID();
  }
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// 归一化主机名：统一大小写并去掉 IPv6 字面量两侧的方括号
function normalizeHostname(hostname) {
  return String(hostname || '').trim().replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized.length > 253) return false;

  if (normalized.includes(':')) {
    return /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/.test(normalized);
  }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    return normalized.split('.').every(octet => Number(octet) >= 0 && Number(octet) <= 255);
  }
  if (/^[0-9.]+$/.test(normalized)) return false;

  return normalized.split('.').every(label => {
    return label.length > 0 && label.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label);
  });
}

function isValidAttributeName(name) {
  return isNonEmptyString(name) && !/[\s"'<>/=]/.test(name);
}

function isValidStringList(values, allowEmpty = true) {
  return Array.isArray(values) && (allowEmpty || values.length > 0) && values.every(isNonEmptyString);
}

function validateRuleList(rules, type) {
  if (!Array.isArray(rules)) return false;
  const ids = new Set();

  for (const rule of rules) {
    if (!isPlainObject(rule) || !isNonEmptyString(rule.id) || ids.has(rule.id)) return false;
    if (!isNonEmptyString(rule.domain) || !isValidHostname(rule.domain)) return false;
    ids.add(rule.id);

    if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') return false;
    if (rule.description !== undefined && typeof rule.description !== 'string') return false;

    if (type === 'redirect') {
      if (!isNonEmptyString(rule.param)) return false;
      if (rule.pathPattern !== undefined &&
          (typeof rule.pathPattern !== 'string' || (rule.pathPattern && !rule.pathPattern.startsWith('/')))) {
        return false;
      }
    } else {
      if (!isValidStringList(rule.removeAttributes) || !rule.removeAttributes.every(isValidAttributeName)) return false;
      if (!isValidStringList(rule.cleanUrlParams)) return false;
      if (rule.preventClickRewrite !== undefined && typeof rule.preventClickRewrite !== 'boolean') return false;
    }
  }
  return true;
}

// 导入与保存共用的完整配置校验，拒绝会在渲染或链接处理中抛错的结构
function validateConfigStructure(config) {
  if (!isPlainObject(config)) return false;
  if (!validateRuleList(config.redirectRules, 'redirect')) return false;
  if (!validateRuleList(config.trackingRules, 'tracking')) return false;
  if (!Array.isArray(config.whitelist) || !config.whitelist.every(isValidHostname)) return false;
  if (!isPlainObject(config.global)) return false;

  for (const key of ['removeTargetSameOrigin', 'enableRedirect', 'enableTracking']) {
    if (config.global[key] !== undefined && typeof config.global[key] !== 'boolean') return false;
  }
  return isValidStringList(config.global.globalTrackingParams);
}

// 域名列表查找：精确匹配优先，其次后缀匹配（example.com 覆盖子域名），返回命中项或 null；白名单与各处规则查找共用
function findDomainMatch(hostname, domains) {
  if (!Array.isArray(domains) || domains.length === 0) return null;
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;

  let suffixMatch = null;
  for (const domain of domains) {
    const normalizedDomain = normalizeHostname(domain);
    if (normalized === normalizedDomain) return domain;
    if (!suffixMatch && normalized.endsWith('.' + normalizedDomain)) {
      suffixMatch = domain;
    }
  }
  return suffixMatch;
}

// 规范化对象（键名排序），用于深比较规则是否被用户修改过（与键顺序无关）
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach(key => {
      sorted[key] = canonicalize(value[key]);
    });
    return sorted;
  }
  return value;
}

function rulesEqual(a, b) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

// 拆分一组规则：按稳定 ID 分出「自定义规则 / 内置规则覆盖 / 被删除的内置规则」
function diffRules(defaultRules, fullRules, customs, overrides, removed) {
  const seen = new Set();
  fullRules.forEach(rule => {
    if (!rule || !rule.id) return;
    seen.add(rule.id);
    const builtin = defaultRules.find(r => r.id === rule.id);
    if (builtin) {
      if (!rulesEqual(builtin, rule)) {
        overrides[rule.id] = deepCopy(rule);
      }
    } else {
      customs.push(deepCopy(rule));
    }
  });
  defaultRules.forEach(rule => {
    if (!seen.has(rule.id)) removed.push(rule.id);
  });
}

// 将完整配置拆解为 diff（v3 存储格式）
function decomposeConfig(fullConfig) {
  const diff = {
    version: STORAGE_VERSION,
    customRedirectRules: [],
    customTrackingRules: [],
    redirectRuleOverrides: {},
    trackingRuleOverrides: {},
    removedBuiltinRedirectRules: [],
    removedBuiltinTrackingRules: [],
    whitelistAdded: [],
    whitelistRemoved: [],
    global: fullConfig.global ? { ...fullConfig.global } : {}
  };

  diffRules(
    DEFAULT_CONFIG.redirectRules, fullConfig.redirectRules || [],
    diff.customRedirectRules, diff.redirectRuleOverrides, diff.removedBuiltinRedirectRules
  );
  diffRules(
    DEFAULT_CONFIG.trackingRules, fullConfig.trackingRules || [],
    diff.customTrackingRules, diff.trackingRuleOverrides, diff.removedBuiltinTrackingRules
  );

  const fullWhitelist = fullConfig.whitelist || [];
  diff.whitelistAdded = fullWhitelist.filter(d => !DEFAULT_CONFIG.whitelist.includes(d));
  diff.whitelistRemoved = DEFAULT_CONFIG.whitelist.filter(d => !fullWhitelist.includes(d));

  return diff;
}

function applyConfigDiff(defaults, diff) {
  const removedRedirect = new Set(diff.removedBuiltinRedirectRules || []);
  const redirectOverrides = diff.redirectRuleOverrides || {};
  const redirectRules = defaults.redirectRules
    .filter(r => !removedRedirect.has(r.id))
    .map(r => redirectOverrides[r.id] ? deepCopy(redirectOverrides[r.id]) : deepCopy(r))
    .concat(deepCopy(diff.customRedirectRules || []));

  const removedTracking = new Set(diff.removedBuiltinTrackingRules || []);
  const trackingOverrides = diff.trackingRuleOverrides || {};
  const trackingRules = defaults.trackingRules
    .filter(r => !removedTracking.has(r.id))
    .map(r => trackingOverrides[r.id] ? deepCopy(trackingOverrides[r.id]) : deepCopy(r))
    .concat(deepCopy(diff.customTrackingRules || []));

  const removedWhitelist = new Set(diff.whitelistRemoved || []);
  const whitelist = defaults.whitelist
    .filter(d => !removedWhitelist.has(d))
    .concat((diff.whitelistAdded || []).filter(d => !defaults.whitelist.includes(d)));

  return {
    redirectRules,
    trackingRules,
    whitelist,
    global: { ...defaults.global, ...(diff.global || {}) }
  };
}

async function getConfig() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const result = await chrome.storage.sync.get('linkHandlerConfig');
      if (result.linkHandlerConfig) {
        return applyStoredConfig(DEFAULT_CONFIG, result.linkHandlerConfig);
      }
    }
  } catch {
    // 读取失败时静默回落默认配置
  }
  // 返回深拷贝，避免修改污染全局 DEFAULT_CONFIG
  return deepCopy(DEFAULT_CONFIG);
}

// 仅接受当前版本；其他或损坏数据直接回落默认配置，不执行迁移
function applyStoredConfig(defaults, stored) {
  if (stored && stored.version === STORAGE_VERSION) {
    return applyConfigDiff(defaults, stored);
  }

  return deepCopy(defaults);
}

// 构建「地址栏清洗」主机映射 { domain: [参数] }，供 content.js 下发到 spa-hook.js；
// 同域名多条跟踪规则的参数取并集，与链接清洗共用参数列表
function buildSanitizeHostMap(config) {
  const hosts = {};
  if (!config || !Array.isArray(config.trackingRules)) return hosts;
  // 总开关关闭时地址栏清洗一并停用
  if (config.global && config.global.enableTracking === false) return hosts;
  config.trackingRules.forEach(rule => {
    if (!rule || rule.enabled === false) return;
    if (!Array.isArray(rule.cleanUrlParams) || rule.cleanUrlParams.length === 0) return;
    const existing = Object.hasOwn(hosts, rule.domain) ? hosts[rule.domain] : [];
    Object.defineProperty(hosts, rule.domain, {
      value: [...new Set(existing.concat(rule.cleanUrlParams))],
      enumerable: true,
      configurable: true,
      writable: true
    });
  });
  return hosts;
}

async function saveConfig(config) {
  if (!validateConfigStructure(config)) {
    console.error('[Link Handler] Failed to save config: invalid configuration');
    return false;
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const dataToSave = decomposeConfig(config);
      await chrome.storage.sync.set({ linkHandlerConfig: dataToSave });
      // 验证写入内容与预期 diff 一致
      const verify = await chrome.storage.sync.get('linkHandlerConfig');
      if (!verify.linkHandlerConfig || !rulesEqual(verify.linkHandlerConfig, dataToSave)) {
        console.error('[Link Handler] Save verification failed: stored data differs');
        return false;
      }
      return true;
    }
  } catch (e) {
    console.error('[Link Handler] Failed to save config:', e);
  }
  return false;
}

// CommonJS 导出（供 Node 测试使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CONFIG,
    STORAGE_VERSION,
    getConfig,
    saveConfig,
    applyStoredConfig,
    decomposeConfig,
    applyConfigDiff,
    buildSanitizeHostMap,
    findDomainMatch,
    normalizeHostname,
    createRuleId,
    validateConfigStructure,
    isValidHostname,
    isValidAttributeName
  };
}
