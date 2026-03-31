# AGENTS.md — Link Handler Extension

## Project Overview

A Chrome/Edge/Firefox browser extension (Manifest V3) that automatically processes links on all web pages:
unwraps redirect links, removes tracking attributes/parameters, and fixes same-origin `target="_blank"`.

**No build system, bundler, or package manager.** The extension loads directly from source files.

## Build / Run / Test Commands

There is **no build step**. To install for development:

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer Mode**
3. Click **Load unpacked** → select the `link-handler-extension/` folder

There is **no test framework**. No linting or formatting tools are configured.
To verify changes: reload the extension in the browser and test manually.

## Repository Structure

```
link-handler-extension/
├── manifest.json          # Extension manifest (MV3)
├── config.js              # DEFAULT_CONFIG, getConfig(), saveConfig(), mergeConfig()
├── content.js             # Content script — core link processing logic
├── _locales/              # i18n message files (en, zh_CN, zh_TW)
│   └── {locale}/messages.json
├── options/               # Popup & settings UI
│   ├── popup.html/css/js  # Toolbar popup
│   ├── options.html/css/js # Full settings page (tabbed)
│   └── i18n.js            # Internationalization helper (chrome.i18n + fallback)
└── icons/                 # Extension icons (PNG + SVG source)
```

## Code Style & Conventions

### Language & Syntax

- **Vanilla JavaScript (ES6+)**. No TypeScript, no JSX.
- **`'use strict'`** inside every IIFE wrapper (content.js, popup.js, options.js).
- All JS source files use **IIFE pattern** `(function() { ... })();` to avoid global scope pollution, except `config.js` and `i18n.js` which expose globals intentionally.

### Naming

- **Constants**: `UPPER_SNAKE_CASE` — e.g. `DEFAULT_CONFIG`, `PROCESSED_MARK`.
- **Functions & local variables**: `camelCase` — e.g. `processLink`, `findRedirectRule`, `pendingLinks`.
- **DOM element IDs**: `camelCase` — e.g. `redirectCount`, `addRedirectRule`, `processNow`.
- **CSS classes**: `kebab-case` — e.g. `rule-item`, `stat-card`, `toggle-switch`.
- **CSS custom properties**: `--kebab-case` — e.g. `--bg-primary`, `--primary-500`, `--radius-md`.
- **i18n message keys**: `camelCase` — e.g. `removeTargetSameOrigin`, `processingSuccess`.
- **data attributes**: `data-kebab-case` — e.g. `data-i18n`, `data-tab`, `data-field`.

### Comments

- **Written in Chinese (中文)**. Top-of-file comments describe the module purpose.
- Example: `// 内容脚本 - 链接处理器`, `// 默认配置 - 链接处理器扩展`.
- Inline comments also in Chinese for explanations.

### Error Handling

- Wrap risky operations in `try/catch` — especially URL parsing (`new URL()`) and `chrome.storage` calls.
- Use bare `catch {}` (no parameter) when the error is intentionally ignored (e.g. URL parse failures).
- Log errors with `console.error('[Link Handler]', message, error)`.
- Log info with `console.log('[Link Handler]', message)`.

### Async Patterns

- Use `async/await` for `chrome.storage` API calls.
- Check for API availability before use: `typeof chrome !== 'undefined' && chrome.storage`.
- CommonJS export at file bottom for Node compatibility: `if (typeof module !== 'undefined' && module.exports)`.

### DOM & Events

- Check `document.readyState` before accessing DOM; add `DOMContentLoaded` listener if needed.
- Use **event delegation** on `document` for dynamically created elements (see options.js `handleDelegatedClick`).
- Use `requestIdleCallback` with `setTimeout` fallback for batch DOM processing.
- Use `MutationObserver` for dynamically loaded content.
- Mark processed elements with `data-` attributes to avoid reprocessing.

### CSS

- **CSS custom properties** defined in `:root` for colors, spacing, shadows, typography.
- Google Fonts loaded via `@import`: `Plus Jakarta Sans` (headings/labels), `Outfit` (body text).
- System font stack as fallback: `-apple-system, BlinkMacSystemFont, sans-serif`.
- Transitions use `cubic-bezier(0.4, 0, 0.2, 1)` via `--transition-fast` / `--transition-base`.
- Responsive: `@media (max-width: 768px)` breakpoints.
- Accessibility: `@media (prefers-reduced-motion: reduce)` disables animations.
- No CSS preprocessor — plain `.css` files.

### HTML

- Inline SVG icons (no icon library dependency).
- `data-i18n` attributes on elements for i18n text content.
- `data-i18n-placeholder` for input placeholders.
- `data-i18n-title` for title attributes.

### Configuration (config.js)

- `DEFAULT_CONFIG` is a single global constant with `redirectRules`, `trackingRules`, and `global` sections.
- Rules are arrays of objects with `domain`, `enabled`, `description`, and type-specific fields.
- `getConfig()` merges user overrides from `chrome.storage.sync` onto defaults.
- `saveConfig()` writes to `chrome.storage.sync`.
- `mergeConfig()` does a shallow merge for rules and a spread merge for `global`.

### Internationalization

- Chrome i18n API (`chrome.i18n.getMessage`) is primary.
- `i18n.js` provides a fallback for non-extension contexts (loads JSON via `fetch`).
- Locale files in `_locales/{locale}/messages.json` use Chrome's format: `{ "key": { "message": "...", "description": "..." } }`.
- Placeholders use `$1$`, `$2$` syntax in messages.

## Key Patterns to Follow

1. **Process links in phases**: redirect unwrap → target removal → tracking cleanup. See `processLink()` in content.js.
2. **Batch processing**: Push links to `pendingLinks` array, process 100 at a time via `requestIdleCallback`.
3. **Processed marking**: Set `data-link-handler-processed="true"` on links to prevent reprocessing.
4. **SPA support**: Monkey-patch `history.pushState`/`replaceState` + listen to `popstate` to re-process on navigation.
5. **URL validation**: Always validate unwrapped URLs with `isValidUrl()` (check `http:` or `https:` protocol).
6. **Environment detection**: Use `typeof chrome !== 'undefined'` checks before accessing Chrome APIs.

## What NOT to Do

- Do NOT introduce a build system, bundler, or package.json without explicit approval.
- Do NOT add TypeScript — this is a vanilla JS project.
- Do NOT add npm dependencies.
- Do NOT use `var` — use `const` or `let`.
- Do NOT pollute the global scope (use IIFEs or module pattern).
- Do NOT bypass the `[Link Handler]` log prefix convention.
- Do NOT write comments in English when existing code uses Chinese.
