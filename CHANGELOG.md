# Changelog

## Version 1.3.0

### ✨ New Features / 新功能

- **Link Processing Statistics** / **链接处理统计**  
  Real-time display of processed links count in popup. Tracks total processed, redirect unwrapped, target removed, and tracking cleaned statistics.  
  在弹出窗口中实时显示已处理的链接数量。统计包括：总处理数、重定向解包数、target 移除数和跟踪清理数。

- **Add Rules via Modal** / **模态框添加规则**  
  Added intuitive modal dialogs for creating new redirect and tracking rules with built-in validation.  
  新增直观的模态对话框用于创建重定向和跟踪规则，支持内置验证。

- **Search & Filter** / **搜索与过滤**  
  Added search functionality to quickly find specific rules in the options page.  
  在选项页面添加搜索功能，快速查找特定规则。

- **Auto-Save Configuration** / **配置自动保存**  
  Settings are now automatically saved when changed, no manual save required.  
  设置更改后自动保存，无需手动点击保存按钮。

### 🔧 Improvements / 改进

- **Enhanced URL Validation** / **增强的 URL 验证**  
  Improved URL parsing and validation logic for better security and compatibility.  
  改进 URL 解析和验证逻辑，提升安全性和兼容性。

- **Better Same-Origin Handling** / **改进的同源处理**  
  Optimized logic for removing `target="_blank"` from same-origin links.  
  优化同域名链接的 `target="_blank"` 移除逻辑。

- **URL Parameter Cleaning** / **URL 参数清理**  
  Enhanced tracking parameter removal with wildcard support (`*` to remove all params).  
  增强跟踪参数移除功能，支持通配符（`*` 移除所有参数）。

- **Tag Input Experience** / **标签输入体验**  
  Improved tag input handling in rule editing modal with better keyboard navigation.  
  改进规则编辑模态框中的标签输入处理，优化键盘导航体验。

### 🧹 Cleanup / 清理

- Removed unused `purify.min.js` dependency.  
  移除未使用的 `purify.min.js` 依赖。

---

## Version 1.2.0

### ✨ New Features / 新功能

- **Firefox Support** / **Firefox 支持**  
  Added Firefox browser compatibility with Manifest V3.  
  添加 Firefox 浏览器兼容性支持（Manifest V3）。

- **SPA Navigation Support** / **SPA 导航支持**  
  Automatically re-process links on single-page application route changes.  
  单页应用路由变化时自动重新处理链接。

### 🎨 UI Enhancements / UI 增强

- Redesigned options page with tabbed interface.  
  重新设计选项页面，采用标签页界面。

- Updated extension icons for better visibility.  
  更新扩展图标，提升可见性。

---

**Full Changelog**: Compare with previous versions on GitHub.

**完整更新日志**: 在 GitHub 上查看与之前版本的对比。
