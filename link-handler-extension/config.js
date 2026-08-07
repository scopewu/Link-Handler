// 默认配置 - 链接处理器扩展
const DEFAULT_CONFIG = {
  // 重定向链接解析规则
  redirectRules: [
    {
      domain: 'link.juejin.cn',
      param: 'target',
      enabled: true,
      description: '掘金链接跳转'
    },
    {
      domain: 'link.zhihu.com',
      param: 'target',
      enabled: true,
      description: '知乎链接跳转'
    },
    {
      domain: 'weibo.cn',
      param: 'url',
      enabled: true,
      description: '微博短链接'
    },
    {
      domain: 'link.csdn.net',
      param: 'target',
      enabled: true,
      description: 'CSDN 链接跳转'
    },
    {
      domain: 'jianshu.com',
      param: 'to',
      pathPattern: '/go',
      enabled: true,
      description: '简书外链跳转'
    },
    {
      domain: 'link.bilibili.com',
      param: 'url',
      enabled: true,
      description: 'B站链接跳转'
    },
    {
      domain: 'link.jd.com',
      param: 'to',
      enabled: true,
      description: '京东联盟链接'
    },
    {
      domain: 's.click.taobao.com',
      param: 'u',
      enabled: true,
      description: '淘宝联盟链接'
    },
    {
      domain: 'sspai.com',
      param: 'target',
      pathPattern: '/link',
      enabled: true,
      description: '少数派链接跳转'
    },
    {
      domain: 'out.reddit.com',
      param: 'url',
      enabled: true,
      description: 'Reddit 出站链接'
    },
    {
      domain: 'facebook.com',
      param: 'u',
      pathPattern: '/l.php',
      enabled: true,
      description: 'Facebook 链接跳转'
    }
  ],

  // 跟踪清理规则（按域名匹配）
  trackingRules: [
    {
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
      domain: 'weibo.com',
      enabled: true,
      description: '微博跟踪清理',
      removeAttributes: ['suda-uatrack', 'suda-data', 'action-data', 'bpfilter'],
      preventClickRewrite: true,
      cleanUrlParams: ['weibo_id', 'refer_flag']
    },
    {
      domain: 'zhihu.com',
      enabled: true,
      description: '知乎跟踪清理',
      removeAttributes: ['data-za-detail-view-id', 'data-za-element-name', 'data-za-extra-module'],
      preventClickRewrite: false,
      cleanUrlParams: ['utm_content', 'utm_medium', 'utm_source']
    },
    {
      domain: 'juejin.cn',
      enabled: true,
      description: '掘金跟踪清理',
      removeAttributes: [],
      preventClickRewrite: false,
      cleanUrlParams: ['utm_source', 'utm_medium', 'utm_campaign']
    },
    {
      domain: 'jianshu.com',
      enabled: true,
      description: '简书跟踪清理',
      removeAttributes: ['data-original'],
      preventClickRewrite: false,
      cleanUrlParams: ['utm_source', 'utm_medium']
    },
    {
      domain: 'csdn.net',
      enabled: true,
      description: 'CSDN 跟踪清理',
      removeAttributes: ['data-report-query', 'data-report-click'],
      preventClickRewrite: false,
      cleanUrlParams: []
    },
    {
      domain: 'baidu.com',
      enabled: true,
      description: '百度搜索跟踪清理',
      removeAttributes: ['data-click'],
      preventClickRewrite: true,
      cleanUrlParams: ['rsv_bp', 'rsv_idx', 'ie']
    }
  ],

  // 白名单（域名后缀匹配，满足白名单的网站不处理链接）
  whitelist: ['localhost', '::1', '127.0.0.1', 'deepseek.com'],

  // 全局设置
  global: {
    removeTargetSameOrigin: true,    // 同域名/相对地址移除 target
    enableRedirect: true,            // 启用重定向解析
    enableTracking: true,            // 启用跟踪清理
    // 全局通用跟踪参数黑名单：对所有非白名单链接统一清除
    // 与按域名 tracking 规则叠加生效，跟随 enableTracking 总开关
    globalTrackingParams: [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid'
    ]
  }
};

// 存储格式版本：v2 起只保存用户配置与内置配置的差异（diff），
// 这样扩展升级后新增/修正的内置规则可以自动生效
const STORAGE_VERSION = 2;

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
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

