# AGENTS.md — Link Handler Extension

A Chrome/Edge/Firefox (Manifest V3) extension that auto-processes links on every page:
unwraps redirect links, strips tracking params/attributes, and removes same-origin `target="_blank"`.

**No build system, no bundler, no `package.json`, no TypeScript, no npm deps.** Source files load
directly from `link-handler-extension/`. Do not introduce any of these without explicit approval.

## Install / Verify

No build/test/lint commands exist. To verify a change:

1. `node --test` from the repo root runs the unit tests in `tests/` (built-in `node:test`, no deps).
2. `chrome://extensions` (or `edge://extensions`) → enable **Developer Mode**
3. **Load unpacked** → select `link-handler-extension/`
4. Reload the extension after each edit; test manually on real pages.

Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`.

## Repository Layout

```
link-handler-extension/
├── manifest.json          # MV3 manifest; declares TWO content-script entries (see below)
├── config.js              # DEFAULT_CONFIG + getConfig/saveConfig/applyStoredConfig/decomposeConfig/applyConfigDiff/buildSanitizeHostMap/findDomainMatch（域名后缀匹配，白名单与规则查找共用）
├── spa-hook.js            # MAIN-world script; patches history + sanitizes address-bar tracking params
├── content.js             # Isolated-world content script; core link processing
├── _locales/{en,zh_CN,zh_TW}/messages.json
├── options/               # base.css（共享设计变量 + prefers-color-scheme 深色模式）, popup.{html,css,js}, options.{html,css,js}, rule-modal.js（规则弹窗，ES module，由 options.js `import * as RuleModal` 后 init(deps) 注入依赖）, i18n.js（ES module，`export { i18n }`）
└── icons/                 # icon{16,32,48,96,128}.png + icon.svg
```

## Architecture: Two Content Scripts, Two Worlds

`manifest.json` registers **two** content scripts that must stay in sync:

- `spa-hook.js` — `run_at: document_start`, `world: MAIN`. Two responsibilities:
  1. Patches `history.pushState` / `replaceState` and notifies the isolated world via
     `window.postMessage` with `source: 'link-handler-spa'`, `type: 'navigation'`.
  2. **Strips tracking params from the address bar** — both from URLs passed into the patched
     `pushState`/`replaceState` and via `sanitizeCurrentUrl()`. The sanitization config is
     **not hardcoded here**: `content.js` sends `{ source: 'link-handler-spa',
     type: 'sanitize-config', hosts }` (built by `buildSanitizeHostMap()` from **all enabled
     tracking rules that have `cleanUrlParams`** — address-bar cleaning is a default behavior
     of tracking cleanup, sharing one parameter list with link cleaning).
     Whitelisted pages — or the global tracking toggle being off — receive an empty map,
     which disables address-bar cleaning.
     If you add tracking params for a site, only edit `config.js`.
- `config.js` + `content.js` — `run_at: document_end`, default (isolated) world. `content.js`
  listens for the postMessage above, plus `popstate` / `hashchange`, and re-runs processing.
  It re-sends `sanitize-config` whenever the config is (re)loaded (initial load,
  `storage.onChanged`, popup `reprocess` message).

**Why split?** Isolated-world content scripts cannot patch the page's own `history` object or
rewrite the address bar — both require MAIN world. Do not collapse the two scripts or you will
silently break SPA navigation (React/Vue/Angular) and address-bar sanitization. The message
source string is the contract between the two files.

## Storage Format (v2 diff-based) — DO NOT BREAK

`chrome.storage.sync` key: **`linkHandlerConfig`**.

Since storage `version: 2`, user config is stored as a **diff against `DEFAULT_CONFIG`**, not a
full snapshot. This is intentional: when the extension ships new/updated built-in rules, they
automatically take effect for existing users.

- `saveConfig()` runs `decomposeConfig()` → writes `{ version, customRedirectRules,
  customTrackingRules, redirectRuleOverrides, trackingRuleOverrides,
  removedBuiltinRedirectRules, removedBuiltinTrackingRules, whitelistAdded, whitelistRemoved,
  global }`.
- `getConfig()` runs `applyConfigDiff(DEFAULT_CONFIG, diff)` → reconstructs the full config.
- `applyStoredConfig()` dispatches on `stored.version`: v2 → `applyConfigDiff`; anything else
  (including v1 leftovers) falls back to a deep copy of `DEFAULT_CONFIG`.

If you add a config field, you must update BOTH `decomposeConfig` and `applyConfigDiff`, or
round-tripping through storage will silently drop it.

## Processing Pipeline (content.js)

Per-link phases, in order — keep the order: redirect unwrap → target removal → tracking cleanup.
See `processLink()`.

- Links pushed to `pendingLinks`, drained in batches via `requestIdleCallback` (with `setTimeout`
  fallback). Hard cap `MAX_PENDING = 10000` (drops oldest).
- Mark processed links with `data-link-handler-processed="true"` to avoid reprocessing.
- Unwrapped URLs must pass `isValidUrl()` (only `http:`/`https:` allowed) before assignment.
- SPA navigation handler debounces (100ms) then re-runs at 0 / 300 / 800 ms to catch async loads.
- Whitelist uses **suffix matching** — `deepseek.com` covers `chat.deepseek.com`.

## Conventions That Are Easy to Get Wrong

- **Comments are in Chinese (中文).** Top-of-file and inline. Match this — do not switch to English.
- **`[Link Handler]` log prefix** on every `console.log` / `console.error` — e.g.
  `console.log('[Link Handler]', ...)`.
- **IIFE + `'use strict'`** for `content.js` and `spa-hook.js` — MV3 content scripts cannot be
  ES modules, so they need the IIFE for scope isolation. Extension pages (`options.js`,
  `popup.js`, `rule-modal.js`, `i18n.js`) are ES modules loaded via `<script type="module">`:
  module scope and strict mode come for free, no IIFE needed, and they import each other
  explicitly instead of relying on `<script>` order. `config.js` stays a classic script
  everywhere (it is also a manifest-injected content script); its top-level `const` bindings
  live in the global lexical environment, so page modules can reference
  `getConfig`/`saveConfig`/`DEFAULT_CONFIG` directly.
- **No `var`.** `const` / `let` only.
- All Chrome API access must be guarded with `typeof chrome !== 'undefined' && chrome.<api>`.
- Wrap `new URL(...)` and `chrome.storage` calls in `try/catch`; bare `catch {}` is acceptable
  when the error is intentionally ignored.
- `config.js` ends with a CommonJS export shim
  (`if (typeof module !== 'undefined' && module.exports)`) for Node-based tooling/tests.
  (`i18n.js` is an ES module and exports via `export { i18n }` — not Node-importable, and the
  tests don't need it.)
- i18n message placeholders use Chrome's `$1$`, `$2$` syntax. Every `$name$` referenced in a
  `message` MUST also have a matching entry in that message's `placeholders` field
  (e.g. `"placeholders": { "1": { "content": "$1", "example": "utm_source" } }`); otherwise
  Chrome logs `Variable $1$ used but not defined` on load and `getMessage` returns `""` for that key.
  Locale files live under `_locales/{locale}/messages.json` in Chrome's
  `{ "key": { "message": "...", "description": "..." } }` shape.

## What NOT to Do

- No build system, bundler, `package.json`, TypeScript, or npm dependencies.
- No `var`. No global scope pollution (use IIFEs / module pattern).
- No English comments where the file already uses Chinese.
- Do not bypass the `[Link Handler]` log prefix.
- Do not collapse `spa-hook.js` into `content.js`, and do not change the
  `'link-handler-spa'` / `'navigation'` / `'sanitize-config'` message contract without updating
  both files.
- Do not change the storage format without bumping `STORAGE_VERSION` and handling migration.
