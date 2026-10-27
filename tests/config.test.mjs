// config.js 纯函数单元测试（ESM，node:test，无需任何依赖）
// 运行：node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  STORAGE_VERSION,
  decomposeConfig,
  applyConfigDiff,
  applyStoredConfig,
  buildSanitizeHostMap,
  findDomainMatch,
  createRuleId,
  validateConfigStructure,
  saveConfig
} from '../link-handler-extension/config.js';

// 测试用深拷贝
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('DEFAULT_CONFIG contains expected built-in rules', () => {
  const redirectDomains = DEFAULT_CONFIG.redirectRules.map(r => r.domain);
  const trackingDomains = DEFAULT_CONFIG.trackingRules.map(r => r.domain);

  // 重定向规则
  assert.ok(redirectDomains.includes('link.juejin.cn'));
  assert.ok(redirectDomains.includes('link.zhihu.com'));
  assert.ok(redirectDomains.includes('weibo.cn'));
  assert.ok(redirectDomains.includes('jianshu.com'));
  // t.cn 短链不携带 url 参数，规则永远无法匹配，已移除
  assert.ok(!redirectDomains.includes('t.cn'));

  // 简书外链跳转：links.jianshu.com/go?to=...（links 为 jianshu.com 子域名，后缀匹配生效）
  const jianshu = DEFAULT_CONFIG.redirectRules.find(r => r.domain === 'jianshu.com');
  assert.equal(jianshu.param, 'to');
  assert.equal(jianshu.pathPattern, '/go');

  // 跟踪规则
  assert.ok(trackingDomains.includes('bilibili.com'));
});

test('default config survives a decompose/apply round trip with an empty diff', () => {
  const diff = decomposeConfig(DEFAULT_CONFIG);
  // 空 diff 的全部列表字段应为空
  assert.deepEqual(diff.customRedirectRules, []);
  assert.deepEqual(diff.customTrackingRules, []);
  assert.deepEqual(diff.redirectRuleOverrides, {});
  assert.deepEqual(diff.trackingRuleOverrides, {});
  assert.deepEqual(diff.removedBuiltinRedirectRules, []);
  assert.deepEqual(diff.removedBuiltinTrackingRules, []);
  assert.deepEqual(diff.whitelistAdded, []);
  assert.deepEqual(diff.whitelistRemoved, []);

  const restored = applyConfigDiff(DEFAULT_CONFIG, diff);
  assert.deepEqual(restored, DEFAULT_CONFIG);
});

test('custom rules, overrides, removals, whitelist, and global settings round-trip', () => {
  const full = clone(DEFAULT_CONFIG);

  // 自定义规则
  full.redirectRules.push({
    id: 'custom-redirect-example', domain: 'example.com',
    param: 'target', enabled: true, description: '测试'
  });
  full.trackingRules.push({
    id: 'custom-tracking-example', domain: 'example.org', enabled: true, description: '测试',
    removeAttributes: [], cleanUrlParams: ['utm_source']
  });

  // 覆盖内置规则（改 bilibili 的参数列表）
  full.trackingRules.find(r => r.domain === 'bilibili.com').cleanUrlParams = ['spm_id_from'];

  // 删除内置规则
  full.redirectRules = full.redirectRules.filter(r => r.domain !== 'link.zhihu.com');

  // 白名单增删
  full.whitelist.push('example.net');
  full.whitelist = full.whitelist.filter(d => d !== 'deepseek.com');

  // 全局设置
  full.global.enableTracking = false;
  full.global.globalTrackingParams = ['foo'];

  const diff = decomposeConfig(full);
  assert.equal(diff.version, STORAGE_VERSION);
  assert.deepEqual(diff.customRedirectRules.map(r => r.domain), ['example.com']);
  assert.deepEqual(diff.customTrackingRules.map(r => r.domain), ['example.org']);
  assert.deepEqual(diff.redirectRuleOverrides['redirect-zhihu'], undefined);
  assert.ok(diff.removedBuiltinRedirectRules.includes('redirect-zhihu'));
  assert.deepEqual(diff.whitelistAdded, ['example.net']);
  assert.deepEqual(diff.whitelistRemoved, ['deepseek.com']);
  assert.equal(diff.global.enableTracking, false);

  const restored = applyConfigDiff(DEFAULT_CONFIG, diff);
  assert.deepEqual(restored, full);
});

