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

// Apply a volume to a tab. `fs` picks the engine:
//   fs=false -> tabCapture (boosts any audio, but blocks the page's fullscreen),
//   fs=true  -> in-page Web Audio (fullscreen keeps working; same-origin media only).
// The two are mutually exclusive per tab — switching one off tears down the other.
// Returns { media } in page mode so the popup can warn when nothing was boostable.
async function applyVolume(tabId, volume, mode, auto, fs) {
  if (fs) return applyPage(tabId, volume, mode, auto);
  return applyCapture(tabId, volume, mode, auto);
}

// --- tabCapture path (default) ---
async function applyCapture(tabId, volume, mode, auto) {
  // If the page engine was driving this tab, hand control back (unity passthrough)
  // so we don't double-process the audio.
  await sendToTab(tabId, { target: "page", type: "page-stop" });

  await ensureOffscreen();
  const known = await sendToOffscreen({ type: "has-stream", tabId });
  if (!known?.active) {
    // Need a fresh capture stream id (must originate here, in the worker/extension).
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await sendToOffscreen({ type: "start", tabId, streamId, volume, mode, auto });
  } else {
    await sendToOffscreen({ type: "set-volume", tabId, volume, mode, auto });
  }
  return {};
}

// --- in-page path (fullscreen mode) ---
async function applyPage(tabId, volume, mode, auto) {
  // Make sure no capture is running for this tab.
  await stopCapture(tabId);

  const msg = { target: "page", type: "page-apply", volume, mode, auto };
  // Try an already-injected engine first; inject on first use, then retry.
  const res = await sendToTab(tabId, msg);
  if (!res?.injected) {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["page-engine.js"],
    });
    await sendToTab(tabId, msg);
  }
  // sendToTab only delivers the first frame's response — an empty iframe can
  // win the race and report media:0 even when the main frame wired a video.
  // Query all frames directly and sum their counts to get the real total.
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => window.__volumifierPage?.count() ?? 0,
    });
    const media = frames.reduce((sum, r) => sum + (r.result || 0), 0);
    return { media };
  } catch (_) {
    return { media: 0 };
  }
}

async function stopCapture(tabId) {
  await ensureOffscreen();
  const known = await sendToOffscreen({ type: "has-stream", tabId });
  if (known?.active) await sendToOffscreen({ type: "stop", tabId });
}

function sendToOffscreen(msg) {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

// Message a content frame; resolve undefined instead of rejecting when no
// engine is injected yet (or the page can't be scripted).
function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        void chrome.runtime.lastError; // swallow "no receiving end"
        resolve(resp);
      });
    } catch (_) {
      resolve(undefined);
    }
  });
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
        const res = await applyVolume(msg.tabId, msg.volume, msg.mode, msg.auto, msg.fs);
        setBadge(msg.tabId, msg.volume);
        sendResponse({ ok: true, ...res });
      } else if (msg.type === "stop") {
        await stopCapture(msg.tabId);
        await sendToTab(msg.tabId, { target: "page", type: "page-stop" });
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
