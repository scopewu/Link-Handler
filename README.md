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

<p align="center">
  <a href="README.zh_CN.md">简体中文</a>
</p>

---

## Features

### Smart Link Processing

- **Same-Origin Links**: Remove `target="_blank"` for same-domain links
- **Relative Links**: Open relative URLs in the same tab
- **Redirect Unwrap**: Bypass intermediate redirect pages
- **Tracking Cleanup**: Remove tracking parameters & attributes
- **Global Tracking Cleanup**: Strip common trackers (`utm_*`, `fbclid`, `gclid`, …) from links on all sites
- **Address Bar Cleaning**: Remove tracking params from the address bar, even during SPA navigation

### Redirect Unwrapping

Automatically extract real URLs from redirect services:

- 掘金 (Juejin): `link.juejin.cn/?target=xxx` → direct link
- 知乎 (Zhihu): `link.zhihu.com/?target=xxx` → direct link
- 微博 (Weibo): `weibo.cn/xxx?url=xxx` → direct link
- CSDN: `link.csdn.net/?target=xxx` → direct link
- 简书 (Jianshu): `jianshu.com/go?to=xxx` → direct link
- Bilibili: `link.bilibili.com/?url=xxx` → direct link
- 京东联盟: `link.jd.com/?to=xxx` → direct link
- 淘宝联盟: `s.click.taobao.com/?u=xxx` → direct link
- 少数派 (SSPai): `sspai.com/link?target=xxx` → direct link
- Reddit: `out.reddit.com/?url=xxx` → direct link
- Facebook: `facebook.com/l.php?u=xxx` → direct link

### Tracking Removal

Clean tracking data from major platforms:

- **All Sites**: `utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_cid`, `mc_eid`
- **Bilibili**: `spm_id_from`, `vd_source`, `share_*`, `data-spmid`, `data-mod`, `data-idx`
- **微博 (Weibo)**: `suda-uatrack`, `suda-data`, `action-data`, `bpfilter`, `weibo_id`
- **知乎 (Zhihu)**: `data-za-*`, `utm_source`, `utm_medium`, `utm_content`
- **掘金 (Juejin)**: `utm_*` parameters
- **简书 (Jianshu)**: `data-original`, `utm_*` parameters
- **CSDN**: `data-report-*` attributes

### Domain Whitelist

Skip link processing on specific domains via a per-site whitelist:

- **Suffix matching**: `deepseek.com` automatically covers `chat.deepseek.com`
- **Popup toggle**: Quickly whitelist the current site directly from the toolbar popup
- **Inherited indicator**: Subdomains whitelisted via a parent domain show the source domain in the popup

### Popup Overview

The popup displays live information:

| Metric | Description |
|--------|-------------|
| Redirect Rules | Number of enabled redirect unwrapping rules |
| Cleanup Rules | Number of enabled tracking cleanup rules |
| Processed | Links processed on the current page |

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
- View enabled rules and per-page processing count
- Toggle whitelist for the current site
- Process current page manually
- Open settings

### Settings

Access full settings via the options page to:

- **Global Settings**: Configure default behaviors
- **Redirect Rules**: Add custom redirect unwrapping rules
- **Tracking Rules**: Configure per-domain tracking cleanup
- **Whitelist**: Manage domains to skip processing
- **Import/Export**: Backup and share configurations

## Supported Sites

### Redirect Services
- 掘金 (juejin.cn)
- 知乎 (zhihu.com)
- 微博 (weibo.cn)
- CSDN (csdn.net)
- 简书 (jianshu.com)
- Bilibili (bilibili.com)
- 京东联盟 (jd.com)
- 淘宝联盟 (taobao.com)
- 少数派 (sspai.com)
- Reddit (reddit.com)
- Facebook (facebook.com)

### Tracking Cleanup
- Bilibili
- 微博 (Weibo)
- 知乎 (Zhihu)
- 掘金 (Juejin)
- 简书 (Jianshu)
- CSDN

## Custom Rules

### Add Redirect Rule

```json
{
  "domain": "link.example.com",
  "param": "target",
  "pathPattern": "/go",
  "enabled": true,
  "description": "Example redirect"
}
```

`pathPattern` is optional: when set, only URLs whose path starts with it are matched.

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

Use `"cleanUrlParams": ["*"]` to remove **all** URL parameters.

## Privacy

- **No data collection**: All processing happens locally in your browser
- **No external requests**: The extension doesn't send any data to external servers
- **Open source**: Transparent code you can audit

## Internationalization

Supported languages:

| Language | Code | Status |
|----------|------|--------|
| 简体中文 | zh_CN | Complete |
| 繁體中文 | zh_TW | Complete |
| English | en | Complete |

Browser automatically selects language based on system preferences.

## Technical Details

- **Manifest V3**: Modern extension API
- **Dual Content Scripts**: Isolated world for link processing + MAIN world for SPA hooks & address-bar cleaning
- **MutationObserver**: Handles dynamically loaded content
- **SPA Support**: Works with React, Vue, Angular apps via `history.pushState`/`replaceState` patching
- **Sync Storage**: Settings sync across devices; stored as a diff so built-in rule updates apply automatically

## File Structure

```
link-handler-extension/
├── manifest.json              # Extension manifest
├── config.js                  # Default configuration & diff-based storage
├── content.js                 # Core processing logic
├── spa-hook.js                # SPA hook & address-bar cleaning (MAIN world)
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

## License

MIT License

## Contributing

Issues and pull requests are welcome!