test('rule field order does not affect diff detection (canonicalize)', () => {
  const original = DEFAULT_CONFIG.redirectRules.find(r => r.id === 'redirect-juejin');
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  const full = clone(DEFAULT_CONFIG);
  full.redirectRules = full.redirectRules.map(rule => rule.id === original.id ? reordered : rule);

  const diff = decomposeConfig(full);
  // 字段顺序不同的同值规则不应被视为覆盖
  assert.deepEqual(diff.redirectRuleOverrides, {});
});

test('non-current storage versions fall back to defaults', () => {
  const invalid = { version: -1, redirectRules: [], trackingRules: [] };
  const restored = applyStoredConfig(DEFAULT_CONFIG, invalid);
  assert.deepEqual(restored, DEFAULT_CONFIG);
});

test('empty or non-object storage data falls back to defaults', () => {
  assert.deepEqual(applyStoredConfig(DEFAULT_CONFIG, null), DEFAULT_CONFIG);
  assert.deepEqual(applyStoredConfig(DEFAULT_CONFIG, {}), DEFAULT_CONFIG);
  assert.deepEqual(applyStoredConfig(DEFAULT_CONFIG, undefined), DEFAULT_CONFIG);
});

test('findDomainMatch prefers exact matches over suffix matches', () => {
  const domains = ['example.com', 'a.example.com'];
  // 主机名 a.example.com 同时命中两条规则，应返回精确匹配项
  assert.equal(findDomainMatch('a.example.com', domains), 'a.example.com');
  assert.equal(findDomainMatch('example.com', domains), 'example.com');
});

test('findDomainMatch suffix matching covers subdomains (whitelist semantics)', () => {
  assert.equal(findDomainMatch('chat.deepseek.com', ['deepseek.com']), 'deepseek.com');
  assert.equal(findDomainMatch('links.jianshu.com', ['jianshu.com']), 'jianshu.com');
  // 后缀必须落在域名边界上：notdeepseek.com 不得命中 deepseek.com
  assert.equal(findDomainMatch('notdeepseek.com', ['deepseek.com']), null);
  assert.equal(findDomainMatch('deepseek.com.evil.com', ['deepseek.com']), null);
});

test('findDomainMatch tolerates IPv6 literal brackets', () => {
  assert.equal(findDomainMatch('[::1]', ['::1']), '::1');
  assert.equal(findDomainMatch('::1', ['[::1]']), '[::1]');
});

test('findDomainMatch returns null for empty lists and empty hostnames', () => {
  assert.equal(findDomainMatch('example.com', []), null);
  assert.equal(findDomainMatch('example.com', null), null);
  assert.equal(findDomainMatch('', ['example.com']), null);
  assert.equal(findDomainMatch(null, ['example.com']), null);
});

test('all enabled built-in tracking rules with cleanUrlParams enter the sanitize map', () => {
  const hosts = buildSanitizeHostMap(DEFAULT_CONFIG);
  // csdn.net 的 cleanUrlParams 为空数组，不参与地址栏清洗
  assert.deepEqual(Object.keys(hosts), [
    'bilibili.com', 'weibo.com', 'zhihu.com', 'juejin.cn', 'jianshu.com'
  ]);
  // 参数列表与规则本身一致（单一数据源）
  const bilibili = DEFAULT_CONFIG.trackingRules.find(r => r.domain === 'bilibili.com');
  assert.deepEqual(hosts['bilibili.com'], bilibili.cleanUrlParams);
});

test('buildSanitizeHostMap excludes disabled rules and rules without params', () => {
  const config = clone(DEFAULT_CONFIG);
  const bilibili = config.trackingRules.find(r => r.domain === 'bilibili.com');
  bilibili.enabled = false;

  const hosts = buildSanitizeHostMap(config);
  assert.ok(!('bilibili.com' in hosts));
  assert.ok('weibo.com' in hosts);
  assert.ok(!('csdn.net' in hosts)); // cleanUrlParams 为空
});

test('buildSanitizeHostMap follows the global tracking toggle', () => {
  const config = clone(DEFAULT_CONFIG);
  config.global.enableTracking = false;
  // 地址栏清洗是跟踪清理的默认行为，总开关关闭时一并停用
  assert.deepEqual(buildSanitizeHostMap(config), {});
});

