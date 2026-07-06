const DEFAULT_SETTINGS = {
  wpm: 350,
  chunkSize: 1,
  autoScroll: true
};

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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
      wpm: clamp(settings.wpm + delta, 100, 1000)
    };

    await chrome.storage.sync.set(next);
    await sendToTab(tab.id, { type: "SPEED_READER_SETTINGS", settings: next });
  }
});

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SPEED_READER_PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The tab may have navigated or may not allow content scripts.
  }
}

function isSupportedUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
