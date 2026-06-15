# Changelog

## Version 1.4.3

### Bug Fixes / 问题修复

- **Config Merge Now Preserves Defaults Across Upgrades** / **配置合并升级后保留默认规则**  
  Rules now merge additively by domain instead of being wholesale-replaced: your custom rules override matching defaults, while new default rules shipped in future updates automatically reach you.  
  规则改为按域名增量合并，而非整体替换：自定义规则覆盖同域名默认规则，后续版本新增的默认规则也能自动透传给你。

- **Accurate Processing Statistics** / **修正统计计数虚高**  
  The "tracking cleaned" counter no longer increments when a matching rule changes nothing — it now only counts links that were actually modified.  
  "跟踪清理"计数不再在规则匹配但未实际改动时累加，仅统计真正被修改的链接。

- **Live Rule Updates Across All Tabs** / **规则变更即时生效于所有标签页**  
  Saving, resetting, or importing config now notifies every open tab to reprocess; previously edits only took effect after a manual page reload.  
  保存、恢复默认或导入配置后会通知所有已打开的标签页重新处理，无需手动刷新页面即可生效。

- **Bilibili Playback Parameters Preserved** / **保留 Bilibili 播放参数**  
  Removed the destructive `cleanUrlParams: ['*']` that stripped functional params (`?p=`, `?t=`) from Bilibili links; the rule now cleans tracking attributes only.  
  移除了会误伤 Bilibili 功能参数（`?p=` 分 P、`?t=` 进度）的 `cleanUrlParams: ['*']`，该规则现仅清理跟踪属性。

- **i18n Placeholder Rendering** / **i18n 占位符渲染**  
  Fixed the search-result count ("Found X / Y rules") that rendered incorrectly due to malformed placeholder declarations.  
  修复因占位符声明不规范导致搜索结果计数（"找到 X / Y 条规则"）渲染异常的问题。

- **Domain Validation in Rule Modal** / **规则弹窗域名校验**  
  Redirect/tracking rule inputs now validate domain/IP format (previously only the whitelist input did), preventing malformed rules.  
  重定向/跟踪规则的域名输入现增加格式校验（此前仅白名单输入校验），避免写入非法域名。

- **Pending Queue Truncation** / **待处理队列截断**  
  `batchProcessLinks` slice logic no longer drops the incoming batch near capacity and now warns when truncating.  
  修复 `batchProcessLinks` 在接近上限时丢弃新批次的问题，并在截断时输出警告。

- **Fixed-Position Modal Focus Trap** / **修复弹窗焦点陷阱**  
  Focusable elements inside `position:fixed` modals are no longer wrongly excluded from the Tab cycle.  
  修复 `position:fixed` 弹窗内可聚焦元素被错误排除出 Tab 循环的无障碍问题。

### Improvements / 改进

- **MutationObserver Coalescing** / **MutationObserver 合并处理**  
  Bursts of DOM mutations are now merged via a single macrotask flush with per-batch dedup, cutting redundant processing on dynamic pages.  
  密集的 DOM 变化现通过单次宏任务合并刷新并按批次去重，减少动态页面上的重复处理。

- **Reduced SPA Re-scan Overhead** / **降低 SPA 重扫开销**  
  Navigation-triggered reprocessing trimmed from three sweeps to two (the MutationObserver handles the rest).  
  导航触发的重处理从三遍扫描精简为两遍（其余由 MutationObserver 负责）。

- **Robust i18n Fallback** / **健壮的 i18n 回退**  
  `getMessage` now normalizes string substitutions and resolves named placeholders (case-insensitive), and the locale path is auto-detected from the script location.  
  `getMessage` 现归一化字符串替换参数、解析命名占位符（大小写不敏感），并按脚本位置自动推断语言包路径。

- **Storage Quota Safety** / **存储配额保护**  
  `saveConfig` pre-checks the sync quota and reports a clear error instead of letting `set` fail silently.  
  `saveConfig` 保存前预检同步配额，超出时给出明确错误，而非让 `set` 静默失败。

- **Hardened Import Validation** / **强化导入校验**  
  Full structural validation (object types, string arrays, whitespace, global keys) rejects malformed backups.  
  完整的结构校验（对象类型、字符串数组、空白字符、全局键）拒绝畸形的备份文件。

- **Newest Rules on Top** / **最新规则置顶**  
  Redirect/tracking rule lists now show recently-added rules first, consistent with the whitelist.  
  重定向/跟踪规则列表现按倒序展示最新添加的规则，与白名单保持一致。

- **Clearer Whitelist Inherited Hint** / **白名单继承提示更清晰**  
  Subdomain-inherited whitelist state now reads "Inherited from X — link processing skipped on this site".  
  子域名继承的白名单状态现显示为"已由 X 继承，跳过此网站的链接处理"。

- **`preventClickRewrite` Warning** / **`preventClickRewrite` 副作用提示**  
  The toggle label now notes it may affect some site features.  
  该开关标签现注明可能影响部分网站功能。

- **Staged Popup Stats Refresh** / **弹窗统计分阶段刷新**  
  "Process Page" now refreshes counts at multiple intervals to cover slow-rendering pages.  
  "处理当前页面"现按多个时间间隔刷新统计，覆盖渲染较慢的页面。

