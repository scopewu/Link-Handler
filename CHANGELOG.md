# Changelog

## Version 1.6.1

### Bug Fixes

- **Config-Driven Address-Bar Sanitization**
  The Bilibili tracking-parameter list is no longer hardcoded in the MAIN-world SPA hook.
  `content.js` now sends the sanitization map via a `sanitize-config` message, built from
  **all enabled tracking rules with `cleanUrlParams`** — address-bar cleaning is a default
  behavior of tracking cleanup, sharing the same parameter list as link cleaning. Editing a
  rule in options takes effect on the address bar immediately; disabling the rule,
  whitelisting the site, or turning off the global tracking toggle disables address-bar
  cleaning too.

- **Jianshu Redirect Rule**
  Verified against real links on Jianshu: redirect links use `links.jianshu.com/go?to=...`,
  so the unwrap parameter is `to` (path `/go`, matching the `links.jianshu.com` subdomain via
  suffix matching). README examples updated to match.

- **Removed Dead t.cn Rule**
  `t.cn` short links never carry a `url` query parameter, so the rule could never match.
  Removed it from the built-in redirect rules.

- **Reprocess Coalescing**
  The popup's manual reprocess message and `chrome.storage.onChanged` fired back-to-back on
  every config save, causing a double full-page rescan. Both paths now share a single
  debounced reprocess.

- **Minimal Permissions**
  Dropped `host_permissions: <all_urls>` (not needed by manifest-declared content scripts);
  added `activeTab` so the popup can still read the current tab's URL.

- **Renamed `mergeConfig` → `applyStoredConfig`**
  The old name suggested legacy-v1 handling; it actually dispatches on `stored.version`
  (v2 diff → `applyConfigDiff`, anything else → defaults).

### Tests

- Added `tests/config.test.mjs` (built-in `node:test`, no dependencies) covering diff
  round-trips, canonicalized rule comparison, fallback behavior, and
  `buildSanitizeHostMap()`. Run with `node --test`.

---

## Version 1.6.0

### New Features

- **Global Tracking Parameter Cleanup**
  Added a global parameter blocklist that strips common tracking parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `fbclid`, `gclid`, `msclkid`, `mc_cid`, `mc_eid`) from links on all websites. Stacks on top of the existing per-domain tracking rules and follows the global tracking toggle. Editable from the General tab.

### Bug Fixes

- **Stats Counting**
  The per-domain and global cleanup steps no longer double-count a single link in the "cleaned" statistic.

- **URL Cleaning Consistency**
  The wildcard (`*`) URL-parameter cleanup now records the rewritten `href`, fixing a latent inconsistency where the change could be misclassified on later mutations.

---

## Version 1.5.2

### New Features

- **In-Options User Guide**
  Added a "Help" tab to the options page with documentation explaining every configuration option, including redirect rules, tracking cleanup rules, whitelist behavior, and backup/restore.

---

## Version 1.5.1

### New Features

- **Block Bilibili Address-Bar Tracking Parameters**
  The MAIN-world SPA hook now intercepts `history.pushState`/`replaceState` on `bilibili.com` and strips tracking parameters (including `vd_source`) before they are written to the browser history. Also cleans the current URL on page load.

---

## Version 1.5.0

### New Features

- **MAIN-World SPA Navigation Hook**
  Added `spa-hook.js` injected into the page's `MAIN` world to intercept `history.pushState`/`replaceState` and `popstate`, then notify the content script via `postMessage`. Fixes cases where isolated-world history patching missed real SPA navigations.

- **Live Config Updates**
  The content script now listens to `chrome.storage.onChanged` and applies configuration changes in real time without requiring a page reload.

- **Rule Path Scoping**
  Redirect rules now support an optional `pathPattern` so the same domain can have different handlers for different redirect endpoints (e.g., Facebook `/flx/warn/...`, SSPAI `/go/...`, Jianshu `/p/...`).

### Improvements

