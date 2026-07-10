(() => {
  // `window` carries an extension-specific guard flag the type libs don't know about.
  const win = /** @type {any} */ (window);

  if (win.__pageSpotlightSpeedReader) {
    return;
  }

  const CLASS_PREFIX = "pssr";
  const STYLE_ID = "pssr-styles";
  const HUD_ID = "pssr-hud";
  const EXCLUDED_SELECTOR = [
    "button",
    "input",
    "textarea",
    "select",
    "option",
    "nav",
    "header",
    "footer",
    "aside",
    "code",
    "pre",
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "[contenteditable='true']",
    "[aria-hidden='true']",
  ].join(",");

  const ROOT_EXCLUDED_SELECTOR = [
    "button",
    "input",
    "textarea",
    "select",
    "option",
    "nav",
    "header",
    "footer",
    "aside",
    "code",
    "pre",
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "[contenteditable='true']",
    "[aria-hidden='true']",
  ].join(",");
  const READABLE_BLOCK_SELECTOR = "p, li, blockquote, h1, h2, h3";
  const DISTRACTION_PATTERN =
    /(^|[-_\s])(ad|ads|advert|advertisement|newsletter|subscribe|subscription|signup|sign-up|promo|sponsor|sponsored)([-_\s]|$)/;
  const DISTRACTION_MARKERS = [
    "advert",
    "newsletter",
    "subscribe",
    "subscription",
    "signup",
    "sign-up",
    "promo",
    "sponsor",
  ];
  const DISTRACTION_COPY_PATTERN =
    /\b(advertisement|sponsored|sponsor|subscribe|subscription|sign up|signup|newsletter|inbox|join us|receive our content)\b/i;

  const DEFAULT_SETTINGS = {
    wpm: 350,
    chunkSize: 1,
    autoScroll: true,
  };

  const reader = {
    settings: { ...DEFAULT_SETTINGS },
    status: "ready",
    root: null,
    wordSpans: [],
    originals: [],
    index: 0,
    timer: null,
    styleEl: null,
    hudTimer: null,
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch(() => sendResponse({ status: "unsupported" }));
    return true;
  });

  // One delegated listener for the whole document. It only ever acts while
  // the reader is active (wordSpans are populated), so an untouched page
  // behaves exactly as before. See onWordClick for the guard order.
  document.addEventListener("click", onWordClick);

  win.__pageSpotlightSpeedReader = true;

  async function handleMessage(message) {
    if (message?.type === "SPEED_READER_PING") {
      return { status: reader.status };
    }

    if (message?.type === "SPEED_READER_STATUS") {
      return { status: reader.status, estimate: getEstimate() };
    }

    if (message?.type === "SPEED_READER_ESTIMATE") {
      return { status: reader.status, estimate: getEstimate() };
    }

    if (message?.type === "SPEED_READER_TOGGLE") {
      updateSettings(message.settings);
      toggle();
      return { status: reader.status, estimate: getEstimate() };
    }

    if (message?.type === "SPEED_READER_STOP") {
      stop();
      return { status: reader.status };
    }

    if (message?.type === "SPEED_READER_RESET") {
      reset();
      return { status: reader.status };
    }

    if (message?.type === "SPEED_READER_SETTINGS") {
      updateSettings(message.settings);
      if (reader.status === "running") {
        highlightCurrentChunk();
        scheduleNext();
      }
      showHud(`${reader.settings.wpm} WPM`);
      return { status: reader.status, estimate: getEstimate() };
    }

    return { status: reader.status };
  }

  function toggle() {
    if (reader.status === "running") {
      pause();
      return;
    }

    if (reader.status === "paused") {
      run();
      return;
    }

    start();
  }

  function start() {
    reset();
    injectStyles();

    reader.root = findReadableRoot();
    if (!reader.root) {
      reader.status = "no_content";
      return;
    }

    reader.wordSpans = wrapWords(reader.root);
    if (reader.wordSpans.length === 0) {
      reset();
      reader.status = "no_content";
      return;
    }

    reader.index = 0;
    reader.status = "running";
    highlightCurrentChunk();
    showHud(`${reader.settings.wpm} WPM`);
    scheduleNext();
  }

  function run() {
    reader.status = "running";
    highlightCurrentChunk();
    showHud(`${reader.settings.wpm} WPM`);
    scheduleNext();
  }

  function pause() {
    clearTimer();
    reader.status = "paused";
  }

  function stop() {
    reset();
  }

  function reset() {
    clearTimer();
    hideHud();
    for (const item of reader.originals) {
      if (item.wrapper.isConnected) {
        item.wrapper.replaceWith(item.node);
      }
    }

    reader.root = null;
    reader.wordSpans = [];
    reader.originals = [];
    reader.index = 0;
    reader.status = "ready";
  }

  function scheduleNext() {
    clearTimer();
    if (reader.status !== "running") {
      return;
    }

    const interval = Math.max(
      80,
      (60000 / reader.settings.wpm) * reader.settings.chunkSize,
    );
    reader.timer = window.setTimeout(() => {
      const nextIndex = reader.index + reader.settings.chunkSize;

      if (nextIndex >= reader.wordSpans.length) {
        clearHighlights();
        reader.index = reader.wordSpans.length;
        reader.status = "done";
        showHud("Finished");
        return;
      }

      reader.index = nextIndex;
      highlightCurrentChunk();
      scheduleNext();
    }, interval);
  }

  function highlightCurrentChunk() {
    const chunkEnd = Math.min(
      reader.index + reader.settings.chunkSize,
      reader.wordSpans.length,
    );

    reader.wordSpans.forEach((span, idx) => {
      span.classList.toggle(`${CLASS_PREFIX}-read`, idx < reader.index);
      span.classList.toggle(
        `${CLASS_PREFIX}-active`,
        idx >= reader.index && idx < chunkEnd,
      );
    });

    const active = reader.wordSpans[reader.index];
    if (active && reader.settings.autoScroll) {
      active.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }

  function clearHighlights() {
    for (const span of reader.wordSpans) {
      span.classList.remove(`${CLASS_PREFIX}-read`, `${CLASS_PREFIX}-active`);
    }
  }

  // Shared "move the reading position" helper used by both gestures: click a
  // word while reading (onWordClick) jumps here directly. It clamps the index,
  // re-arms a finished reader as paused, and re-highlights. When running it
  // reschedules so the clicked word gets a full interval instead of the
  // remainder of the one in flight.
  function jumpTo(index) {
    if (reader.wordSpans.length === 0) {
      return;
    }

    reader.index = clamp(index, 0, reader.wordSpans.length - 1);
    if (reader.status === "done") {
      reader.status = "paused";
    }

    highlightCurrentChunk();

    if (reader.status === "running") {
      scheduleNext();
      showHud(`${reader.settings.wpm} WPM`);
    } else {
      showHud("Reading from here");
    }
  }

  // Delegated click handler. The guards run in order so the reader never
  // interferes with normal page interaction (text selection, links) and only
  // jumps when the user clearly clicked a wrapped word.
  function onWordClick(event) {
    // 1. Reader not active — leave the page alone.
    if (reader.wordSpans.length === 0) {
      return;
    }

    // 2. A visible selection means the user is drag-selecting text, not
    //    jumping. (A plain click leaves a collapsed caret, which passes.)
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      return;
    }

    // 3. The click landed outside any wrapped word.
    const span = event.target?.closest?.(`.${CLASS_PREFIX}-word`);
    if (!span) {
      return;
    }

    // 4. Let links navigate instead of jumping.
    if (span.closest("a")) {
      return;
    }

    // 5. Map the span to its position and jump.
    const index = reader.wordSpans.indexOf(span);
    if (index >= 0) {
      jumpTo(index);
    }
  }

  function wrapWords(root) {
    const textNodes = collectTextNodesFromBlocks(getReadableBlocks(root));
    const spans = [];

    for (const textNode of textNodes) {
      const text = textNode.nodeValue;
      if (!text || !text.trim()) {
        continue;
      }

      const parent = textNode.parentNode;
      if (!parent) {
        continue;
      }

      const fragment = document.createDocumentFragment();
      const parts = text.match(/\S+|\s+/g) ?? [];

      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
          continue;
        }

        const span = document.createElement("span");
        span.className = `${CLASS_PREFIX}-word`;
        span.textContent = part;
        spans.push(span);
        fragment.append(span);
      }

      const wrapper = document.createElement("span");
      wrapper.className = `${CLASS_PREFIX}-original`;
      wrapper.append(fragment);

      reader.originals.push({
        wrapper,
        node: textNode.cloneNode(true),
      });

      parent.replaceChild(wrapper, textNode);
    }

    return spans;
  }

  function getEstimate() {
    if (reader.wordSpans.length > 0) {
      return { wordCount: reader.wordSpans.length };
    }

    const root = reader.root?.isConnected ? reader.root : findReadableRoot();
    if (!root) {
      return { wordCount: 0 };
    }

    const wordCount = collectTextNodesFromBlocks(getReadableBlocks(root))
      .map((node) => countWords(node.nodeValue))
      .reduce((total, count) => total + count, 0);

    return { wordCount };
  }

  function countWords(text = "") {
    const matches = text.trim().match(/\S+/g);
    return matches ? matches.length : 0;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue?.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          parent.closest(EXCLUDED_SELECTOR) ||
          isDistracting(parent) ||
          !isVisible(parent)
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    return nodes;
  }

  function collectTextNodesFromBlocks(blocks) {
    return blocks.flatMap((block) => collectTextNodes(block));
  }

  function findReadableRoot() {
    const readableBlocks = getReadableBlocks(document.body);
    const readableWords = countBlockWords(readableBlocks);
    const direct = ["article", "main", "[role='main']"]
      .map((selector) => document.querySelector(selector))
      .find(
        (element) =>
          element && isVisible(element) && scoreElement(element) >= 120,
      );

    if (direct) {
      const directWords = countBlockWords(getReadableBlocks(direct));
      const expandedRoot = findCommonReadableRoot(readableBlocks);

      if (
        expandedRoot &&
        readableWords >= directWords + 120 &&
        directWords < readableWords * 0.85
      ) {
        return expandedRoot;
      }

      return direct;
    }

    const candidates = [
      ...document.querySelectorAll("article, main, section, div"),
    ]
      .filter(
        (element) =>
          isVisible(element) &&
          !element.closest(ROOT_EXCLUDED_SELECTOR) &&
          !isDistracting(element),
      )
      .map((element) => ({ element, score: scoreElement(element) }))
      .filter((candidate) => candidate.score >= 240)
      .sort((a, b) => b.score - a.score);

    if (candidates[0]) {
      const candidateBlocks = getReadableBlocks(candidates[0].element);
      const candidateWords = countBlockWords(candidateBlocks);
      const expandedRoot = findCommonReadableRoot(readableBlocks);

      if (
        expandedRoot &&
        readableWords >= candidateWords + 120 &&
        candidateWords < readableWords * 0.85
      ) {
        return expandedRoot;
      }

      return candidates[0].element;
    }

    return readableWords >= 120
      ? (findCommonReadableRoot(readableBlocks) ?? document.body)
      : null;
  }

  function scoreElement(element) {
    if (!element || !isVisible(element)) {
      return 0;
    }

    const paragraphs = [...element.querySelectorAll("p")].filter(
      (paragraph) =>
        isVisible(paragraph) && getVisibleText(paragraph).length > 30,
    );
    const textLength = getVisibleText(element).length;
    const headingBonus = element.querySelector("h1, h2") ? 250 : 0;

    return textLength + paragraphs.length * 250 + headingBonus;
  }

  function getVisibleText(element) {
    return (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getReadableBlocks(root) {
    const blocks = collectReadableBlocks(root);

    // The standard p/li/h selectors miss pages whose body text is built from
    // bare <div>s (JS-rendered apps like x.com). When those selectors cover
    // less than 60% of the visible words under `root`, fold in the innermost
    // text-bearing <div>s so the page reads fully instead of just the stray
    // matching elements. The fallback is self-limiting: on a normal article
    // every text div contains a <p>, so it contributes nothing extra.
    const blockWords = countBlockWords(blocks);
    const totalWords = countWords(getVisibleText(root));

    if (totalWords >= 40 && blockWords < totalWords * 0.6) {
      return mergeBlocksInOrder(blocks, collectLeafDivBlocks(root, blocks));
    }

    return blocks;
  }

  function collectReadableBlocks(root) {
    return [...root.querySelectorAll(READABLE_BLOCK_SELECTOR)].filter(
      (element) => isReadableBlock(element),
    );
  }

  function collectLeafDivBlocks(root, existingBlocks) {
    // Only divs that hold text directly (no nested readable block) are eligible,
    // so a div wrapping <p>s is never picked and its words are not wrapped twice.
    const candidates = [...root.querySelectorAll("div")].filter(
      (element) =>
        !element.querySelector(READABLE_BLOCK_SELECTOR) &&
        isReadableBlock(element),
    );

    // Keep only the innermost candidates and drop any already covered by a
    // standard block, leaving paragraph-like leaves in the deeply nested markup.
    return candidates.filter(
      (element) =>
        !candidates.some(
          (other) => other !== element && element.contains(other),
        ) && !existingBlocks.some((block) => block.contains(element)),
    );
  }

  function isReadableBlock(element) {
    const text = getVisibleText(element);
    return (
      text.length > 30 &&
      countWords(text) >= 6 &&
      isVisible(element) &&
      !element.closest(ROOT_EXCLUDED_SELECTOR) &&
      !isDistractingBlock(element)
    );
  }

  function mergeBlocksInOrder(primary, extra) {
    if (extra.length === 0) {
      return primary;
    }

    return [...primary, ...extra].sort((a, b) => {
      const relation = a.compareDocumentPosition(b);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });
  }

  function countBlockWords(blocks) {
    return blocks.reduce(
      (total, block) => total + countWords(getVisibleText(block)),
      0,
    );
  }

  function findCommonReadableRoot(blocks) {
    if (blocks.length === 0) {
      return null;
    }

    let root = blocks[0];
    for (const block of blocks.slice(1)) {
      root = commonAncestor(root, block);
    }

    return root?.closest?.("article, main, [role='main']") ?? root;
  }

  function commonAncestor(first, second) {
    const ancestors = new Set();
    let current = first;

    while (current) {
      ancestors.add(current);
      current = current.parentElement;
    }

    current = second;
    while (current) {
      if (ancestors.has(current)) {
        return current;
      }
      current = current.parentElement;
    }

    return document.body;
  }

  function isDistracting(element) {
    let current = element;

    while (current && current !== document.body) {
      const marker = [
        current.id,
        current.className,
        current.getAttribute?.("role"),
        current.getAttribute?.("aria-label"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        DISTRACTION_PATTERN.test(marker) ||
        DISTRACTION_MARKERS.some((term) => marker.includes(term))
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isDistractingBlock(element) {
    if (isDistracting(element)) {
      return true;
    }

    const container = getLikelyBlockContainer(element);
    const text = getVisibleText(container);
    const wordCount = countWords(text);
    const hasSignupControl = Boolean(
      container.querySelector(
        "input[type='email'], input[name*='email' i], button, [role='button']",
      ),
    );

    return (
      hasSignupControl &&
      wordCount <= 140 &&
      DISTRACTION_COPY_PATTERN.test(text)
    );
  }

  function getLikelyBlockContainer(element) {
    return (
      element.closest("form, aside, section, div") ??
      element.parentElement ??
      element
    );
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function updateSettings(settings = {}) {
    reader.settings = {
      wpm: clamp(Number(settings.wpm) || DEFAULT_SETTINGS.wpm, 100, 1000),
      chunkSize: clamp(
        Number(settings.chunkSize) || DEFAULT_SETTINGS.chunkSize,
        1,
        5,
      ),
      autoScroll: Boolean(settings.autoScroll),
    };
  }

  function clearTimer() {
    if (reader.timer) {
      window.clearTimeout(reader.timer);
      reader.timer = null;
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    reader.styleEl = document.createElement("style");
    reader.styleEl.id = STYLE_ID;
    reader.styleEl.textContent = `
      .${CLASS_PREFIX}-word {
        border-radius: 0.2em;
        cursor: pointer;
        transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
      }

      .${CLASS_PREFIX}-word:hover {
        background: rgba(17, 24, 39, 0.08);
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-active {
        background: #ffdf5f !important;
        color: #111827 !important;
        box-shadow: 0 0 0 0.12em rgba(17, 24, 39, 0.12);
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-read {
        opacity: 0.45;
      }

      #${HUD_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        border: 1px solid rgba(15, 23, 42, 0.16);
        border-radius: 8px;
        background: rgba(17, 24, 39, 0.92);
        color: #ffffff;
        padding: 8px 10px;
        font: 650 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
        pointer-events: none;
      }
    `;
    document.documentElement.append(reader.styleEl);
  }

  function showHud(text) {
    injectStyles();
    let hud = document.getElementById(HUD_ID);
    if (!hud) {
      hud = document.createElement("div");
      hud.id = HUD_ID;
      document.documentElement.append(hud);
    }

    hud.textContent = text;
    window.clearTimeout(reader.hudTimer);
    reader.hudTimer = window.setTimeout(() => {
      hideHud();
    }, 1400);
  }

  function hideHud() {
    window.clearTimeout(reader.hudTimer);
    reader.hudTimer = null;
    document.getElementById(HUD_ID)?.remove();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
