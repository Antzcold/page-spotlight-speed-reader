# Page Spotlight Speed Reader

A Manifest V3 Chrome extension that highlights words in the main readable area of a page so you can pace your reading.

## Repository layout

The extension itself is build-free: the four files under **Extension source** are what Chrome loads. Everything else is configuration, documentation, or dev tooling.

### Extension source

- **`manifest.json`** — the extension's config. Declares permissions (`activeTab`, `scripting`, `storage`, `tabs`), the background service worker, the popup, and the keyboard shortcuts. Notably, `content.js` is **not** listed as a static content script — it's injected on demand.
- **`background.js`** — the invisible service worker. Listens for keyboard shortcuts, finds the active tab, ensures `content.js` is loaded there (ping-then-inject), and forwards a `SPEED_READER_*` message. Owns no UI.
- **`content.js`** — the reading engine. Runs inside the page. Finds the readable article, wraps each word in a span, and highlights one chunk at a time on a `setTimeout` timer. The only file that touches the page's DOM.
- **`popup.html` / `popup.js` / `popup.css`** — the settings panel shown when you click the extension icon. Shows WPM, chunk size, auto-scroll, status, and a live word/time estimate; sends messages to `content.js`.

### Documentation

- **`README.md`** — this file. User-facing intro, install + usage, dev workflow.
- **`DEVELOPMENT.md`** — plain-language explanation of the dev tooling and the day-to-day loop, written for someone new to software development.
- **`CLAUDE.md`** — guidance for Claude Code (and any AI assistant) working in this repo: architecture, message protocol, and the intentionally-duplicated constants caveat.
- **`CHANGELOG.md`** — release history in [Keep a Changelog](https://keepachangelog.com) format. The release rule: every release is a semver bump in `manifest.json` plus a changelog entry.
- **`PLAN.md`** — the original step-by-step plan that set up this repo's tooling. Kept as a historical record of how the project reached its current dev practice.

### Dev tooling & config

- **`package.json` / `package-lock.json`** — npm metadata for the dev tooling only (Prettier, ESLint, TypeScript, `@types/chrome`). The extension has no runtime dependencies.
- **`.prettierrc` / `.prettierignore`** — Prettier formatting config. Prettier owns style; its config is intentionally near-empty (defaults are fine).
- **`eslint.config.js`** — ESLint 9 flat config. Adds only bug-pattern rules from `@eslint/js` (no style rules, so it never fights Prettier) and scopes globals per file (browser vs. service worker).
- **`jsconfig.json`** — configures `tsc` to type-check the plain JS (`checkJs: true`, `strict: false`) using JSDoc + `@types/chrome`, without rewriting anything to TypeScript.
- **`.editorconfig`** — tells editors to use 2-space indent, LF line endings, UTF-8, final newline, trimmed trailing whitespace.
- **`.github/workflows/ci.yml`** — GitHub Actions CI: runs `format:check`, `lint`, and `typecheck` on every push and pull request.
- **`.gitignore`** — ignores `node_modules/`, `dist/`, `.DS_Store`, `*.zip`, and `.claude/`.
- **`how-it-works.html`** — a standalone, styled HTML page that explains in depth how the five core files work together.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project folder.

## Use

- Open an article or documentation page.
- Click the extension icon.
- Set words per minute, chunk size, and auto-scroll.
- Press **Start**.
- After changing extension files, click the reload button for this extension on `chrome://extensions`, then refresh the page you want to read.

Keyboard shortcuts can be changed in `chrome://extensions/shortcuts`.

Default shortcuts:

- Toggle reader: `Alt+Y`
- Increase speed: `Alt+Up`
- Decrease speed: `Alt+Down`
- Stop and clean up: `Alt+S`

On macOS, Chrome may show the shortcuts as `Command+Shift+Y`, `Command+Shift+Up`, `Command+Shift+Down`, and `Command+Shift+S`.

## Development

This is a vanilla-JS extension with no build step. Developer tooling (formatting,
linting, type-checking, packaging) is provided via npm scripts:

- `npm install` — install dev tooling once.
- `npm run format` — reformat code with Prettier.
- `npm run lint` — run ESLint.
- `npm run typecheck` — type-check the JS with `tsc` + JSDoc.
- `npm run package` — build `dist/extension.zip` for the Chrome Web Store.

After editing extension files, run `npm run format && npm run lint && npm run typecheck`, then reload the unpacked extension at `chrome://extensions` and refresh the page you want to read. See [DEVELOPMENT.md](DEVELOPMENT.md) for the full workflow and the reasoning behind each tool.

## Learn more

For a deeper, illustrated walkthrough of how `manifest.json`, `background.js`, `content.js`, `popup.html`, and `popup.js` cooperate, open [how-it-works.html](how-it-works.html) in your browser.
