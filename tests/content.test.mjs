// content.js 核心链路测试：用 VM 执行真实脚本，不依赖浏览器或 jsdom
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const configModule = require('../link-handler-extension/config.js');
const { DEFAULT_CONFIG, findDomainMatch, buildSanitizeHostMap } = configModule;
const clone = value => JSON.parse(JSON.stringify(value));

class FakeLink {
  constructor(href, attributes = {}) {
    this.attributes = { ...attributes };
    this.dataset = {};
    this.tagName = 'A';
    this.nodeType = 1;
    this.href = href;
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
  }

  get href() { return this._href; }
  set href(value) {
    this._href = value == null ? '' : String(value);
    if (value == null) delete this.attributes.href;
    else this.attributes.href = this._href;
  }

  getAttribute(name) {
    return name === 'href' ? (this._href ?? null) : (this.attributes[name] ?? null);
  }

  setAttribute(name, value) {
    if (name === 'href') this.href = value;
    else this.attributes[name] = String(value);
  }

  hasAttribute(name) {
    return name === 'href' ? this._href != null : Object.hasOwn(this.attributes, name);
  }

  removeAttribute(name) {
    if (name.includes(' ')) throw new Error('Invalid character in attribute name');
    if (name === 'href') this._href = null;
    delete this.attributes[name];
  }

  getAttributeNames() { return Object.keys(this.attributes); }
  querySelectorAll() { return []; }
}

class FakeMessageChannel {
  constructor() {
    this.port1 = { postMessage() {} };
    this.port2 = {};
  }
}

function createHarness(stored) {
  let storageListener;
  const observers = [];
  const elements = [];
  const postedMessages = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }

  const document = {
    readyState: 'loading',
    body: {},
    documentElement: {},
    elements,
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector.startsWith('a[href]')) {
        return elements.filter(el => el.tagName === 'A' && el.hasAttribute('href') && !el.hasAttribute('data-link-handler-processed'));
      }
      if (selector === '[data-link-handler-processed]') {
        return elements.filter(el => el.hasAttribute('data-link-handler-processed'));
      }
      if (selector === '[data-link-handler-prevented]') {
        return elements.filter(el => el.hasAttribute('data-link-handler-prevented'));
      }
      return [];
    }
  };

  const window = {
    addEventListener() {},
    postMessage(message, targetOrigin, transfer) {
      postedMessages.push({ message, targetOrigin, transfer });
    }
  };

  const context = {
    console: { ...console, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    MessageChannel: FakeMessageChannel,
    document,
    location: { hostname: 'example.com', href: 'https://example.com/', origin: 'https://example.com' },
    window,
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: FakeMutationObserver,
    requestIdleCallback(fn) { fn(); return 1; },
    cancelIdleCallback() {},
    getConfig: async () => clone(stored),
    findDomainMatch,
    buildSanitizeHostMap,
    normalizeHostname: configModule.normalizeHostname,
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { onChanged: { addListener(fn) { storageListener = fn; } } }
    }
  };

  let source = fs.readFileSync(new URL('../link-handler-extension/content.js', import.meta.url), 'utf8');
  source = source.replace(/\}\)\(\);\s*$/, `
    window.__test = { init, unwrapRedirectLink, processLink, batchProcessLinks };
  })();`);
  vm.runInNewContext(source, context);

  return {
    api: window.__test,
    observers,
    elements,
    postedMessages,
    notifyStorage: (...args) => storageListener(...args)
  };
}

function childListMutation(link) {
  return [{ type: 'childList', addedNodes: [link] }];
}

function hrefMutation(link) {
  return [{ type: 'attributes', attributeName: 'href', target: link }];
}

test('解包保留目标 URL 内部已编码的参数', () => {
  const { api } = createHarness(clone(DEFAULT_CONFIG));
  const target = 'https://example.com/?next=' + encodeURIComponent('https://other.com/?a=1&b=2');
  const link = new FakeLink('https://link.zhihu.com/?target=' + encodeURIComponent(target));

  assert.equal(api.unwrapRedirectLink(link, { param: 'target' }), true);
  const rewritten = new URL(link.href);
  assert.equal(rewritten.searchParams.get('next'), 'https://other.com/?a=1&b=2');
  assert.equal(rewritten.searchParams.get('b'), null);
});

