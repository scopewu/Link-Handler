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
      domain: 't.cn',
      param: 'url',
      enabled: true,
      description: '微博 t.cn 短链接'
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
      cleanUrlParams: []
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
    enableTracking: true             // 启用跟踪清理
  }
};

// 获取合并后的配置
async function getConfig() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const result = await chrome.storage.sync.get('linkHandlerConfig');
      if (result.linkHandlerConfig) {
        return mergeConfig(DEFAULT_CONFIG, result.linkHandlerConfig);
      }
    }
  } catch (e) {
    console.log('[Link Handler] Using default config');
  }
  // 返回深拷贝，避免修改污染全局 DEFAULT_CONFIG
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// 检查 hostname 是否匹配白名单（精确匹配优先，后缀匹配次之）
// 返回匹配到的白名单域名，未匹配返回 null。供 content.js 与 popup.js 复用。
function findWhitelistMatch(hostname, whitelist) {
  if (!whitelist || whitelist.length === 0) return null;
  const normalized = String(hostname).replace(/^\[/, '').replace(/\]$/, '');
  let suffixMatch = null;
  for (const domain of whitelist) {
    const normalizedDomain = String(domain).replace(/^\[/, '').replace(/\]$/, '');
    if (normalized === normalizedDomain) return normalizedDomain;
    if (normalized.endsWith('.' + normalizedDomain)) {
      suffixMatch = normalizedDomain;
    }
  }
  return suffixMatch;
}

// 按域名合并规则：默认规则为底，自定义覆盖同域名，新增规则追加在末尾
// 这样扩展升级时新增的默认规则可自动透传给老用户，同时保留用户改动
function mergeRulesByDomain(defaultRules, customRules) {
  const merged = [];
  const customByDomain = new Map();
  customRules.forEach(rule => {
    if (rule && rule.domain) customByDomain.set(rule.domain, rule);
  });
  defaultRules.forEach(defaultRule => {
    const customRule = customByDomain.get(defaultRule.domain);
    if (customRule) {
      merged.push(Object.assign({}, defaultRule, customRule));
      customByDomain.delete(defaultRule.domain);
    } else {
      merged.push(JSON.parse(JSON.stringify(defaultRule)));
    }
  });
  customByDomain.forEach(rule => merged.push(rule));
  return merged;
}

// 合并配置（规则按域名增量合并，global 浅合并，白名单整体替换）
function mergeConfig(defaults, custom) {
  const result = JSON.parse(JSON.stringify(defaults));

  if (custom.redirectRules) {
    result.redirectRules = mergeRulesByDomain(defaults.redirectRules, custom.redirectRules);
  }

  if (custom.trackingRules) {
    result.trackingRules = mergeRulesByDomain(defaults.trackingRules, custom.trackingRules);
  }

  if (custom.whitelist) {
    result.whitelist = [...custom.whitelist];
  }

  if (custom.global) {
    result.global = { ...result.global, ...custom.global };
  }

  return result;
}

// chrome.storage.sync 单项配额上限（QUOTA_BYTES_PER_ITEM = 8192，留少量余量）
const SYNC_QUOTA_BYTES_PER_ITEM = 8000;

// 保存配置
async function saveConfig(config) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      // 只保存用户自定义部分，不保存完整合并后的配置
      const dataToSave = {
        redirectRules: config.redirectRules,
        trackingRules: config.trackingRules,
        whitelist: Array.isArray(config.whitelist) ? config.whitelist : DEFAULT_CONFIG.whitelist,
        global: config.global
      };
      const payload = JSON.stringify({ linkHandlerConfig: dataToSave });
      // 预检配额：超出时给出明确提示而非让 set 静默失败
      if (payload.length > SYNC_QUOTA_BYTES_PER_ITEM) {
        console.error('[Link Handler] Config exceeds sync quota:', payload.length, 'bytes (limit', SYNC_QUOTA_BYTES_PER_ITEM + ')');
        return false;
      }
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
  module.exports = { DEFAULT_CONFIG, getConfig, saveConfig, mergeConfig, findWhitelistMatch };
}
