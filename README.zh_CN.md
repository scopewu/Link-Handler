# LINK HANDLER

<p align="center">
  <img src="link-handler-extension/icons/icon.svg" width="128" height="128" alt="Link Handler">
</p>

<p align="center">
  <strong>智能链接处理，让浏览更清爽</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="#使用">使用</a> •
  <a href="#支持站点">支持站点</a>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

## 功能特性

### 智能链接处理

- **同源链接**：移除同域名链接的 `target="_blank"`
- **相对链接**：相对地址在当前标签页打开
- **重定向解包**：绕过中间跳转页面，直达目标链接
- **跟踪清理**：移除跟踪参数和属性
- **全局跟踪清理**：在所有网站上剥离常见跟踪参数（`utm_*`、`fbclid`、`gclid` 等）
- **地址栏清理**：移除地址栏中的跟踪参数，SPA 导航同样生效

### 重定向解包

自动从跳转服务中提取真实 URL：

- 掘金：`link.juejin.cn/?target=xxx` → 直达链接
- 知乎：`link.zhihu.com/?target=xxx` → 直达链接
- 微博：`weibo.cn/xxx?url=xxx` → 直达链接
- CSDN：`link.csdn.net/?target=xxx` → 直达链接
- 简书：`jianshu.com/go?to=xxx` → 直达链接
- Bilibili：`link.bilibili.com/?url=xxx` → 直达链接
- 京东联盟：`link.jd.com/?to=xxx` → 直达链接
- 淘宝联盟：`s.click.taobao.com/?u=xxx` → 直达链接
- 少数派：`sspai.com/link?target=xxx` → 直达链接
- Reddit：`out.reddit.com/?url=xxx` → 直达链接
- Facebook：`facebook.com/l.php?u=xxx` → 直达链接

### 跟踪清理

清理主流平台的跟踪数据：

- **所有网站**：`utm_*`、`fbclid`、`gclid`、`msclkid`、`mc_cid`、`mc_eid`
- **Bilibili**：`spm_id_from`、`vd_source`、`share_*`、`data-spmid`、`data-mod`、`data-idx`
- **微博**：`suda-uatrack`、`suda-data`、`action-data`、`bpfilter`、`weibo_id`
- **知乎**：`data-za-*`、`utm_source`、`utm_medium`、`utm_content`
- **掘金**：`utm_*` 参数
- **简书**：`data-original`、`utm_*` 参数
- **CSDN**：`data-report-*` 属性

### 域名白名单

按域名跳过链接处理：

- **后缀匹配**：`deepseek.com` 自动覆盖 `chat.deepseek.com`
- **弹出窗口切换**：直接在工具栏弹出窗口中快速添加/移除当前网站
- **继承提示**：子域名通过父域名继承白名单状态时，弹出窗口会显示来源域名

### 弹出窗口概览

弹出窗口实时显示以下信息：

| 指标 | 说明 |
|------|------|
| 重定向规则 | 已启用的重定向解包规则数 |
| 清理规则 | 已启用的跟踪清理规则数 |
| 已处理 | 当前页面已处理的链接数 |

## 安装

### Chrome / Edge

1. 打开 `chrome://extensions` 或 `edge://extensions`
2. 开启右上角的**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择 `link-handler-extension` 文件夹

### Firefox

1. 打开 `about:debugging`
2. 点击**此 Firefox** → **临时载入附加组件**
3. 选择扩展文件夹中的 `manifest.json`

## 使用

### 自动处理

安装后扩展自动在所有网站上运行，无需额外配置。

### 快速访问

点击工具栏中的扩展图标，可以：
- 查看已启用的规则数和当前页面处理数量
- 为当前网站切换白名单状态
- 手动重新处理当前页面
- 打开设置页面

### 设置

通过选项页面访问完整设置：

- **全局设置**：配置默认行为
- **重定向规则**：添加自定义重定向解包规则
- **跟踪规则**：配置按域名跟踪清理
- **白名单**：管理跳过处理的域名
- **导入/导出**：备份和分享配置

## 支持站点

### 重定向服务
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

### 跟踪清理
- Bilibili
- 微博
- 知乎
- 掘金
- 简书
- CSDN

## 自定义规则

### 添加重定向规则

```json
{
  "domain": "link.example.com",
  "param": "target",
  "pathPattern": "/go",
  "enabled": true,
  "description": "示例重定向"
}
```

`pathPattern` 为可选项：设置后仅匹配路径以它开头的 URL。

### 添加跟踪规则

```json
{
  "domain": "example.com",
  "enabled": true,
  "description": "示例跟踪清理",
  "removeAttributes": ["data-track", "data-analytics"],
  "preventClickRewrite": true,
  "cleanUrlParams": ["utm_source", "utm_medium"]
}
```

使用 `"cleanUrlParams": ["*"]` 移除**所有** URL 参数。

## 隐私

- **无数据收集**：所有处理均在浏览器本地完成
- **无外部请求**：扩展不会向外部服务器发送任何数据
- **开源透明**：代码完全公开，可审计

## 国际化

支持语言：

| 语言 | 代码 | 状态 |
|------|------|--------|
| 简体中文 | zh_CN | 已完成 |
| 繁體中文 | zh_TW | 已完成 |
| English | en | 已完成 |

浏览器根据系统偏好自动选择语言。

## 技术细节

- **Manifest V3**：现代扩展 API
- **双内容脚本**：隔离世界处理链接 + MAIN 世界实现 SPA 钩子与地址栏清理
- **MutationObserver**：处理动态加载的内容
- **SPA 支持**：通过监听 `history.pushState`/`replaceState` 适配 React、Vue、Angular 应用
- **同步存储**：设置跨设备同步；以差异（diff）形式存储，内置规则更新自动生效

## 文件结构

```
link-handler-extension/
├── manifest.json              # 扩展清单
├── config.js                  # 默认配置与差异存储
├── content.js                 # 核心处理逻辑
├── spa-hook.js                # SPA 钩子与地址栏清理（MAIN 世界）
├── _locales/                  # 翻译文件
│   ├── en/messages.json
│   ├── zh_CN/messages.json
│   └── zh_TW/messages.json
├── options/                   # 设置界面
│   ├── options.html
│   ├── options.css
│   ├── options.js
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   └── i18n.js
└── icons/                     # 扩展图标
    └── icon*.png
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