test('整体双重编码的目标仍会被兼容解码一次', () => {
  const { api } = createHarness(clone(DEFAULT_CONFIG));
  const target = 'https://example.com/path?next=' + encodeURIComponent('https://other.com/?a=1&b=2');
  const outer = 'https://link.zhihu.com/?target=' + encodeURIComponent(encodeURIComponent(target));
  const link = new FakeLink(outer);

  assert.equal(api.unwrapRedirectLink(link, { param: 'target' }), true);
  const rewritten = new URL(link.href);
  assert.equal(rewritten.searchParams.get('next'), 'https://other.com/?a=1&b=2');
  assert.equal(rewritten.searchParams.get('b'), null);
});

test('热更新加入白名单会停止观察器并拒绝新链接', async () => {
  const stored = clone(DEFAULT_CONFIG);
  const { api, observers, notifyStorage } = createHarness(stored);
  await api.init();
  assert.equal(observers[0].connected, true);

  stored.whitelist.push('example.com');
  notifyStorage({ linkHandlerConfig: {} }, 'sync');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(observers[0].connected, false);

  const link = new FakeLink('https://example.com/path?utm_source=ad&x=1');
  observers[0].callback(childListMutation(link));
  assert.equal(link.href, 'https://example.com/path?utm_source=ad&x=1');
  assert.equal(link.hasAttribute('data-link-handler-processed'), false);
});

test('href 删除后重新添加不会漏处理', async () => {
  const { api, observers } = createHarness(clone(DEFAULT_CONFIG));
  await api.init();

  const link = new FakeLink('https://example.com/?utm_source=old&x=1');
  observers[0].callback(childListMutation(link));
  assert.equal(link.href, 'https://example.com/?x=1');

  link.removeAttribute('href');
  observers[0].callback(hrefMutation(link));
  link.href = 'https://example.com/?utm_source=new&x=2';
  observers[0].callback(hrefMutation(link));

  assert.equal(link.href, 'https://example.com/?x=2');
  assert.equal(link.hasAttribute('data-link-handler-processed'), true);
});

test('同域名多条重定向规则按路径分别生效', async () => {
  const stored = clone(DEFAULT_CONFIG);
  stored.redirectRules.push(
    { id: 'custom-go', domain: 'redirect.test', param: 'to', pathPattern: '/go', enabled: true },
    { id: 'custom-jump', domain: 'redirect.test', param: 'url', pathPattern: '/jump', enabled: true }
  );
  const { api } = createHarness(stored);
  await api.init();

  const go = new FakeLink('https://redirect.test/go?to=' + encodeURIComponent('https://example.com/go'));
  const jump = new FakeLink('https://redirect.test/jump?url=' + encodeURIComponent('https://example.com/jump'));
  api.processLink(go);
  api.processLink(jump);

  assert.equal(go.href, 'https://example.com/go');
  assert.equal(jump.href, 'https://example.com/jump');
});

test('同域名多条跟踪规则同时清理属性和参数', async () => {
  const stored = clone(DEFAULT_CONFIG);
  stored.trackingRules.push(
    {
      id: 'custom-tracking-a', domain: 'tracking.test', enabled: true,
      removeAttributes: ['data-a'], cleanUrlParams: ['tracker_a']
    },
    {
      id: 'custom-tracking-b', domain: 'tracking.test', enabled: true,
      removeAttributes: ['data-b'], cleanUrlParams: ['tracker_b']
    }
  );
  const { api } = createHarness(stored);
  await api.init();

  const link = new FakeLink('https://tracking.test/path?tracker_a=1&tracker_b=2&keep=3', {
    'data-a': '1', 'data-b': '2'
  });
  api.processLink(link);

  assert.equal(link.href, 'https://tracking.test/path?keep=3');
  assert.equal(link.hasAttribute('data-a'), false);
  assert.equal(link.hasAttribute('data-b'), false);
});

test('单条链接异常不会阻塞批处理队列', async () => {
  const stored = clone(DEFAULT_CONFIG);
  stored.trackingRules.push({
    id: 'custom-bad-attribute', domain: 'first.test', enabled: true,
    removeAttributes: ['bad attribute'], cleanUrlParams: []
  });
  const { api } = createHarness(stored);
  await api.init();

  const bad = new FakeLink('https://first.test/?utm_source=x');
  const good = new FakeLink('https://second.test/?utm_source=x&keep=1');
  api.batchProcessLinks([bad, good]);

  assert.equal(good.href, 'https://second.test/?keep=1');
  assert.equal(good.hasAttribute('data-link-handler-processed'), true);
});
