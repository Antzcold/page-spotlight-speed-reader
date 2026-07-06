(() => {
  /** @typedef {{ wpm: number, chunkSize: number, autoScroll: boolean }} Settings */

  /** @type {Settings} */
  const DEFAULT_SETTINGS = {
    wpm: 350,
    chunkSize: 1,
    autoScroll: true,
  };

  chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !isSupportedUrl(tab.url)) {
      return;
    }

    await ensureContentScript(tab.id);

    if (command === "toggle-reader") {
      const settings = await getSettings();
      await sendToTab(tab.id, { type: "SPEED_READER_TOGGLE", settings });
      return;
    }

    if (command === "stop-reader") {
      await sendToTab(tab.id, { type: "SPEED_READER_STOP" });
      return;
    }

    if (command === "increase-speed" || command === "decrease-speed") {
      const settings = await getSettings();
      const delta = command === "increase-speed" ? 25 : -25;
      const next = {
        ...settings,
        wpm: clamp(settings.wpm + delta, 100, 1000),
      };

      await chrome.storage.sync.set(next);
      await sendToTab(tab.id, {
        type: "SPEED_READER_SETTINGS",
        settings: next,
      });
    }
  });

  /** @returns {Promise<Settings>} */
  async function getSettings() {
    return /** @type {Promise<Settings>} */ (
      chrome.storage.sync.get(DEFAULT_SETTINGS)
    );
  }

  /** @param {number} tabId */
  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "SPEED_READER_PING" });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    }
  }

  /**
   * @param {number} tabId
   * @param {object} message
   */
  async function sendToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // The tab may have navigated or may not allow content scripts.
    }
  }

  /** @param {string} [url] */
  function isSupportedUrl(url = "") {
    return /^https?:\/\//i.test(url);
  }

  /**
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