test('buildSanitizeHostMap supports custom rules and returns parameter copies', () => {
  const config = clone(DEFAULT_CONFIG);
  config.trackingRules.push({
    id: 'custom-tracking-example', domain: 'example.org', enabled: true,
    cleanUrlParams: ['utm_source', 'utm_medium']
  });

  const hosts = buildSanitizeHostMap(config);
  assert.deepEqual(hosts['example.org'], ['utm_source', 'utm_medium']);

  // 修改返回的数组不应影响原配置
  hosts['example.org'].push('hacked');
  const rule = config.trackingRules.find(r => r.domain === 'example.org');
  assert.deepEqual(rule.cleanUrlParams, ['utm_source', 'utm_medium']);
});

test('buildSanitizeHostMap merges parameters from multiple same-domain rules', () => {
  const config = clone(DEFAULT_CONFIG);
  config.trackingRules.push({
    id: 'custom-tracking-bilibili-extra',
    domain: 'bilibili.com',
    enabled: true,
    removeAttributes: [],
    cleanUrlParams: ['custom_tracker', 'spm_id_from']
  });

  const hosts = buildSanitizeHostMap(config);
  assert.ok(hosts['bilibili.com'].includes('spm_id_from'));
  assert.ok(hosts['bilibili.com'].includes('custom_tracker'));
  // 同名参数不重复
  assert.equal(hosts['bilibili.com'].filter(p => p === 'spm_id_from').length, 1);
});

test('buildSanitizeHostMap tolerates empty configs', () => {
  assert.deepEqual(buildSanitizeHostMap(null), {});
  assert.deepEqual(buildSanitizeHostMap({}), {});
});

test('multiple custom rules for one domain round-trip completely', () => {
  const full = clone(DEFAULT_CONFIG);
  full.redirectRules.push({
    id: 'custom-zhihu-other-path',
    domain: 'link.zhihu.com',
    param: 'url',
    pathPattern: '/other',
    enabled: true,
    description: '同域名第二条规则'
  });

  const restored = applyConfigDiff(DEFAULT_CONFIG, decomposeConfig(full));
  assert.equal(restored.redirectRules.length, DEFAULT_CONFIG.redirectRules.length + 1);
  assert.equal(restored.redirectRules.filter(r => r.domain === 'link.zhihu.com').length, 2);
  assert.deepEqual(restored.redirectRules.at(-1), full.redirectRules.at(-1));
});

test('full config validation rejects shapes that break processing or rendering', () => {
  assert.ok(validateConfigStructure(DEFAULT_CONFIG));

  const stringParams = clone(DEFAULT_CONFIG);
  stringParams.trackingRules[0].cleanUrlParams = 'utm_source';
  assert.equal(validateConfigStructure(stringParams), false);

  const objectAttrs = clone(DEFAULT_CONFIG);
  objectAttrs.trackingRules[0].removeAttributes = {};
  assert.equal(validateConfigStructure(objectAttrs), false);

  const duplicateId = clone(DEFAULT_CONFIG);
  duplicateId.redirectRules.push({ ...duplicateId.redirectRules[0] });
  assert.equal(validateConfigStructure(duplicateId), false);

  const badPath = clone(DEFAULT_CONFIG);
  badPath.redirectRules[0].pathPattern = 'go';
  assert.equal(validateConfigStructure(badPath), false);

  const badAttribute = clone(DEFAULT_CONFIG);
  badAttribute.trackingRules[0].removeAttributes = ['data track'];
  assert.equal(validateConfigStructure(badAttribute), false);

  const badGlobal = clone(DEFAULT_CONFIG);
  badGlobal.global.globalTrackingParams = 'utm_source';
  assert.equal(validateConfigStructure(badGlobal), false);
});

test('createRuleId generates distinct IDs with type prefixes', () => {
  const redirectA = createRuleId('redirect');
  const redirectB = createRuleId('redirect');
  const tracking = createRuleId('tracking');

  assert.notEqual(redirectA, redirectB);
  assert.ok(redirectA.startsWith('custom-redirect-'));
  assert.ok(tracking.startsWith('custom-tracking-'));
});

test('saveConfig rejects invalid configs without writing storage', async () => {
  let storageSetCalled = false;
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({}),
        set: async () => { storageSetCalled = true; }
      }
    }
  };

  try {
    const invalid = clone(DEFAULT_CONFIG);
    invalid.trackingRules[0].cleanUrlParams = 'utm_source';
    assert.equal(await saveConfig(invalid), false);
    assert.equal(storageSetCalled, false);
  } finally {
    delete globalThis.chrome;
  }
});
