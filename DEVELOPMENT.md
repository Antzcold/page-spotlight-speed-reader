# Development

This document explains the tooling around this extension in plain language, for
someone new to software development. The extension itself is plain JavaScript
with no build step — these tools only help you catch mistakes and keep the code
consistent. They do **not** run inside the extension.

## The three tools and why they're separate

We use three checkers, each looking for a different class of problem. They are
deliberately non-overlapping:

- **Prettier — formatting (style).** Rewrites code to one consistent style
  (indentation, quotes, line wrapping). It never checks logic. Run with
  `npm run format`. The point is to stop humans arguing about style.
- **ESLint — bug patterns.** Looks for code smells and likely mistakes
  (unused variables, accidental globals, undefined references). It owns
  **no** style rules — Prettier handles those — so the two never disagree.
  Run with `npm run lint`.
- **tsc (TypeScript checker) — types.** Type-checks our plain JavaScript using
  JSDoc comments and the `@types/chrome` definitions. Catches things like
  calling `chrome.storage.snyc` (a typo of `sync`) before you ever load the
  extension. Run with `npm run typecheck`. This is **not** a TypeScript
  rewrite; the source stays `.js`.

Three separate jobs, three separate commands. If one fails, it tells you a
different kind of problem than the other two would.

`jsconfig.json` sets `strict: false` for now. Raising strictness later (turning
on `strict: true`, then `noImplicitAny`, etc.) is the natural growth path —
each flag will surface a batch of small JSDoc additions to fix.

## The day-to-day loop

1. Edit a file (e.g. `content.js`).
2. Run the local checks:
   ```
   npm run format && npm run lint && npm run typecheck
   ```
   Fix anything they report. (`format` rewrites files; `lint` and `typecheck`
   only report.)
3. Reload the extension at `chrome://extensions` (reload button on the
   extension's card), then **refresh** the page you're reading — content
   scripts already injected into an open tab are not replaced by a reload
   alone.
4. Commit (see git habits below), push, and let CI confirm. The GitHub
   Actions workflow runs the same three checks on every push and pull request.

## npm scripts

| Script                 | What it does                                                                     |
| ---------------------- | -------------------------------------------------------------------------------- |
| `npm run format`       | Reformat every file with Prettier.                                               |
| `npm run format:check` | Fail if any file is not formatted (used in CI).                                  |
| `npm run lint`         | Run ESLint.                                                                      |
| `npm run typecheck`    | Run `tsc` over the JS, no output files.                                          |
| `npm run package`      | Build `dist/extension.zip` containing only the files the Chrome Web Store needs. |

You need Node.js installed (any current LTS). `npm install` once, then the
scripts work offline.

## Basic git habits

- **Small commits.** One logical change per commit. This project's history is
  intentionally a sequence of focused commits (one per tool) so each can be
  reviewed on its own.
- **Imperative commit messages.** "Add ESLint config", not "Added ESLint
  config" — write it as if giving the repo an order.
- **Feature branches, even when solo.** `git checkout -b add-options-page`,
  do the work, push, open a pull request. CI runs on the PR before it merges.
  This keeps `main` always green and gives you a reviewable diff to look back
  at.

## Releasing

The Chrome Web Store reads the version from `manifest.json`, not
`package.json`. So a release is:

1. Bump `"version"` in `manifest.json` (semantic version: `MAJOR.MINOR.PATCH`).
2. Add a new entry to the top of `CHANGELOG.md` describing what changed.
3. Commit both together, push, tag if you like (`git tag v1.0.1`).
4. Run `npm run package` and upload `dist/extension.zip` to the Web Store.

See `CHANGELOG.md` for the versioning rules.

## The deferred testing path

There are no automated tests yet — that was a deliberate choice to keep the
initial setup small. When you're ready, the path is:

1. **Extract pure helpers into a shared module and unit-test them.** Functions
   like `formatDuration` (in `popup.js`), `countWords` and `clamp` (duplicated
   across `background.js` / `content.js` / `popup.js`) have no DOM
   dependencies and are easy to test. Move them into a small module (e.g.
   `src/utils.js`) and import it — which means converting the loading context
   to ES modules (manifest `"type": "module"` for the service worker,
   `<script type="module">` for the popup). Test with [Vitest](https://vitest.dev/).
   This is also the moment to de-duplicate the shared constants/helpers the
   `CLAUDE.md` architecture notes warn about.
2. **End-to-end tests with Playwright.** Use Playwright with a persistent
   browser context (`launchPersistentContext`) pointed at an unpacked copy of
   the extension (`--load-extension=...`), drive the popup and keyboard
   shortcuts, and assert on the highlighted word state in a test page. This is
   heavier and worth doing once the unit-test layer exists.

Start with step 1 — it gives the most value for the least setup.
