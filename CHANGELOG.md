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

## [1.3.0] - 2026-07-11

### Added

- **Manual (hold-Space) mode.** A new default reading mode: the highlight
  advances only while you hold Space and freezes on the current chunk when
  you release it — hold to read, release to think. A fixed WPM can't match
  the varying difficulty of real text, so you set a ceiling pace and control
  the flow by hand. The previous behavior is now "automatic mode",
  switchable in the popup. Space is left untouched when the reader isn't
  active, while typing into a field, or in automatic mode.
- **Regression and parafoveal-preview fade.** Around the highlighted chunk,
  the 3 words to the left fade out (the eye can regress to just-read words)
  and the 3 words to the right fade in (the parafovea can preview upcoming
  words), turning the spotlight into a gradient window. The fade follows
  every position change — tick, click-jump, and resume — and clamps
  naturally at the start and end of the article.

### Changed

- **Continuous highlight band.** The highlight now renders as one continuous
  gradient band: the whitespace between highlighted words is filled in so the
  chunk and its surrounding fade read as one unbroken block, and the grey
  ring around the active chunk is gone.

### Removed

- **Line-guide band.** The faint full-width stripe that tracked the line
  being read is gone — its job (giving the eye a target after the return
  sweep) is now done by the parafoveal preview words. The line-break dwell
  (the first chunk of a new line lingers ~35% longer) remains.

## [1.2.0] - 2026-07-10

### Added

- **Line guide band.** A faint full-width stripe now tracks the line being
  read, sliding down the page as reading crosses lines — a big target the
  eye can follow across the return sweep. It stays glued to its line
  through scroll and reflow, covers both lines when a chunk wraps across a
  line break, and disappears on stop, reset, or finish.
- **Line-break pause.** The first chunk of each new line lingers ~35%
  longer, giving the eye time to complete its sweep to the next line
  before the highlight moves on.

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

[1.3.0]: https://github.com/Antzcold/page-spotlight-speed-reader/releases/tag/v1.3.0
[1.0.0]: https://github.com/Antzcold/page-spotlight-speed-reader/releases/tag/v1.0.0
[1.1.0]: https://github.com/Antzcold/page-spotlight-speed-reader/releases/tag/v1.1.0
[1.2.0]: https://github.com/Antzcold/page-spotlight-speed-reader/releases/tag/v1.2.0