- **Crisper Toolbar Icon** / **更清晰的工具栏图标**  
  Added the 48px action icon for high-DPI rendering.  
  新增 48px 工具栏图标，提升高分屏下的清晰度。

### Cleanup / 清理

- Removed the non-functional `processExistingLinks` setting (it was never exposed in the UI).  
  移除未生效且未在界面暴露的 `processExistingLinks` 设置。

- Removed dead commented-out polling fallback code.  
  移除注释掉的无用轮询后备代码。

- Deduplicated whitelist/rule-matching logic into shared `findWhitelistMatch` / `findRuleByDomain` helpers.  
  将白名单与规则匹配逻辑抽为共享的 `findWhitelistMatch` / `findRuleByDomain` 辅助函数。

- Localized the modal close-button tooltip.  
  模态框关闭按钮提示文本本地化。

## Version 1.4.2

### Bug Fixes / 问题修复

- **Fixed SPA Link Processing Failures** / **修复 SPA 链接处理失败**  
  Fixed a bug where link processing would fail on SPA navigation due to `requestIdleCallback` being called with incorrect arguments.  
  修复了由于 `requestIdleCallback` 参数错误导致 SPA 导航时链接处理失败的问题。

### Improvements / 改进

- **Hardened Link Processing & XSS Prevention** / **强化链接处理与 XSS 防护**  
  Strengthened URL validation and sanitization to prevent potential XSS vectors in redirect unwrapping.  
  加强 URL 验证与清理，防止重定向解包中的潜在 XSS 攻击向量。

### 📝 Documentation / 文档

- **Cleaned Up README** / **清理 README**  
  Removed emoji and decorative elements for a more professional appearance. Added Chinese README (`README.zh_CN.md`).  
  移除表情符号和装饰元素，更加专业；新增中文 README (`README.zh_CN.md`)。

## Version 1.4.0

### New Features / 新功能

- **Domain Whitelist** / **域名白名单**  
  Added per-site whitelist to skip link processing. Supports suffix matching (e.g., `deepseek.com` covers `chat.deepseek.com`). Manage whitelist in the options page or toggle current site directly from the popup.  
  新增按域名白名单跳过链接处理功能。支持后缀匹配（如 `deepseek.com` 自动覆盖 `chat.deepseek.com`）。可在选项页面管理，也可直接在弹出窗口切换当前网站。

- **Inherited Whitelist Indicator** / **白名单继承提示**  
  When a subdomain is whitelisted via a parent domain, the popup toggle is disabled and shows the source domain to prevent confusing UI state.  
  当子域名通过父域名继承白名单状态时，弹出窗口开关自动置灰并显示来源域名，避免无法关闭的困惑。

### Improvements / 改进

- **Removed Global Toggle** / **移除全局开关**  
  Replaced the coarse global on/off switch with fine-grained per-site whitelist control.  
  移除了粗放的全局启用/禁用开关，改为按网站细粒度控制。

### Bug Fixes / 问题修复

- **Fixed Batch Processing Deadlock** / **修复批处理死锁**  
  Fixed a critical bug where `batchProcessLinks` would drop remaining links forever when called with an empty array, causing only the first 100 links to be processed.  
  修复 `batchProcessLinks` 传入空数组时直接返回、导致剩余链接永远不被处理的关键 Bug（仅前 100 条生效）。

- **Fixed Reprocess Action** / **修复重新处理逻辑**  
  `reprocess` now correctly clears processed marks and re-scans all links instead of only touching unprocessed ones.  
  `reprocess` 现在会先清除已处理标记再全量重新扫描，而不是只碰未处理的链接。

- **Fixed SPA History Patch Leak** / **修复 SPA 历史方法重复包装**  
  Added guard to prevent `history.pushState/replaceState` from being patched multiple times on extension reload.  
  增加防护，防止扩展重载时对 `history.pushState/replaceState` 重复包装。

### Cleanup / 清理

- Removed defunct SegmentFault (`link.segmentfault.com`) redirect rule.  
  移除失效的 SegmentFault 重定向规则。

## Version 1.3.0

### New Features / 新功能

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

### Improvements / 改进

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

### Cleanup / 清理

- Removed unused `purify.min.js` dependency.  
  移除未使用的 `purify.min.js` 依赖。

## Version 1.2.0

### New Features / 新功能

- **Firefox Support** / **Firefox 支持**  
  Added Firefox browser compatibility with Manifest V3.  
  添加 Firefox 浏览器兼容性支持（Manifest V3）。

- **SPA Navigation Support** / **SPA 导航支持**  
  Automatically re-process links on single-page application route changes.  
  单页应用路由变化时自动重新处理链接。

### UI Enhancements / UI 增强

- Redesigned options page with tabbed interface.  
  重新设计选项页面，采用标签页界面。

- Updated extension icons for better visibility.  
  更新扩展图标，提升可见性。

**Full Changelog**: Compare with previous versions on GitHub.

**完整更新日志**: 在 GitHub 上查看与之前版本的对比。
