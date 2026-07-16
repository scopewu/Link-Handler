# Changelog

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
