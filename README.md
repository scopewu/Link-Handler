# LINK HANDLER

<p align="center">
  <img src="link-handler-extension/icons/icon.svg" width="128" height="128" alt="Link Handler">
</p>

<p align="center">
  <strong>Smart link processing for better browsing</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#supported-sites">Supported Sites</a>
</p>

---

## Features

### 🎯 Smart Link Processing

| Feature | Description |
|---------|-------------|
| **Same-Origin Links** | Remove `target="_blank"` for same-domain links |
| **Relative Links** | Open relative URLs in the same tab |
| **Redirect Unwrap** | Bypass intermediate redirect pages |
| **Tracking Cleanup** | Remove tracking parameters & attributes |

### 🔄 Redirect Unwrapping

Automatically extract real URLs from redirect services:

| Platform | Example |
|----------|---------|
| 掘金 (Juejin) | `link.juejin.cn/?target=xxx` → direct link |
| 知乎 (Zhihu) | `link.zhihu.com/?target=xxx` → direct link |
| 微博 (Weibo) | `weibo.cn/xxx?url=xxx` → direct link |
| CSDN | `link.csdn.net/?target=xxx` → direct link |
| 简书 (Jianshu) | `jianshu.com/go-wild?url=xxx` → direct link |
| Bilibili | `link.bilibili.com/?url=xxx` → direct link |
| 京东联盟 | `link.jd.com/?to=xxx` → direct link |
| 淘宝联盟 | `s.click.taobao.com` → direct link |

### 🧹 Tracking Removal

Clean tracking data from major platforms:

- **Bilibili**: `data-spmid`, `data-mod`, `data-idx`, `spm_id_from`
- **微博 (Weibo)**: `suda-uatrack`, `suda-data`, `bpfilter`
- **知乎 (Zhihu)**: `data-za-*`, `utm_source`, `utm_medium`
- **掘金 (Juejin)**: `utm_*` parameters
- **CSDN**: `data-report-*`, `spm`
- **百度 (Baidu)**: `data-click`, tracking params

## Installation

### Chrome / Edge

1. Open `chrome://extensions` or `edge://extensions`
2. Enable **Developer Mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `link-handler-extension` folder

### Firefox

1. Open `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on**
3. Select `manifest.json` from the extension folder

## Usage

### Automatic Processing

Once installed, the extension works automatically on all websites. No configuration required.

### Quick Access

Click the extension icon in your toolbar to:
- View active rules count
- Toggle processing on/off
- Process current page manually
- Open settings

### Settings

Access full settings via the options page to:

- **Global Settings**: Configure default behaviors
- **Redirect Rules**: Add custom redirect unwrapping rules
- **Tracking Rules**: Configure per-domain tracking cleanup
- **Import/Export**: Backup and share configurations

## Supported Sites

### Redirect Services
- ✅ 掘金 (juejin.cn)
- ✅ 知乎 (zhihu.com)
- ✅ 微博 (weibo.cn, t.cn)
- ✅ CSDN (csdn.net)
- ✅ SegmentFault (segmentfault.com)
- ✅ 简书 (jianshu.com)
- ✅ Bilibili (bilibili.com)
- ✅ 京东联盟 (jd.com)
- ✅ 淘宝联盟 (taobao.com)

### Tracking Cleanup
- ✅ Bilibili
- ✅ 微博 (Weibo)
- ✅ 知乎 (Zhihu)
- ✅ 掘金 (Juejin)
- ✅ 简书 (Jianshu)
- ✅ CSDN
- ✅ 百度搜索

## Custom Rules

### Add Redirect Rule

```json
{
  "domain": "link.example.com",
  "param": "target",
  "enabled": true,
  "description": "Example redirect"
}
```

### Add Tracking Rule

```json
{
  "domain": "example.com",
  "enabled": true,
  "description": "Example tracking cleanup",
  "removeAttributes": ["data-track", "data-analytics"],
  "preventClickRewrite": true,
  "cleanUrlParams": ["utm_source", "utm_medium"]
}
```

## Privacy

- **No data collection**: All processing happens locally in your browser
- **No external requests**: The extension doesn't send any data to external servers
- **Open source**: Transparent code you can audit

## Internationalization

Supported languages:

| Language | Code | Status |
|----------|------|--------|
| 简体中文 | zh_CN | ✅ Complete |
| 繁體中文 | zh_TW | ✅ Complete |
| English | en | ✅ Complete |

Browser automatically selects language based on system preferences.

## Technical Details

- **Manifest V3**: Modern extension API
- **Content Scripts**: Injected into all pages
- **MutationObserver**: Handles dynamically loaded content
- **SPA Support**: Works with React, Vue, Angular apps

### Performance
- Batch processing with `requestIdleCallback`
- Processed link marking to avoid duplication
- Debounced DOM mutations
- Minimal CPU/memory footprint

## File Structure

```
link-handler-extension/
├── manifest.json              # Extension manifest
├── config.js                  # Default configuration
├── content.js                 # Core processing logic
├── _locales/                  # Translations
│   ├── en/messages.json
│   ├── zh_CN/messages.json
│   └── zh_TW/messages.json
├── options/                   # Settings UI
│   ├── options.html
│   ├── options.css
│   ├── options.js
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   └── i18n.js
└── icons/                     # Extension icons
    └── icon*.png
```

## Changelog

### v1.0.0
- Initial release
- Redirect link unwrapping
- Tracking parameter cleanup
- Same-origin target removal
- Custom rule support
- Multi-language support (EN/ZH/ZH-TW)

## License

MIT License

## Contributing

Issues and pull requests are welcome!

---

<p align="center">
  Made with 💙 for a cleaner web experience
</p>
