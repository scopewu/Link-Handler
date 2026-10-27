// spa-hook.js 测试：验证专用 MessagePort 配置通道与地址栏清洗行为
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createSpaWorld(initialUrl = 'https://www.bilibili.com/video/BV1?spm_id_from=old&keep=1') {
  const messageListeners = [];
  const navigationMessages = [];
  const historyCalls = [];

  const window = {
    __linkHandlerSpaHooked__: false,
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.push(listener);
    },
    postMessage(data, targetOrigin) {
      navigationMessages.push({ data, targetOrigin });
    }
  };

  const location = {
    href: initialUrl,
    get hostname() { return new URL(this.href).hostname; }
  };

  const history = {
    state: { from: 'test' },
    pushState(state, title, url) {
      historyCalls.push({ method: 'pushState', url });
      if (url !== undefined && url !== null) location.href = new URL(url, location.href).toString();
      return undefined;
    },
    replaceState(state, title, url) {
      historyCalls.push({ method: 'replaceState', url });
      if (url !== undefined && url !== null) location.href = new URL(url, location.href).toString();
      return undefined;
    }
  };

  const context = {
    console,
    URL,
    window,
    location,
    history,
    document: { title: 'SPA Hook Test' }
  };

  const source = fs.readFileSync(new URL('../link-handler-extension/spa-hook.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, context);

  function dispatch(data, ports = []) {
    for (const listener of messageListeners) {
      listener({ source: window, data, ports });
    }
  }

  function dispatchFromPage(data) {
    for (const listener of messageListeners) {
      listener({ source: window, data, ports: [] });
    }
  }

  return { window, location, history, historyCalls, navigationMessages, dispatch, dispatchFromPage };
}

function fakePort() {
  const port = {
    started: false,
    closed: false,
    onmessage: null,
    start() { port.started = true; },
    close() { port.closed = true; }
  };
  return port;
}

test('旧版公开 sanitize-config 消息不能修改配置', () => {
  const world = createSpaWorld('https://www.bilibili.com/video?keep=1');
  world.dispatchFromPage({
    source: 'link-handler-spa',
    type: 'sanitize-config',
    hosts: { 'bilibili.com': ['keep'] }
  });

  world.history.pushState({}, '', 'https://www.bilibili.com/video?keep=1&spm_id_from=dirty');
  assert.equal(world.location.href.includes('spm_id_from=dirty'), true);
});

test('专用端口下发配置后会清洗当前地址栏与 pushState URL', () => {
  const world = createSpaWorld();
  const port = fakePort();
  world.dispatch({ source: 'link-handler-spa', type: 'sanitize-channel' }, [port]);
  assert.equal(port.started, true);

  port.onmessage({ data: { hosts: { 'bilibili.com': ['spm_id_from', 'vd_source'] } } });
  assert.equal(world.location.href, 'https://www.bilibili.com/video/BV1?keep=1');

  world.history.pushState({ page: 2 }, '', 'https://www.bilibili.com/video/BV2?spm_id_from=new&vd_source=u&keep=2');
  assert.equal(world.location.href, 'https://www.bilibili.com/video/BV2?keep=2');
  assert.equal(world.historyCalls.at(-1).url, 'https://www.bilibili.com/video/BV2?keep=2');
});

test('专用端口上的畸形配置会被忽略', () => {
  const world = createSpaWorld('https://www.bilibili.com/video?keep=1');
  const port = fakePort();
  world.dispatch({ source: 'link-handler-spa', type: 'sanitize-channel' }, [port]);

  port.onmessage({ data: { hosts: { 'bilibili.com': 'spm_id_from' } } });
  world.history.pushState({}, '', 'https://www.bilibili.com/video?keep=1&spm_id_from=dirty');
  assert.equal(world.location.href.includes('spm_id_from=dirty'), true);
});

test('清洗发生时仍向隔离世界发送导航通知', () => {
  const world = createSpaWorld();
  const port = fakePort();
  world.dispatch({ source: 'link-handler-spa', type: 'sanitize-channel' }, [port]);
  port.onmessage({ data: { hosts: { 'bilibili.com': ['spm_id_from'] } } });

  assert.ok(world.navigationMessages.length > 0);
  const last = world.navigationMessages.at(-1);
  assert.equal(last.data.source, 'link-handler-spa');
  assert.equal(last.data.type, 'navigation');
});
