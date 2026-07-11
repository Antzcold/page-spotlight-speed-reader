# Page Spotlight Speed Reader

A Manifest V3 Chrome extension that highlights words in the main readable area of a page so you can pace your reading.

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
- **Manual mode (default):** the highlight advances only while you hold **Space** and freezes on the current chunk when you release it — hold to read, release to think. Space is left untouched when the reader isn't active or while you're typing. Turn off **Hold-to-read** in the popup for **automatic mode**, which advances on its own at the set WPM (the previous behavior).
- **Start from anywhere:** select a word on the page (e.g. double-click) before pressing Start to begin reading there. While reading, click any word to jump to it.
- The highlight renders as one continuous gradient band: the active chunk is solid, and the 3 words to the left fade out and the 3 to the right fade in, with the gaps between words filled so it reads as one unbroken window you can regress and preview across.
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

For a deeper, illustrated walkthrough of how `manifest.json`, `background.js`, `content.js`, `popup.html`, and `popup.js` cooperate — plus a full repository layout with clickable links to every file — open [how-it-works.html](how-it-works.html) in your browser.
