const DEFAULT_SETTINGS = {
  wpm: 350,
  chunkSize: 1,
  autoScroll: true,
};

const state = {
  tabId: null,
  status: "ready",
  supported: false,
};

const els = {
  status: /** @type {HTMLElement} */ (document.querySelector("#status")),
  statusDot: /** @type {HTMLElement} */ (document.querySelector("#statusDot")),
  toggleButton: /** @type {HTMLButtonElement} */ (
    document.querySelector("#toggleButton")
  ),
  stopButton: /** @type {HTMLButtonElement} */ (
    document.querySelector("#stopButton")
  ),
  resetButton: /** @type {HTMLButtonElement} */ (
    document.querySelector("#resetButton")
  ),
  decreaseSpeedButton: /** @type {HTMLButtonElement} */ (
    document.querySelector("#decreaseSpeedButton")
  ),
  increaseSpeedButton: /** @type {HTMLButtonElement} */ (
    document.querySelector("#increaseSpeedButton")
  ),
  wpmInput: /** @type {HTMLInputElement} */ (
    document.querySelector("#wpmInput")
  ),
  chunkInput: /** @type {HTMLInputElement} */ (
    document.querySelector("#chunkInput")
  ),
  autoScrollInput: /** @type {HTMLInputElement} */ (
    document.querySelector("#autoScrollInput")
  ),
  wordCount: /** @type {HTMLElement} */ (document.querySelector("#wordCount")),
  timeEstimate: /** @type {HTMLElement} */ (
    document.querySelector("#timeEstimate")
  ),
};

bindControls();
init();

async function init() {
  setControlsEnabled(false);

  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    applySettingsToInputs(settings);

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    state.tabId = tab?.id ?? null;
    state.supported = Boolean(tab?.id && isSupportedUrl(tab.url));

    if (!state.supported) {
      renderStatus("unsupported");
      return;
    }

    await ensureContentScript();
    const response = await sendMessage({ type: "SPEED_READER_STATUS" });
    renderStatus(response?.status ?? "ready");
    await refreshEstimate();
    setControlsEnabled(true);
  } catch {
    renderStatus("injection_error");
  }
}

function bindControls() {
  els.toggleButton.addEventListener("click", toggleReader);
  els.stopButton.addEventListener("click", stopReader);
  els.resetButton.addEventListener("click", resetReader);
  els.decreaseSpeedButton.addEventListener("click", () => adjustSpeed(-25));
  els.increaseSpeedButton.addEventListener("click", () => adjustSpeed(25));
  els.wpmInput.addEventListener("change", saveSettings);
  els.wpmInput.addEventListener("input", updateEstimateFromCurrentWpm);
  els.chunkInput.addEventListener("change", saveSettings);
  els.autoScrollInput.addEventListener("change", saveSettings);
}

async function toggleReader() {
  setBusy(true);
  const settings = readSettingsFromInputs();
  await chrome.storage.sync.set(settings);
  const response = await sendMessage({ type: "SPEED_READER_TOGGLE", settings });
  renderStatus(response?.status ?? "injection_error");
  setBusy(false);
}

async function stopReader() {
  setBusy(true);
  const response = await sendMessage({ type: "SPEED_READER_STOP" });
  renderStatus(response?.status ?? "injection_error");
  setBusy(false);
}

async function resetReader() {
  setBusy(true);
  const response = await sendMessage({ type: "SPEED_READER_RESET" });
  renderStatus(response?.status ?? "injection_error");
  setBusy(false);
}

async function saveSettings() {
  const settings = readSettingsFromInputs();
  await chrome.storage.sync.set(settings);
  const response = await sendMessage({
    type: "SPEED_READER_SETTINGS",
    settings,
  });
  renderStatus(response?.status ?? state.status);
  updateEstimate(response?.estimate);
}

async function adjustSpeed(delta) {
  const settings = readSettingsFromInputs();
  els.wpmInput.value = String(clamp(settings.wpm + delta, 100, 1000));
  updateEstimateFromCurrentWpm();
  await saveSettings();
}

async function refreshEstimate() {
  const response = await sendMessage({ type: "SPEED_READER_ESTIMATE" });
  updateEstimate(response?.estimate);
}

async function ensureContentScript() {
  try {
    await chrome.tabs.sendMessage(state.tabId, { type: "SPEED_READER_PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(state.tabId, { type: "SPEED_READER_PING" });
  }
}

async function sendMessage(message) {
  try {
    return await chrome.tabs.sendMessage(state.tabId, message);
  } catch {
    renderStatus("unsupported");
    return null;
  }
}

function updateEstimate(estimate) {
  if (!estimate?.wordCount) {
    els.wordCount.textContent = "-";
    els.timeEstimate.textContent = "-";
    return;
  }

  const wpm = readSettingsFromInputs().wpm;
  els.wordCount.textContent = new Intl.NumberFormat().format(
    estimate.wordCount,
  );
  els.timeEstimate.textContent = formatDuration(estimate.wordCount, wpm);
}

function updateEstimateFromCurrentWpm() {
  const wordText = els.wordCount.textContent.replaceAll(",", "");
  const wordCount = Number(wordText);

  if (!wordCount) {
    return;
  }

  els.timeEstimate.textContent = formatDuration(
    wordCount,
    readSettingsFromInputs().wpm,
  );
}

function applySettingsToInputs(settings) {
  els.wpmInput.value = String(settings.wpm);
  els.chunkInput.value = String(settings.chunkSize);
  els.autoScrollInput.checked = Boolean(settings.autoScroll);
}

function readSettingsFromInputs() {
  return {
    wpm: clamp(Number(els.wpmInput.value) || DEFAULT_SETTINGS.wpm, 100, 1000),
    chunkSize: clamp(
      Number(els.chunkInput.value) || DEFAULT_SETTINGS.chunkSize,
      1,
      5,
    ),
    autoScroll: els.autoScrollInput.checked,
  };
}

function renderStatus(status) {
  state.status = status;
  els.statusDot.className = "status-dot";

  const labels = {
    ready: "Ready",
    running: "Running",
    paused: "Paused",
    done: "Finished",
    no_content: "No readable content found",
    unsupported: "Page unsupported",
    injection_error: "Could not start on this page",
  };

  els.status.textContent = labels[status] ?? "Ready";
  els.toggleButton.textContent = status === "running" ? "Pause" : "Start";

  if (status === "running") {
    els.statusDot.classList.add("running");
  } else if (status === "paused") {
    els.statusDot.classList.add("paused");
  } else if (
    status === "no_content" ||
    status === "unsupported" ||
    status === "injection_error"
  ) {
    els.statusDot.classList.add("error");
  }
}

function setControlsEnabled(enabled) {
  for (const element of [
    els.toggleButton,
    els.stopButton,
    els.resetButton,
    els.decreaseSpeedButton,
    els.increaseSpeedButton,
    els.wpmInput,
    els.chunkInput,
    els.autoScrollInput,
  ]) {
    element.disabled = !enabled;
  }
}

function setBusy(isBusy) {
  els.toggleButton.disabled = isBusy;
  els.stopButton.disabled = isBusy;
  els.resetButton.disabled = isBusy;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  const changedSettings = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (changes[key]) {
      changedSettings[key] = changes[key].newValue;
    }
  }

  if (Object.keys(changedSettings).length === 0) {
    return;
  }

  applySettingsToInputs({
    ...readSettingsFromInputs(),
    ...changedSettings,
  });
  updateEstimateFromCurrentWpm();
});

function isSupportedUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(wordCount, wpm) {
  const totalSeconds = Math.max(1, Math.ceil((wordCount / wpm) * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}
