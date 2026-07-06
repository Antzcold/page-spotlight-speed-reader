# PLAN.md — Bring this project up to industry-standard development practice

**Instructions for the implementing agent:** Work through the steps below in order. Make **one focused git commit per step** with an imperative message (e.g. "Add Prettier formatting config"). Do not change extension behavior — this is a tooling/process setup only. When all steps are done, run the Verification section and report the results. The owner is new to software development: when a step involves a judgment call, prefer the simple, conventional choice and briefly note why in the commit message or DEVELOPMENT.md.

## Context

This is a working vanilla-JS Manifest V3 Chrome extension ("Page Spotlight Speed Reader"): `manifest.json`, `background.js`, `content.js`, `popup.html/js/css`, `README.md`, `CLAUDE.md`. There is currently no git repo, no package.json, and no tooling. The extension is intentionally build-free and must stay that way — npm is used only for dev tooling.

Decisions already made with the owner:

- **Public GitHub repo** (portfolio value).
- **Type-check the existing JS with `tsc` + JSDoc** — no TypeScript rewrite.
- **Defer automated tests**, but document the path to them.

Environment (verified): Node 23.10, npm 10.9, git 2.45, gh CLI 2.94. Run `gh auth status` before Step 1.4; if not authenticated, pause and ask the owner to run `gh auth login`.

## Step 1 — Git foundation

1. `git init` in the project root.
2. Create `.gitignore` containing: `node_modules/`, `.DS_Store`, `*.zip`, `dist/`.
3. First commit: the existing extension exactly as-is (plus `.gitignore` and this PLAN.md). Keeping tooling changes out of the first commit makes every later change reviewable.
4. Create a **public** GitHub repo with `gh repo create` (suggested name: `page-spotlight-speed-reader`), set it as `origin`, push `main`.

## Step 2 — npm project + formatting (Prettier)

- `npm init -y`, then edit `package.json`: set `"private": true` and a meaningful description.
- Install `prettier` as a devDependency. Add `.prettierrc` (empty object / defaults is fine — consistency matters more than the specific style) and `.prettierignore` (`node_modules/`, `dist/`).
- Add scripts: `"format": "prettier --write ."` and `"format:check": "prettier --check ."`.
- Run `npm run format` once; commit the resulting diff separately from the config if it's large, otherwise together.
- Add `.editorconfig`: 2-space indent, LF line endings, UTF-8, final newline, trim trailing whitespace.

## Step 3 — Linting (ESLint 9, flat config)

- Install `eslint`, `@eslint/js`, and `globals` as devDependencies.
- Create `eslint.config.js` starting from `@eslint/js` recommended rules. Language options: `globals.browser` + `globals.webextensions` (provides `chrome`) for `content.js`/`popup.js`; `globals.serviceworker` + `globals.webextensions` for `background.js`. Add **no style rules** — Prettier owns formatting.
- Add script: `"lint": "eslint ."`.
- Run it and fix any findings (expected: few; the code is clean).

## Step 4 — Type checking JS with tsc (no rewrite)

- Install `typescript` and `@types/chrome` as devDependencies.
- Create `jsconfig.json`: `checkJs: true`, `strict: false` (note in DEVELOPMENT.md that raising strictness later is the growth path), `lib: ["ES2022", "DOM"]`, `types: ["chrome"]`, exclude `node_modules`.
- Add script: `"typecheck": "tsc -p jsconfig.json --noEmit"`.
- Fix reported issues. Where the checker needs help, add JSDoc annotations (`/** @type {...} */`, `@param`, `@returns`) rather than restructuring code.

## Step 5 — CI (GitHub Actions)

- Create `.github/workflows/ci.yml`: trigger on `push` and `pull_request`; one job on `ubuntu-latest`: checkout → setup-node (LTS, npm cache) → `npm ci` → `npm run format:check` → `npm run lint` → `npm run typecheck`.
- Push and confirm the Actions run is green before moving on.

## Step 6 — Release/packaging hygiene

- Add script `"package"` that zips the extension into `dist/extension.zip`, excluding `node_modules`, `.git`, `dist`, dotfiles, `PLAN.md`, `DEVELOPMENT.md`, `CHANGELOG.md`, `package*.json`, and config files — i.e. only what the Chrome Web Store needs (`manifest.json`, the JS/HTML/CSS, icons if added later).
- Create `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com) format with `1.0.0` as the first entry. State the release rule: every release = semver bump in `manifest.json` + changelog entry.

## Step 7 — Documentation for the human (the learning part)

- Create `DEVELOPMENT.md` explaining in plain language, briefly:
  - Why each tool exists and how they differ: **Prettier** (style), **ESLint** (bug patterns), **tsc** (types) — three separate jobs, deliberately not overlapping.
  - The day-to-day loop: edit → `npm run format && npm run lint && npm run typecheck` → reload extension at `chrome://extensions` + refresh the page → commit → push → CI confirms.
  - Basic git habits: small commits, imperative messages, feature branches even when solo.
  - **The deferred testing path**: when ready, extract pure helpers (`formatDuration`, `countWords`, `clamp`) into a shared module and unit-test with Vitest; later, Playwright with a persistent browser context for extension end-to-end tests.
- Update `README.md`: add a short "Development" section pointing to DEVELOPMENT.md and listing the npm scripts.
- Update `CLAUDE.md`: replace the "no build, lint, or test commands" statement with the new npm scripts; keep the duplicated-constants caveat and architecture notes intact.

## Files created/modified

New: `.gitignore`, `package.json` + `package-lock.json`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `eslint.config.js`, `jsconfig.json`, `.github/workflows/ci.yml`, `CHANGELOG.md`, `DEVELOPMENT.md`.
Modified: `README.md`, `CLAUDE.md`, plus any lint/typecheck/format fixes in the three `.js` files.

## Verification

1. `npm run format:check`, `npm run lint`, and `npm run typecheck` all pass locally.
2. Prove the guards work: temporarily introduce `chrome.storage.snyc` somewhere, confirm `npm run typecheck` fails, then revert.
3. `git log --oneline` shows small, well-named commits; the repo is visible on GitHub; the Actions run is green.
4. `npm run package` produces `dist/extension.zip` containing only extension files.
5. Ask the owner to reload the unpacked extension in Chrome and start the reader on an article page — behavior must be unchanged.
