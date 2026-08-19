// data-i18n* 绑定属性 → 写入方式的映射表（localizePage 按表驱动，新增属性只需加一行）
const I18N_BINDINGS = [
  { attr: 'data-i18n', apply: (el, msg) => { el.textContent = msg; } },
  { attr: 'data-i18n-placeholder', apply: (el, msg) => { el.placeholder = msg; } },
  { attr: 'data-i18n-title', apply: (el, msg) => { el.title = msg; } },
  { attr: 'data-i18n-aria-label', apply: (el, msg) => { el.setAttribute('aria-label', msg); } }
];

// 国际化工具（ES module）
const i18n = {
  currentLocale: 'en',

  availableLocales: ['en', 'zh_CN', 'zh_TW'],

  // 语言映射表（浏览器语言 -> 插件语言）
  localeMapping: {
    'zh': 'zh_CN',
    'zh-CN': 'zh_CN',
    'zh-SG': 'zh_CN',
    'zh-Hans': 'zh_CN',
    'zh-TW': 'zh_TW',
    'zh-HK': 'zh_TW',
    'zh-MO': 'zh_TW',
    'zh-Hant': 'zh_TW',
    'en': 'en',
    'en-US': 'en',
    'en-GB': 'en',
    'en-CA': 'en',
    'en-AU': 'en'
  },

  translations: {},

  init: async function() {
    const browserLocale = this.detectBrowserLocale();
    this.currentLocale = browserLocale;

    await this.loadTranslations(browserLocale);

    this.localizePage();
  },

  detectBrowserLocale: function() {
    // 扩展环境优先 chrome.i18n
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
      const uiLang = chrome.i18n.getUILanguage();
      if (this.localeMapping[uiLang]) {
        return this.localeMapping[uiLang];
      }
      // 尝试匹配前缀
      const langPrefix = uiLang.split('-')[0];
      if (this.localeMapping[langPrefix]) {
        return this.localeMapping[langPrefix];
      }
    }

    // 备用方案：使用 navigator.language
    const navLang = navigator.language || navigator.userLanguage;
    if (this.localeMapping[navLang]) {
      return this.localeMapping[navLang];
    }
    const navPrefix = navLang.split('-')[0];
    if (this.localeMapping[navPrefix]) {
      return this.localeMapping[navPrefix];
    }

    return 'en';
  },

  loadTranslations: async function(locale) {
    // 扩展环境交由 chrome.i18n 处理
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      return;
    }

    // 非扩展环境：手动加载翻译文件
    try {
      const response = await fetch(`../_locales/${locale}/messages.json`);
      if (response.ok) {
        this.translations = await response.json();
      } else {
        // 加载失败时回落英文
        const enResponse = await fetch(`../_locales/en/messages.json`);
        if (enResponse.ok) {
          this.translations = await enResponse.json();
        }
      }
    } catch (e) {
      console.error('[i18n] Failed to load translations:', e);
      this.translations = {};
    }
  },

  getMessage: function(key, substitutions) {
    // 优先使用 chrome.i18n API
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const result = chrome.i18n.getMessage(key, substitutions);
      if (result) return result;
    }

    // 使用本地缓存的翻译
    const messageObj = this.translations[key];
    if (messageObj && messageObj.message) {
      // 与 chrome.i18n 一致，substitutions 允许 string | string[]
      const subs = typeof substitutions === 'string' ? [substitutions] : substitutions;
      return this.substitutePlaceholders(messageObj, Array.isArray(subs) ? subs : []);
    }

    // 降级：返回 key
    return key;
  },

  // 展开消息中的占位符：先按 placeholders 定义展开命名变量（其 content 再做位置替换），
  // 最后替换消息中直接出现的 $1$、$2$… 位置占位符，行为与 chrome.i18n 对齐
  substitutePlaceholders: function(messageObj, subs) {
    // 把字符串中的 $1、$1$、$2、$2$… 替换为 subs 对应项（用函数替换，避免 $&、$' 等被特殊解释）
    const replacePositional = (text) => text.replace(/\$([0-9]+)\$?(?![0-9])/g, (match, num) => {
      const index = parseInt(num, 10) - 1;
      return index >= 0 && index < subs.length ? subs[index] : match;
    });

    // placeholders 的变量名不区分大小写
    const placeholders = {};
    if (messageObj.placeholders) {
      for (const [name, def] of Object.entries(messageObj.placeholders)) {
        placeholders[name.toLowerCase()] = def;
      }
    }

    let message = messageObj.message;
    message = message.replace(/\$([A-Za-z0-9_]+)\$/g, (match, name) => {
      const def = placeholders[name.toLowerCase()];
      return def && typeof def.content === 'string' ? replacePositional(def.content) : match;
    });
    return replacePositional(message);
  },

  // 填充页面所有带 data-i18n* 属性的元素
  localizePage: function() {
    I18N_BINDINGS.forEach(({ attr, apply }) => {
      document.querySelectorAll(`[${attr}]`).forEach(el => {
        const key = el.getAttribute(attr);
        const message = this.getMessage(key);
        if (message && message !== key) {
          apply(el, message);
        }
      });
    });

    document.documentElement.lang = this.currentLocale === 'zh_CN' ? 'zh-CN' :
                                    this.currentLocale === 'zh_TW' ? 'zh-TW' : 'en';
  },

  format: function(key, ...args) {
    let message = this.getMessage(key);
    if (!message || message === key) return key;

    args.forEach((arg, index) => {
      // 用函数替换，避免 arg 中的 $&、$' 等被 String.replace 特殊解释
      message = message.replace(new RegExp(`\\$${index + 1}\\$`, 'g'), () => arg);
    });
    return message;
  }
};

// 模块 defer 语义，DOM 已就绪，直接初始化
i18n.init();

// 导出
export { i18n };
