// Service worker: coordinates tab capture and the offscreen audio engine.

const OFFSCREEN_PATH = "offscreen.html";

// Ensure the single offscreen document (holds all AudioContexts) exists.
async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["USER_MEDIA"],
      justification: "Hold AudioContext + GainNode to boost the captured tab audio.",
    });
  } catch (e) {
    // Race: another call created it first. Ignore "already exists".
    if (!String(e.message || e).includes("Only a single offscreen")) throw e;
  }
}

// Apply a volume to a tab. Captures the tab on first use, then just adjusts gain.
async function applyVolume(tabId, volume, mode, auto) {
  await ensureOffscreen();

  // Has this tab already been hooked? Ask the offscreen engine.
  const known = await sendToOffscreen({ type: "has-stream", tabId });

  if (!known?.active) {
    // Need a fresh capture stream id (must originate here, in the worker/extension).
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await sendToOffscreen({ type: "start", tabId, streamId, volume, mode, auto });
  } else {
    await sendToOffscreen({ type: "set-volume", tabId, volume, mode, auto });
  }
}

function sendToOffscreen(msg) {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

// Toolbar icon badge = current boost %. Cleared at 100% (normal).
function setBadge(tabId, volume) {
  const v = Number(volume);
  if (v === 100) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  // 4-char budget: 100+ shown as bare number, below 100 keeps the % sign.
  const text = v >= 100 ? String(v) : v + "%";
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: v > 100 ? "#ff5b3d" : "#5b8cff" });
  chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "background") return;

  (async () => {
    try {
      if (msg.type === "apply-volume") {
        await applyVolume(msg.tabId, msg.volume, msg.mode, msg.auto);
        setBadge(msg.tabId, msg.volume);
        sendResponse({ ok: true });
      } else if (msg.type === "stop") {
        await ensureOffscreen();
        await sendToOffscreen({ type: "stop", tabId: msg.tabId });
        chrome.action.setBadgeText({ tabId: msg.tabId, text: "" });
        sendResponse({ ok: true });
      } else if (msg.type === "query") {
        await ensureOffscreen();
        const res = await sendToOffscreen({ type: "has-stream", tabId: msg.tabId });
        sendResponse({ ok: true, active: !!res?.active });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();

  return true; // async response
});
