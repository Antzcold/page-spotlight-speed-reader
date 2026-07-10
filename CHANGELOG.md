# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Release rule

Every release is a **semver bump in `manifest.json`** (`"version"`) **plus a new
changelog entry**. The Chrome Web Store reads the version from `manifest.json`,
so that file — not `package.json` — is the source of truth for published
versions. Bump the changelog and `manifest.json` version together in the same
commit.

- **Patch** (1.0.0 → 1.0.1): bug fixes, no behavior change users would notice.
- **Minor** (1.0.0 → 1.1.0): backwards-compatible additions (new setting, new
  shortcut, new UI control).
- **Major** (1.0.0 → 2.0.0): breaking changes (removed feature, changed
  shortcut, changed storage shape that loses user settings).

## [1.1.0] - 2026-07-10

### Added

- **Start from anywhere in the article.** Select a word on the page (e.g.
  double-click) then press Start — reading begins at that word, with the text
  before it dimmed as already read.
- **Click to jump while reading.** While the reader is running or paused,
  click any word to move the reading position there; running keeps the pace,
  paused stays paused, and clicking after finishing re-arms the reader at
  that word.
- Wrapped words now show a pointer cursor and a subtle hover background while
  the reader is active.
- Popup tip surfacing both gestures.

## [1.0.0] - 2026-07-06

Initial public release.

### Added

- On-page word spotlight that paces through the main readable area of an
  article at a configurable words-per-minute.
- Popup UI with WPM, chunk size, auto-scroll, start/pause/stop/reset, and a
  live word-count / reading-time estimate.
- Keyboard shortcuts: toggle, stop, speed up/down (customizable in
  `chrome://extensions/shortcuts`).
- Developer tooling: Prettier formatting, ESLint linting, `tsc` type-checking,
  and GitHub Actions CI. See `DEVELOPMENT.md`.

[1.0.0]: https://github.com/Antzcold/page-spotlight-speed-reader/releases/tag/v1.0.0
[1.1.0]: https://github.com/Antzcold/page-spotlight-speed-reader/releases/tag/v1.1.0
