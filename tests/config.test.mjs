// config.js 纯函数单元测试（ESM，node:test，无需任何依赖）
// 运行：node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  decomposeConfig,
  applyConfigDiff,
  applyStoredConfig,
  buildSanitizeHostMap
} from '../link-handler-extension/config.js';

// 测试用深拷贝
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- 基础工具 ----------

test('DEFAULT_CONFIG 包含预期的内置规则', () => {
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

// ---------- v2 diff 存储往返 ----------

test('默认配置 decompose 后 apply 往返不变（空 diff）', () => {
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

test('自定义规则 / 覆盖 / 删除 / 白名单 / 全局设置均可往返', () => {
  const full = clone(DEFAULT_CONFIG);

  // 自定义规则
  full.redirectRules.push({
    domain: 'example.com', param: 'target', enabled: true, description: '测试'
  });
  full.trackingRules.push({
    domain: 'example.org', enabled: true, description: '测试',
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
  assert.deepEqual(diff.customRedirectRules.map(r => r.domain), ['example.com']);
  assert.deepEqual(diff.customTrackingRules.map(r => r.domain), ['example.org']);
  assert.deepEqual(diff.redirectRuleOverrides['link.zhihu.com'], undefined);
  assert.ok(diff.removedBuiltinRedirectRules.includes('link.zhihu.com'));
  assert.deepEqual(diff.whitelistAdded, ['example.net']);
  assert.deepEqual(diff.whitelistRemoved, ['deepseek.com']);
  assert.equal(diff.global.enableTracking, false);

  const restored = applyConfigDiff(DEFAULT_CONFIG, diff);
  assert.deepEqual(restored, full);
});

test('规则字段顺序不影响 diff 判定（canonicalize）', () => {
  const b = { enabled: true, param: 'url', domain: 'x.com' };
  const diff = decomposeConfig({
    ...clone(DEFAULT_CONFIG),
    redirectRules: [
      ...DEFAULT_CONFIG.redirectRules.filter(r => r.domain !== 'link.juejin.cn'),
      b
    ]
  });
  // 字段顺序不同的同值规则不应被视为覆盖
  assert.deepEqual(diff.redirectRuleOverrides, {});
});

test('未知版本（含 v1 遗留）回落默认配置', () => {
  const legacy = { version: 1, redirectRules: [], trackingRules: [] };
  const restored = applyStoredConfig(DEFAULT_CONFIG, legacy);
  assert.deepEqual(restored, DEFAULT_CONFIG);
});

test('空/非对象存储数据回落默认配置', () => {
  assert.deepEqual(applyStoredConfig(DEFAULT_CONFIG, null), DEFAULT_CONFIG);
  assert.deepEqual(applyStoredConfig(DEFAULT_CONFIG, {}), DEFAULT_CONFIG);
  assert.deepEqual(applyStoredConfig(DEFAULT_CONFIG, undefined), DEFAULT_CONFIG);
});

// ---------- buildSanitizeHostMap ----------

test('所有启用且配置了 cleanUrlParams 的内置跟踪规则都进入清洗映射', () => {
  const hosts = buildSanitizeHostMap(DEFAULT_CONFIG);
  // csdn.net 的 cleanUrlParams 为空数组，不参与地址栏清洗
  assert.deepEqual(Object.keys(hosts), [
    'bilibili.com', 'weibo.com', 'zhihu.com', 'juejin.cn', 'jianshu.com'
  ]);
  // 参数列表与规则本身一致（单一数据源）
  const bilibili = DEFAULT_CONFIG.trackingRules.find(r => r.domain === 'bilibili.com');
  assert.deepEqual(hosts['bilibili.com'], bilibili.cleanUrlParams);
});

test('buildSanitizeHostMap 排除禁用规则与无参数规则', () => {
  const config = clone(DEFAULT_CONFIG);
  const bilibili = config.trackingRules.find(r => r.domain === 'bilibili.com');
  bilibili.enabled = false;

  const hosts = buildSanitizeHostMap(config);
  assert.ok(!('bilibili.com' in hosts));
  assert.ok('weibo.com' in hosts);
  assert.ok(!('csdn.net' in hosts)); // cleanUrlParams 为空
});

test('buildSanitizeHostMap 跟随全局跟踪总开关', () => {
  const config = clone(DEFAULT_CONFIG);
  config.global.enableTracking = false;
  // 地址栏清洗是跟踪清理的默认行为，总开关关闭时一并停用
  assert.deepEqual(buildSanitizeHostMap(config), {});
});

test('buildSanitizeHostMap 支持自定义规则且返回参数副本', () => {
  const config = clone(DEFAULT_CONFIG);
  config.trackingRules.push({
    domain: 'example.org', enabled: true,
    cleanUrlParams: ['utm_source', 'utm_medium']
  });

  const hosts = buildSanitizeHostMap(config);
  assert.deepEqual(hosts['example.org'], ['utm_source', 'utm_medium']);

  // 修改返回的数组不应影响原配置
  hosts['example.org'].push('hacked');
  const rule = config.trackingRules.find(r => r.domain === 'example.org');
  assert.deepEqual(rule.cleanUrlParams, ['utm_source', 'utm_medium']);
});

test('buildSanitizeHostMap 遵循全局 enableTracking 总开关', () => {
  const config = clone(DEFAULT_CONFIG);
  config.global.enableTracking = false;
  assert.deepEqual(buildSanitizeHostMap(config), {});
});

test('buildSanitizeHostMap 容忍空配置', () => {
  assert.deepEqual(buildSanitizeHostMap(null), {});
  assert.deepEqual(buildSanitizeHostMap({}), {});
});
