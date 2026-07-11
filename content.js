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
    mode: "manual",
  };

  // First chunk of each new line lingers this much longer, giving the eye
  // time to complete the return sweep to the start of the next line.
  const LINE_BREAK_PAUSE_FACTOR = 1.35;

  // How many words on each side of the active chunk get a graded fade: the
  // words just before it (already read, open to regression) fade out and the
  // words just after it (parafoveal preview) fade in, so the spotlight reads
  // as one gradient window the eye can move across. The classes are listed
  // once so highlight and cleanup can't drift apart.
  const CONTEXT_WORDS = 3;
  const CONTEXT_CLASSES = [
    `${CLASS_PREFIX}-before-1`,
    `${CLASS_PREFIX}-before-2`,
    `${CLASS_PREFIX}-before-3`,
    `${CLASS_PREFIX}-after-1`,
    `${CLASS_PREFIX}-after-2`,
    `${CLASS_PREFIX}-after-3`,
  ];

  const reader = {
    settings: { ...DEFAULT_SETTINGS },
    status: "ready",
    root: null,
    wordSpans: [],
    gapSpans: [],
    originals: [],
    index: 0,
    timer: null,
    styleEl: null,
    hudTimer: null,
    spaceHeld: false,
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
  // Capture phase so a page script can't swallow Space before us. While the
  // reader is inactive these handlers no-op, so an untouched page behaves
  // exactly as before. See onHoldKeyDown for the guard order.
  document.addEventListener("keydown", onHoldKeyDown, true);
  document.addEventListener("keyup", onHoldKeyUp, true);
  window.addEventListener("blur", onWindowBlur);

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

      // Flipping to manual mid-read (e.g. via the popup toggle) parks the
      // reader until Space is held. Switching to auto while paused just
      // stays paused. Space already held keeps running and picks up the new
      // pace via the reschedule below.
      if (
        reader.settings.mode === "manual" &&
        reader.status === "running" &&
        !reader.spaceHeld
      ) {
        pause();
        showHud("Hold Space to read");
        return { status: reader.status, estimate: getEstimate() };
      }

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
      // In manual mode the popup Start button must not kick off a runaway
      // reader — Space drives it. Stay paused and remind the user.
      if (reader.settings.mode === "manual") {
        showHud("Hold Space to read");
        return;
      }
      run();
      return;
    }

    start();
  }

  function start() {
    // Grab any visible selection BEFORE reset()/wrapWords() touch the DOM:
    // wrapping replaces each text node with spans, which destroys a selection
    // anchored inside that node. Captured here, mapped to a word index while
    // wrapping below.
    const anchor = captureSelectionAnchor();

    reset();
    injectStyles();

    reader.root = findReadableRoot();
    if (!reader.root) {
      reader.status = "no_content";
      return;
    }

    const { spans, anchorIndex, gapSpans } = wrapWords(reader.root, anchor);
    reader.wordSpans = spans;
    reader.gapSpans = gapSpans;
    if (reader.wordSpans.length === 0) {
      reset();
      reader.status = "no_content";
      return;
    }

    reader.index = anchorIndex ?? 0;
    // Clear the blue selection once we've honored it, so it doesn't fight the
    // highlight. highlightCurrentChunk() dims everything before reader.index,
    // which already shows where reading started.
    if (anchorIndex != null) {
      window.getSelection()?.removeAllRanges();
    }

    highlightCurrentChunk();

    // Manual mode arms paused: the highlight sits on the first chunk and
    // Space drives it from there. Auto mode starts running immediately, as
    // before.
    if (reader.settings.mode === "manual") {
      reader.status = "paused";
      showHud("Hold Space to read");
      return;
    }

    reader.status = "running";
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
    reader.gapSpans = [];
    reader.originals = [];
    reader.index = 0;
    reader.spaceHeld = false;
    reader.status = "ready";
  }

  function scheduleNext() {
    clearTimer();
    if (reader.status !== "running") {
      return;
    }

    let interval = (60000 / reader.settings.wpm) * reader.settings.chunkSize;
    // The first chunk of a new line gets a longer dwell so the eye can
    // complete its return sweep before the highlight moves on.
    if (startsNewLine(reader.index)) {
      interval *= LINE_BREAK_PAUSE_FACTOR;
    }
    interval = Math.max(80, interval);
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

  // Whether the word at `index` begins a new visual line relative to the
  // one before it. Both rects are read in the same frame (no layout mutation
  // between them), so a smooth scroll in flight can't skew the comparison.
  function startsNewLine(index) {
    if (index <= 0 || index >= reader.wordSpans.length) {
      return false;
    }
    const current = reader.wordSpans[index];
    const previous = reader.wordSpans[index - 1];
    if (!current || !previous) {
      return false;
    }
    const currentTop = current.getBoundingClientRect().top;
    const previousTop = previous.getBoundingClientRect().top;
    return Math.abs(currentTop - previousTop) > 2;
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

      // Graded fade around the chunk: the 3 words before it (regression) and
      // the 3 after it (parafoveal preview). Purely index-based, so it works
      // across line and paragraph breaks and clamps naturally at the start
      // and end of the article. Each class is forced to its exact boolean
      // every tick, so no stale class survives a move.
      const beforeDistance = reader.index - idx;
      const afterDistance = idx - (chunkEnd - 1);
      for (let distance = 1; distance <= CONTEXT_WORDS; distance++) {
        span.classList.toggle(
          `${CLASS_PREFIX}-before-${distance}`,
          beforeDistance === distance,
        );
        span.classList.toggle(
          `${CLASS_PREFIX}-after-${distance}`,
          afterDistance === distance,
        );
      }
    });

    // Fill the gaps between words so the chunk + fade render as one
    // continuous band. Each gap takes the highlight of its weaker neighbor
    // (the lower level), so intensity steps down exactly at word edges and
    // the window stays a monotonic gradient. The 7 highlight classes are
    // forced to their exact boolean every tick, same no-stale-state pattern
    // as the word sweep.
    reader.gapSpans.forEach((gap, idx) => {
      if (!gap) {
        return;
      }
      const weakerIdx =
        highlightLevel(idx - 1) <= highlightLevel(idx) ? idx - 1 : idx;
      const weakerClass = wordHighlightClass(weakerIdx);
      for (const cls of [`${CLASS_PREFIX}-active`, ...CONTEXT_CLASSES]) {
        gap.classList.toggle(cls, weakerClass === cls);
      }
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

  // Highlight level of a word by index, used to pick a gap's color. Pure
  // index math mirroring the before/after computation in the word sweep:
  // active = 4, fade distance 1/2/3 = 3/2/1, otherwise 0 (read or untouched).
  // Out-of-range indices are level 0 so a gap at the article edge takes the
  // weaker (empty) side and stays unpainted.
  function highlightLevel(idx) {
    if (idx < 0 || idx >= reader.wordSpans.length) {
      return 0;
    }
    const chunkEnd = Math.min(
      reader.index + reader.settings.chunkSize,
      reader.wordSpans.length,
    );
    if (idx >= reader.index && idx < chunkEnd) {
      return 4;
    }
    const beforeDistance = reader.index - idx;
    if (beforeDistance >= 1 && beforeDistance <= CONTEXT_WORDS) {
      return CONTEXT_WORDS - beforeDistance + 1;
    }
    const afterDistance = idx - (chunkEnd - 1);
    if (afterDistance >= 1 && afterDistance <= CONTEXT_WORDS) {
      return CONTEXT_WORDS - afterDistance + 1;
    }
    return 0;
  }

  // The single highlight class a word carries (active / before-N / after-N),
  // or null when it has none. A gap takes this class from its weaker neighbor
  // so it paints at the lower of the two surrounding intensities.
  function wordHighlightClass(idx) {
    if (idx < 0 || idx >= reader.wordSpans.length) {
      return null;
    }
    const chunkEnd = Math.min(
      reader.index + reader.settings.chunkSize,
      reader.wordSpans.length,
    );
    if (idx >= reader.index && idx < chunkEnd) {
      return `${CLASS_PREFIX}-active`;
    }
    const beforeDistance = reader.index - idx;
    if (beforeDistance >= 1 && beforeDistance <= CONTEXT_WORDS) {
      return `${CLASS_PREFIX}-before-${beforeDistance}`;
    }
    const afterDistance = idx - (chunkEnd - 1);
    if (afterDistance >= 1 && afterDistance <= CONTEXT_WORDS) {
      return `${CLASS_PREFIX}-after-${afterDistance}`;
    }
    return null;
  }

  function clearHighlights() {
    for (const span of reader.wordSpans) {
      span.classList.remove(
        `${CLASS_PREFIX}-read`,
        `${CLASS_PREFIX}-active`,
        ...CONTEXT_CLASSES,
      );
    }
    for (const gap of reader.gapSpans) {
      if (gap) {
        gap.classList.remove(`${CLASS_PREFIX}-active`, ...CONTEXT_CLASSES);
      }
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

  // Manual mode: the highlight only advances while Space is held. These
  // three listeners drive that. They no-op unless the reader is active and
  // in manual mode, so Space behaves normally on an untouched page, while
  // typing into a field, or in automatic mode.
  function onHoldKeyDown(event) {
    // 1. Only Space drives the hold.
    if (event.code !== "Space") {
      return;
    }
    // 2. Reader inactive — leave Space to scroll the page as usual.
    if (reader.wordSpans.length === 0) {
      return;
    }
    // 3. Only manual mode holds to read.
    if (reader.settings.mode !== "manual") {
      return;
    }
    // 4. Typing into a field must still produce spaces.
    if (isEditable(event.target)) {
      return;
    }
    // 5. Held Space must not scroll the page — including key repeats.
    event.preventDefault();
    // 6. One run() per press. Repeats and an already-held key do nothing;
    //    a finished reader stays finished.
    if (event.repeat || reader.spaceHeld) {
      return;
    }
    reader.spaceHeld = true;
    if (reader.status === "paused") {
      run();
    }
  }

  function onHoldKeyUp(event) {
    if (event.code !== "Space") {
      return;
    }
    releaseHold();
  }

  // A keyup is lost when the tab/window loses focus while Space is held;
  // blur counts as a release so the reader can't run away unattended.
  function onWindowBlur() {
    releaseHold();
  }

  // Shared release path for keyup and blur: drop the held flag and freeze
  // the reader on the current chunk.
  function releaseHold() {
    reader.spaceHeld = false;
    if (
      reader.settings.mode === "manual" &&
      reader.wordSpans.length > 0 &&
      reader.status === "running"
    ) {
      pause();
      showHud("Hold Space to read");
    }
  }

  function isEditable(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    );
  }

  // Returns { node, offset } for the start of a visible (non-collapsed)
  // selection, or null. Uses the range start, not anchorNode: the anchor is
  // where the drag began, which is the *end* of a backwards (right-to-left)
  // selection, so it would point at the wrong word.
  function captureSelectionAnchor() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    return { node: range.startContainer, offset: range.startOffset };
  }

  function wrapWords(root, anchor = null) {
    const textNodes = collectTextNodesFromBlocks(getReadableBlocks(root));
    const spans = [];
    const gapSpans = [];
    let anchorIndex = null;
    // The gap (whitespace) span immediately before the next word, carried
    // across text nodes: the space before a word often lives in the previous
    // inline element's text node. null when the next word has no preceding
    // gap (start of the article, or after a block boundary).
    let pendingGap = null;

    for (const textNode of textNodes) {
      const text = textNode.nodeValue;
      if (!text || !text.trim()) {
        continue;
      }

      const parent = textNode.parentNode;
      if (!parent) {
        continue;
      }

      const isAnchorTextNode = Boolean(anchor && textNode === anchor.node);
      const fragment = document.createDocumentFragment();
      const parts = text.match(/\S+|\s+/g) ?? [];
      let charOffset = 0;

      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          // Wrap whitespace in its own span so the highlight can paint the
          // gap between words and the chunk + fade read as one band. A bare
          // inline span keeps layout and whitespace collapsing intact.
          const gap = document.createElement("span");
          gap.className = `${CLASS_PREFIX}-gap`;
          gap.textContent = part;
          fragment.append(gap);
          pendingGap = gap;
          charOffset += part.length;
          continue;
        }

        const span = document.createElement("span");
        span.className = `${CLASS_PREFIX}-word`;
        span.textContent = part;
        spans.push(span);
        // gapSpans stays parallel to wordSpans: gapSpans[i] is the gap (if
        // any) immediately before word i, carried in from the whitespace run
        // most recently seen — even if it was in a previous text node.
        gapSpans.push(pendingGap);
        pendingGap = null;
        fragment.append(span);

        // The first word span whose character range extends past the caret
        // is the start word. Compare before advancing charOffset so the range
        // is [charOffset, charOffset + part.length).
        if (isAnchorTextNode && anchorIndex === null) {
          if (charOffset + part.length > anchor.offset) {
            anchorIndex = spans.length - 1;
          }
        }

        charOffset += part.length;
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

    // Fallback when the anchor node is an element rather than a text node
    // (e.g. a triple-click selects a whole paragraph): pick the first span
    // that the anchor contains, or the first one that follows it.
    if (
      anchor &&
      anchorIndex === null &&
      anchor.node.nodeType === Node.ELEMENT_NODE
    ) {
      for (let i = 0; i < spans.length; i++) {
        if (
          anchor.node.contains(spans[i]) ||
          anchor.node.compareDocumentPosition(spans[i]) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ) {
          anchorIndex = i;
          break;
        }
      }
    }

    return { spans, anchorIndex, gapSpans };
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
      // Unknown values fall back to manual, same spirit as the clamps above.
      mode: settings.mode === "auto" ? "auto" : "manual",
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
        cursor: pointer;
        transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
      }

      .${CLASS_PREFIX}-word:hover {
        background: rgba(17, 24, 39, 0.08);
        border-radius: 0.2em;
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-active,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-active {
        background: #ffdf5f !important;
        color: #111827 !important;
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-read {
        opacity: 0.45;
      }

      /* Regression (left of the chunk) and preview (right of the chunk)
         fade. Placed after the .pssr-read rule on purpose: the rules share
         specificity with it, so source order decides, and these must win —
         before-words also carry pssr-read and need to regain legibility
         (the opacity here overrides the 0.45 above). Same #ffdf5f as the
         active highlight, increasingly transparent, so the window reads as
         one gradient spotlight. Each rule also paints the gap between two
         words at that level, so the band reads as one continuous block. */
      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-before-1,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-before-1 {
        background: rgba(255, 223, 95, 0.4);
        opacity: 1;
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-before-2,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-before-2 {
        background: rgba(255, 223, 95, 0.26);
        opacity: 0.85;
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-before-3,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-before-3 {
        background: rgba(255, 223, 95, 0.14);
        opacity: 0.7;
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-after-1,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-after-1 {
        background: rgba(255, 223, 95, 0.4);
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-after-2,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-after-2 {
        background: rgba(255, 223, 95, 0.26);
      }

      .${CLASS_PREFIX}-word.${CLASS_PREFIX}-after-3,
      .${CLASS_PREFIX}-gap.${CLASS_PREFIX}-after-3 {
        background: rgba(255, 223, 95, 0.14);
      }

      .${CLASS_PREFIX}-gap {
        transition: background-color 120ms ease;
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
