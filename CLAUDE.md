# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Page Spotlight Speed Reader" — a Manifest V3 Chrome extension written in plain JavaScript (no build system, no dependencies, no tests). It highlights words in the main readable area of a page at a configurable pace.

## Development Workflow

There are no build, lint, or test commands. To develop:

1. Load the folder as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked).
2. After editing any file, click the reload button for the extension on `chrome://extensions`, then refresh the target page (content scripts already injected into open tabs are not replaced by a reload alone).

## Architecture

Three isolated Chrome extension contexts communicate exclusively through `chrome.tabs.sendMessage` with `SPEED_READER_*` message types:

- **`background.js`** (service worker) — handles keyboard shortcuts (`chrome.commands`) defined in `manifest.json`: toggle, stop, speed up/down.
- **`popup.js` / `popup.html` / `popup.css`** — settings UI (WPM, chunk size, auto-scroll), start/pause/stop/reset controls, and word-count/time estimate display.
- **`content.js`** — all reading logic. Injected **on demand** (not declared in `manifest.json`): both background and popup use a ping-then-inject pattern (`SPEED_READER_PING`, fall back to `chrome.scripting.executeScript`). Re-injection is guarded by the `window.__pageSpotlightSpeedReader` flag, so a stale copy keeps running until the page is refreshed.

### Message protocol

Types handled in `content.js` `handleMessage()`: `PING`, `STATUS`, `ESTIMATE`, `TOGGLE`, `STOP`, `RESET`, `SETTINGS` (all prefixed `SPEED_READER_`). Responses are `{ status, estimate? }` where status is one of `ready | running | paused | done | no_content` (popup adds `unsupported` and `injection_error` locally).

### Intentionally duplicated constants

`DEFAULT_SETTINGS` (wpm 350, chunkSize 1, autoScroll true), `clamp()`, `isSupportedUrl()`, and the clamp ranges (WPM 100–1000 in steps of 25, chunk size 1–5) are repeated in `background.js`, `popup.js`, and `content.js` because the contexts can't share modules. Keep all copies in sync when changing them.

### content.js internals

- **Readable-root detection** (`findReadableRoot`): prefers `article`/`main`/`[role='main']` if it scores ≥ 120, otherwise scores `article/main/section/div` candidates (text length + 250 per substantial `<p>` + heading bonus, threshold 240). It expands to the common ancestor of all readable blocks when the direct candidate covers < 85% of the page's readable words. Blocks are filtered by the `EXCLUDED_SELECTOR` lists and distraction heuristics (`DISTRACTION_*` patterns catch ads/newsletter/signup boxes).
- **Word wrapping** (`wrapWords`): text nodes inside readable blocks (`p, li, blockquote, h1–h3`) are replaced with wrapper spans containing one `pssr-word` span per word. Originals are saved in `reader.originals` and restored on `reset()` — any DOM mutation logic must preserve this restore path.
- **Pacing**: `scheduleNext()` uses chained `setTimeout` with interval `(60000 / wpm) * chunkSize`, floored at 80ms.
- All injected DOM/CSS uses the `pssr` prefix; the HUD (`#pssr-hud`) shows transient WPM/status messages.

Settings persist in `chrome.storage.sync`; the popup listens to `chrome.storage.onChanged` so keyboard-shortcut speed changes made via the background worker are reflected live in an open popup.
