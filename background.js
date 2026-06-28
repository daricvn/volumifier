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
    // Is the page actually playing audible media? A silent capture only means
    // the dead-capture bug if real sound SHOULD be coming out. We can't use
    // tab.audible: once we capture, we mute the tab's output, so audible reads
    // false on every re-capture and the prompt would wrongly vanish. Probe the
    // page's <video>/<audio> directly — tabCapture mutes the tab's output but
    // does NOT pause the element, so this stays true across re-captures.
    const playing = await tabHasPlayingMedia(tabId);

    // Need a fresh capture stream id (must originate here, in the worker/extension).
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      const res = await sendToOffscreen({ type: "start", tabId, streamId, volume, mode, auto });
      await markCaptured(tabId, true); // remember so a later navigation invalidates it
      // silent===true AND media is playing: Chrome captured an empty stream even
      // though sound should be coming out -> needs a page reload.
      const silent = playing && !!res?.diag?.silent;
      return { silent };
    } catch (e) {
      console.warn("[Volumifier] re-capture failed for tab", tabId, e);
      throw e; // surfaced to the popup status line
    }
  }
  // Reusing a live capture. The offscreen re-measures any still-unproven capture
  // (e.g. one first made while the video was paused) and reports silence; pair it
  // with the playing probe so a now-playing-but-dead capture flips the prompt on.
  const res = await sendToOffscreen({ type: "set-volume", tabId, volume, mode, auto });
  if (res?.diag?.silent) {
    const playing = await tabHasPlayingMedia(tabId);
    return { silent: playing };
  }
  return { silent: false }; // verified or audio flowing — clear the prompt
}

// Tabs with a live capture, persisted so a service-worker restart doesn't lose
// track of which tabs to invalidate on navigation.
const CAP_KEY = "__capturedTabs";
async function markCaptured(tabId, on) {
  const { [CAP_KEY]: arr = [] } = await chrome.storage.session.get(CAP_KEY);
  const set = new Set(arr);
  on ? set.add(tabId) : set.delete(tabId);
  await chrome.storage.session.set({ [CAP_KEY]: [...set] });
}
async function isCaptured(tabId) {
  const { [CAP_KEY]: arr = [] } = await chrome.storage.session.get(CAP_KEY);
  return arr.includes(tabId);
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

// Does the page have a media element that should be making sound right now?
// Independent of tab.audible (which we poison by muting on capture): an element
// that is playing, not muted, and has audio data. Used to tell a genuine
// dead-capture (sound playing but capture empty) from a page that simply hasn't
// started audio yet. allFrames covers cross-origin players (Netflix /watch/).
async function tabHasPlayingMedia(tabId) {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const list = [...document.querySelectorAll("video,audio")].map((m) => ({
          paused: m.paused,
          ended: m.ended,
          muted: m.muted,
          volume: m.volume,
          readyState: m.readyState,
          ct: Math.round((m.currentTime || 0) * 10) / 10,
        }));
        const playing = list.some(
          (m) => !m.paused && !m.ended && !m.muted && m.volume > 0 && m.readyState >= 2
        );
        return { playing, list };
      },
    });
    return frames.some((f) => f.result?.playing === true);
  } catch (e) {
    console.warn("[Volumifier] probe failed for tab", tabId, String(e.message || e));
    return false; // can't script the tab -> assume not playing (no false prompt)
  }
}

async function stopCapture(tabId) {
  await markCaptured(tabId, false);
  await ensureOffscreen();
  const known = await sendToOffscreen({ type: "has-stream", tabId });
  if (known?.active) await sendToOffscreen({ type: "stop", tabId });
}

// A tab-capture stream goes STALE when the captured tab navigates across
// documents (Netflix browse -> /watch/): the track stays readyState "live"
// but no longer carries the new page's audio, so set-volume keeps poking a
// dead stream and the real <video> plays unboosted. The track never fires
// "ended", so we can't detect this from the stream — we watch the tab instead.
// Drop the capture on navigation; the next slider nudge re-captures the
// freshly-loaded page. (Only fires for tabs we're actually capturing.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!(changeInfo.status === "loading" || changeInfo.url)) return;
  if (!(await isCaptured(tabId))) return;
  await stopCapture(tabId);
  chrome.action.setBadgeText({ tabId, text: "" });
});

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

  // Offscreen forwards diagnostics here so they land in the one console
  // (service worker) the user is watching, printed flat (no collapsed objects).
  if (msg.type === "swlog") {
    return false;
  }

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
