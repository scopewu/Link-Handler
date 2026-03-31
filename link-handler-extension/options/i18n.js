// 国际化工具
const i18n = {
  // 当前语言
  currentLocale: 'en',

  // 可用的语言列表
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

  // 翻译缓存
  translations: {},

  // 初始化语言设置
  init: async function() {
    // 检测浏览器语言
    const browserLocale = this.detectBrowserLocale();
    this.currentLocale = browserLocale;

    // 加载翻译文件
    await this.loadTranslations(browserLocale);

    // 应用翻译
    this.localizePage();
  },

  // 检测浏览器语言
  detectBrowserLocale: function() {
    // 优先使用 chrome.i18n 的 API（如果在扩展环境中）
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

    // 默认返回英文
    return 'en';
  },

  // 加载翻译文件
  loadTranslations: async function(locale) {
    // 如果在扩展环境中，优先使用 chrome.i18n
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      // chrome.i18n 会自动处理，不需要手动加载
      return;
    }

    // 非扩展环境：手动加载翻译文件
    try {
      const response = await fetch(`../_locales/${locale}/messages.json`);
      if (response.ok) {
        this.translations = await response.json();
      } else {
        // 如果加载失败，尝试加载英文
        const enResponse = await fetch(`../_locales/en/messages.json`);
        if (enResponse.ok) {
          this.translations = await enResponse.json();
        }
      }
    } catch (e) {
      console.warn('[i18n] Failed to load translations:', e);
      this.translations = {};
    }
  },

  // 获取本地化消息
  getMessage: function(key, substitutions) {
    // 优先使用 chrome.i18n API
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const result = chrome.i18n.getMessage(key, substitutions);
      if (result) return result;
    }

    // 使用本地缓存的翻译
    const messageObj = this.translations[key];
    if (messageObj && messageObj.message) {
      let message = messageObj.message;
      // 处理占位符
      if (substitutions && Array.isArray(substitutions)) {
        substitutions.forEach((sub, index) => {
          message = message.replace(new RegExp(`\\$${index + 1}\\$`, 'g'), sub);
        });
      }
      return message;
    }

    // 降级处理：返回 key
    return key;
  },

  // 填充页面所有带 data-i18n 属性的元素
  localizePage: function() {
    // 处理 data-i18n 属性
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = this.getMessage(key);
      if (message && message !== key) {
        el.textContent = message;
      }
    });

    // 处理 placeholder
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const message = this.getMessage(key);
      if (message && message !== key) {
        el.placeholder = message;
      }
    });

    // 处理 title 属性
    const titleElements = document.querySelectorAll('[data-i18n-title]');
    titleElements.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const message = this.getMessage(key);
      if (message && message !== key) {
        el.title = message;
      }
    });

    // 更新页面语言属性
    document.documentElement.lang = this.currentLocale === 'zh_CN' ? 'zh-CN' :
                                    this.currentLocale === 'zh_TW' ? 'zh-TW' : 'en';
  },

  // 动态替换模板中的变量
  format: function(key, ...args) {
    let message = this.getMessage(key);
    if (!message || message === key) return key;

    args.forEach((arg, index) => {
      message = message.replace(new RegExp(`\\$${index + 1}\\$`, 'g'), arg);
    });
    return message;
  }
};

// 页面加载完成后自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
  });
} else {
  i18n.init();
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
}
