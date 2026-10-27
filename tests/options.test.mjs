// options.js 标签输入事件测试：提交/删除后再收集并保存全局参数
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_CONFIG } = require('../link-handler-extension/config.js');
const clone = value => JSON.parse(JSON.stringify(value));

class FakeDiv {
  constructor() { this.textContent = ''; }
  get innerHTML() { return String(this.textContent); }
  set innerHTML(value) { this.textContent = String(value); }
}

class FakeTag {
  constructor(value = '', container = null) {
    this.value = value;
    this.container = container;
    this.className = '';
    this._innerHTML = '';
    this._textContent = '';
    this.removed = false;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = value;
    const match = /<span class="tag-text">([^<]*)<\/span>/.exec(value);
    if (match) this.value = match[1];
  }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = value; }
  remove() { this.removed = true; }
  closest(selector) {
    if (selector === '.tags-input') return this.container;
    if (selector === '.tag') return this;
    return null;
  }
  querySelector(selector) {
    return selector === '.tag-text' ? { textContent: this.value } : null;
  }
}

class FakeRemoveButton {
  constructor(tag) { this.tag = tag; }
  closest(selector) {
    if (selector === '.tag-remove') return this;
    if (selector === '.tag') return this.tag;
    return null;
  }
}

function loadOptionsModule() {
  const container = {
    id: 'globalTrackingParamsInput',
    children: [],
    insertBefore(tag) { container.children.push(tag); },
    querySelector() { return container.input; },
    querySelectorAll() { return container.children.filter(tag => !tag.removed); }
  };
  const trackingPanel = {
    querySelector() { return container; },
    querySelectorAll() { return container.children.filter(tag => !tag.removed); }
  };
  const input = {
    value: '',
    closest() { return container; }
  };
  container.input = input;

  const document = {
    getElementById(id) { return id === 'tab-tracking' ? trackingPanel : { textContent: '' }; },
    createElement(tagName) { return tagName === 'div' ? new FakeDiv() : new FakeTag(); }
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    document,
    i18n: { getMessage: () => 'Remove tag' }
  };

  let source = fs.readFileSync(new URL('../link-handler-extension/options/options.js', import.meta.url), 'utf8');
  source = source
    .replace(/^import .*$/gm, '')
    .replace(/\ninit\(\);\s*$/, `
      this.__test = {
        handleTagInput,
        handleTagRemove,
        setCurrentConfig: (next) => { currentConfig = next; },
        cancelPendingSave: () => clearTimeout(saveDebounceTimer)
      };`);
  vm.runInNewContext(source, context);
  context.__test.container = container;
  context.__test.input = input;
  return context.__test;
}

test('submitted global parameter tags save the current tag set', () => {
  const exposed = loadOptionsModule();
  const config = clone(DEFAULT_CONFIG);
  config.global.globalTrackingParams = ['foo'];
  exposed.setCurrentConfig(config);
  exposed.container.children.push(new FakeTag('foo', exposed.container));
  exposed.input.value = 'bar';

  exposed.handleTagInput({ key: 'Enter', preventDefault() {}, target: exposed.input });
  assert.deepEqual(Array.from(config.global.globalTrackingParams), ['foo', 'bar']);
  assert.equal(exposed.input.value, '');

  exposed.cancelPendingSave();
});

test('global parameter tag removal collects values after removing the DOM node', () => {
  const exposed = loadOptionsModule();
  const config = clone(DEFAULT_CONFIG);
  config.global.globalTrackingParams = ['foo', 'bar'];
  exposed.setCurrentConfig(config);

  const foo = new FakeTag('foo', exposed.container);
  const bar = new FakeTag('bar', exposed.container);
  exposed.container.children.push(foo, bar);
  const event = {
    target: new FakeRemoveButton(bar),
    preventDefault() {}
  };

  exposed.handleTagRemove(event);
  assert.equal(bar.removed, true);
  assert.deepEqual(Array.from(config.global.globalTrackingParams), ['foo']);

  exposed.cancelPendingSave();
});