// 拆分一组规则：与内置规则比对，分出「自定义规则 / 内置规则覆盖 / 被删除的内置规则」
function diffRules(defaultRules, fullRules, customs, overrides, removed) {
  const seen = new Set();
  fullRules.forEach(rule => {
    if (!rule || !rule.domain) return;
    seen.add(rule.domain);
    const builtin = defaultRules.find(r => r.domain === rule.domain);
    if (builtin) {
      if (!rulesEqual(builtin, rule)) {
        overrides[rule.domain] = deepCopy(rule);
      }
    } else {
      customs.push(deepCopy(rule));
    }
  });
  defaultRules.forEach(rule => {
    if (!seen.has(rule.domain)) removed.push(rule.domain);
  });
}

// 将完整配置拆解为 diff（v2 存储格式）
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

// 将 diff 应用回内置默认配置，得到完整配置
function applyConfigDiff(defaults, diff) {
  const removedRedirect = new Set(diff.removedBuiltinRedirectRules || []);
  const redirectOverrides = diff.redirectRuleOverrides || {};
  const redirectRules = defaults.redirectRules
    .filter(r => !removedRedirect.has(r.domain))
    .map(r => redirectOverrides[r.domain] ? deepCopy(redirectOverrides[r.domain]) : deepCopy(r))
    .concat(deepCopy(diff.customRedirectRules || []));

  const removedTracking = new Set(diff.removedBuiltinTrackingRules || []);
  const trackingOverrides = diff.trackingRuleOverrides || {};
  const trackingRules = defaults.trackingRules
    .filter(r => !removedTracking.has(r.domain))
    .map(r => trackingOverrides[r.domain] ? deepCopy(trackingOverrides[r.domain]) : deepCopy(r))
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

// 获取合并后的配置
async function getConfig() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const result = await chrome.storage.sync.get('linkHandlerConfig');
      if (result.linkHandlerConfig) {
        return applyStoredConfig(DEFAULT_CONFIG, result.linkHandlerConfig);
      }
    }
  } catch (e) {
    console.log('[Link Handler] Using default config');
  }
  // 返回深拷贝，避免修改污染全局 DEFAULT_CONFIG
  return deepCopy(DEFAULT_CONFIG);
}

// 将存储的配置数据还原为完整配置：
// 仅接受 v2 格式的 diff（applyConfigDiff）；无法识别的数据（含 v1 遗留）直接回落默认配置
function applyStoredConfig(defaults, stored) {
  if (stored && stored.version === STORAGE_VERSION) {
    return applyConfigDiff(defaults, stored);
  }

  return deepCopy(defaults);
}

// 构建「地址栏清洗」主机映射：{ domain: [参数列表] }
// 供 content.js 下发到 MAIN world 的 spa-hook.js 使用。
// 地址栏清洗是跟踪清理的默认行为：所有启用且配置了 cleanUrlParams 的跟踪规则
// 都会同时清洗该站点地址栏中的同名参数，与链接清洗共用同一参数列表（单一数据源）
function buildSanitizeHostMap(config) {
  const hosts = {};
  if (!config || !Array.isArray(config.trackingRules)) return hosts;
  // 跟踪清理被全局关闭时，地址栏清洗一并停用（跟随 enableTracking 总开关）
  if (config.global && config.global.enableTracking === false) return hosts;
  config.trackingRules.forEach(rule => {
    if (!rule || rule.enabled === false) return;
    if (!Array.isArray(rule.cleanUrlParams) || rule.cleanUrlParams.length === 0) return;
    hosts[rule.domain] = rule.cleanUrlParams.slice();
  });
  return hosts;
}

// 保存配置（只保存与内置配置的差异）
async function saveConfig(config) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const dataToSave = decomposeConfig(config);
      await chrome.storage.sync.set({ linkHandlerConfig: dataToSave });
      // 验证写入是否成功
      const verify = await chrome.storage.sync.get('linkHandlerConfig');
      if (!verify.linkHandlerConfig) {
        console.error('[Link Handler] Save verification failed: data not found in storage');
        return false;
      }
      return true;
    }
  } catch (e) {
    console.error('[Link Handler] Failed to save config:', e);
  }
  return false;
}

// 导出配置（用于 content script）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_CONFIG, getConfig, saveConfig, applyStoredConfig, decomposeConfig, applyConfigDiff, buildSanitizeHostMap };
}