- **Diff-Based Config Storage (v2)**
  User settings are stored as a diff against the default config (custom rules, builtin overrides, and removed builtins). This lets builtin rule updates reach existing users on upgrade instead of being frozen at install time.

- **Safer Bilibili Parameter Cleaning**
  Replaced the `*` wildcard in the Bilibili tracking-param rule with an explicit blacklist, preserving functional parameters such as video timestamp (`t`) and page (`p`).

- **Robust Click Delegation**
  The delegated click-rewrite guard now runs at the document capture phase to reliably intercept middle-click and modified-click behavior.

- **Modal Form Hardening**
  Unknown rule fields are preserved when editing; unsubmitted tag input is collected on save; modal forms are guarded against attribute injection.

- **Optimized MutationObserver Reprocessing**
  The normalized `href` is stored in a `data-` attribute to avoid reprocessing links whose effective URL has not changed.

### Cleanup

- Removed the unused `processExistingLinks` setting and leftover polling code.

---

## Version 1.4.2

### Bug Fixes

- **Fixed SPA Link Processing Failures**
  Fixed a bug where link processing would fail on SPA navigation due to `requestIdleCallback` being called with incorrect arguments.

### Improvements

- **Hardened Link Processing & XSS Prevention**
  Strengthened URL validation and sanitization to prevent potential XSS vectors in redirect unwrapping.

### Documentation

- **Cleaned Up README**
  Removed emoji and decorative elements for a more professional appearance. Added Chinese README (`README.zh_CN.md`).

---

## Version 1.4.0

### New Features

- **Domain Whitelist**
  Added per-site whitelist to skip link processing. Supports suffix matching (e.g., `deepseek.com` covers `chat.deepseek.com`). Manage whitelist in the options page or toggle current site directly from the popup.

- **Inherited Whitelist Indicator**
  When a subdomain is whitelisted via a parent domain, the popup toggle is disabled and shows the source domain to prevent confusing UI state.

### Improvements

- **Removed Global Toggle**
  Replaced the coarse global on/off switch with fine-grained per-site whitelist control.

### Bug Fixes

- **Fixed Batch Processing Deadlock**
  Fixed a critical bug where `batchProcessLinks` would drop remaining links forever when called with an empty array, causing only the first 100 links to be processed.

- **Fixed Reprocess Action**
  `reprocess` now correctly clears processed marks and re-scans all links instead of only touching unprocessed ones.

- **Fixed SPA History Patch Leak**
  Added guard to prevent `history.pushState/replaceState` from being patched multiple times on extension reload.

### Cleanup

- Removed defunct SegmentFault (`link.segmentfault.com`) redirect rule.

---

## Version 1.3.0

### New Features

- **Link Processing Statistics**
  Real-time display of processed links count in popup. Tracks total processed, redirect unwrapped, target removed, and tracking cleaned statistics.

- **Add Rules via Modal**
  Added intuitive modal dialogs for creating new redirect and tracking rules with built-in validation.

- **Search & Filter**
  Added search functionality to quickly find specific rules in the options page.

- **Auto-Save Configuration**
  Settings are now automatically saved when changed, no manual save required.

### Improvements

- **Enhanced URL Validation**
  Improved URL parsing and validation logic for better security and compatibility.

- **Better Same-Origin Handling**
  Optimized logic for removing `target="_blank"` from same-origin links.

- **URL Parameter Cleaning**
  Enhanced tracking parameter removal with wildcard support (`*` to remove all params).

- **Tag Input Experience**
  Improved tag input handling in rule editing modal with better keyboard navigation.

### Cleanup

- Removed unused `purify.min.js` dependency.

---

## Version 1.2.0

### New Features

- **Firefox Support**
  Added Firefox browser compatibility with Manifest V3.

- **SPA Navigation Support**
  Automatically re-process links on single-page application route changes.

### UI Enhancements

- Redesigned options page with tabbed interface.

- Updated extension icons for better visibility.

---

**Full Changelog**: Compare with previous versions on GitHub.
