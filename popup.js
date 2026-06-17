const slider = document.getElementById("slider");
const dial = document.getElementById("dial");
const valueEl = document.getElementById("value");
const badge = document.getElementById("boostBadge");
const tabName = document.getElementById("tabName");
const statusEl = document.getElementById("status");
let tickEls = [];
const powerBtn = document.getElementById("powerBtn");
const autoBtn = document.getElementById("autoBtn");
const volIcons = [...document.querySelectorAll(".volIcon")];
const modeBtns = [...document.querySelectorAll(".modeBtn")];
const audioTabsSection = document.getElementById("audioTabsSection");
const tabListEl = document.getElementById("tabList");
const langBtn = document.getElementById("langBtn");
const langFlag = document.getElementById("langFlag");
const langMenu = document.getElementById("langMenu");
const root = document.documentElement;

const t = (key, params) => I18N.t(key, params);

let tabId = null;
let currentTab = null;
let mode = "generic";
let auto = false; // auto-level (compressor/limiter) on/off
let applyTimer = null;
let restricted = false;

const modeKey = (id) => `mode-${id}`;
const autoKey = (id) => `auto-${id}`;

const MAX = 600;
const POS_MAX = 600; // slider raw range

// Piecewise-linear track so low/mid volumes get extra width for easy aiming.
// Each segment maps volume [v0,v1] <-> raw thumb position [p0,p1].
const SEGMENTS = [
  { v0: 0, v1: 10, p0: 0, p1: 60 }, // 0-10%   : 3x width
  { v0: 10, v1: 80, p0: 60, p1: 165 }, // 10-80%  : 1.5x width
  { v0: 80, v1: 600, p0: 165, p1: 600 }, // 80-600% : remainder
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function posToVol(p) {
  p = Math.max(0, Math.min(POS_MAX, p));
  for (const s of SEGMENTS) if (p <= s.p1) return lerp(s.v0, s.v1, (p - s.p0) / (s.p1 - s.p0));
  return MAX;
}
function volToPos(v) {
  for (const s of SEGMENTS) if (v <= s.v1) return lerp(s.p0, s.p1, (v - s.v0) / (s.v1 - s.v0));
  return POS_MAX;
}

// Status line remembers its translation key (+ params) so a language switch
// can re-render the current message. `statusRaw` is for non-translatable text
// like an error string handed back by the background worker.
let lastStatusKey = null;
let lastStatusParams = null;
let lastStatusErr = false;

function status(key, params = null, isErr = false) {
  lastStatusKey = key;
  lastStatusParams = params;
  lastStatusErr = isErr;
  statusEl.textContent = key ? t(key, params) : "";
  statusEl.classList.toggle("err", isErr);
}

function statusRaw(msg, isErr = false) {
  lastStatusKey = null;
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("err", isErr);
}

function reRenderStatus() {
  if (lastStatusKey) status(lastStatusKey, lastStatusParams, lastStatusErr);
}

// Reflect a volume in the UI (no message send). Snaps the thumb to the
// mapped position so the nonlinear track and the value stay in sync.
function render(volume) {
  const v = clamp(volume);
  const pos = Math.round(volToPos(v));
  slider.value = pos;
  valueEl.textContent = v;
  root.style.setProperty("--pct", (v / MAX).toFixed(3));
  root.style.setProperty("--fill", (pos / POS_MAX).toFixed(3));
  badge.classList.toggle("show", v > 100);
  dial.setAttribute("aria-valuenow", v);
  tickEls.forEach((el) => el.classList.toggle("active", Number(el.dataset.v) === v));
}

function clamp(v) {
  v = Number(v);
  // Fine control under 10% (step 2); coarse 10% steps above.
  v = v < 10 ? Math.round(v / 2) * 2 : Math.round(v / 10) * 10;
  return Math.max(0, Math.min(MAX, v));
}

// Debounced send to the background so dragging stays smooth.
function pushVolume(volume) {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    if (tabId == null) return;
    const res = await send({ target: "background", type: "apply-volume", tabId, volume, mode, auto });
    if (!res?.ok) statusRaw(res?.error || t("cannotBoost"), true);
    else status(volume > 100 ? "boostingTo" : "volume", { v: volume });
  }, 40);
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp);
    });
  });
}

slider.addEventListener("input", () => {
  const v = clamp(posToVol(Number(slider.value)));
  render(v);
  saveAndPush(v);
});

function stepSize(v) {
  return v < 10 ? 2 : 10;
}

function stepBy(dir) {
  if (restricted) return;
  const cur = clamp(posToVol(Number(slider.value)));
  const v = clamp(cur + dir * stepSize(cur));
  render(v);
  saveAndPush(v);
}

function attachStep(el) {
  el.addEventListener("wheel", (e) => { e.preventDefault(); stepBy(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); stepBy(1); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); stepBy(-1); }
  });
}

// Scroll/arrow-key volume control on both the slider track and the dial readout.
attachStep(slider);
attachStep(dial);

volIcons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const v = clamp(btn.dataset.v);
    render(v);
    saveAndPush(v);
  })
);

// Reflect the active boost mode in the segmented control.
function renderMode() {
  modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
}

// Switching mode re-applies the current volume under the new shaping
// (generic = flat boost, voice/bass = boost that band only).
modeBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    renderMode();
    if (tabId != null) chrome.storage.session.set({ [modeKey(tabId)]: mode });
    const v = clamp(posToVol(Number(slider.value)));
    pushVolume(v);
  })
);

// Reflect the auto-level toggle state.
function renderAuto() {
  autoBtn.classList.toggle("on", auto);
  autoBtn.setAttribute("aria-checked", auto ? "true" : "false");
}

// Flipping auto-level re-applies the current volume so the engine rewires
// the compressor in/out without changing the boost amount.
autoBtn.addEventListener("click", () => {
  if (restricted) return;
  auto = !auto;
  renderAuto();
  if (tabId != null) chrome.storage.session.set({ [autoKey(tabId)]: auto });
  const v = clamp(posToVol(Number(slider.value)));
  pushVolume(v);
  status(auto ? "autoOn" : "autoOff");
});

powerBtn.addEventListener("click", async () => {
  render(100);
  mode = "generic";
  auto = false;
  renderMode();
  renderAuto();
  if (tabId != null) {
    await send({ target: "background", type: "stop", tabId });
    chrome.storage.session.remove([String(tabId), modeKey(tabId), autoKey(tabId)]);
  }
  status("resetDone");
});

function saveAndPush(v) {
  if (tabId != null) chrome.storage.session.set({ [String(tabId)]: v });
  pushVolume(v);
}

// Tabs currently playing audio, shown as a switchable list.
async function refreshAudioTabs() {
  const tabs = await chrome.tabs.query({ audible: true });
  renderAudioTabs(tabs);
}

function renderAudioTabs(tabs) {
  tabListEl.innerHTML = "";
  audioTabsSection.classList.toggle("show", tabs.length > 0);

  for (const tb of tabs) {
    const li = document.createElement("li");
    li.className = "tabItem" + (tb.id === tabId ? " current" : "");

    const fav = document.createElement("img");
    fav.className = "tabFavicon";
    fav.src = tb.favIconUrl || "icons/icon16.png";
    fav.alt = "";
    fav.onerror = () => { fav.onerror = null; fav.src = "icons/icon16.png"; };

    const title = document.createElement("span");
    title.className = "tabTitle";
    title.textContent = tb.title || tb.url || t("tab");

    const eq = document.createElement("div");
    eq.className = "eq";
    eq.innerHTML = "<span></span><span></span><span></span>";

    const btn = document.createElement("button");
    btn.className = "switchBtn";
    btn.textContent = t("switchTo");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.tabs.update(tb.id, { active: true });
      await chrome.windows.update(tb.windowId, { focused: true });
    });

    li.append(fav, title, eq, btn);
    tabListEl.appendChild(li);
  }
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAudioTabs, 150);
}

chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if ("audible" in changeInfo || "title" in changeInfo || "favIconUrl" in changeInfo) scheduleRefresh();
});
chrome.tabs.onRemoved.addListener(scheduleRefresh);

/* ---------- localization ---------- */

// Translate every static element marked up in popup.html.
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
}

// The active-tab subtitle is dynamic (real tab title), so it lives outside
// the data-i18n sweep and is recomputed on its own.
function updateTabName() {
  if (!currentTab) return;
  tabName.textContent = restricted
    ? t("cantBoostBrowser")
    : currentTab.title || currentTab.url || t("activeTab");
}

function buildLangMenu() {
  langMenu.innerHTML = "";
  I18N.order.forEach((code) => {
    const li = document.createElement("li");
    li.className = "langItem";
    li.setAttribute("role", "option");
    li.dataset.lang = code;
    li.innerHTML =
      `<span class="flag">${I18N.flags[code]}</span>` +
      `<span class="langName"></span>`;
    li.querySelector(".langName").textContent = I18N.names[code];
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      setLanguage(code);
      closeLangMenu();
    });
    langMenu.appendChild(li);
  });
}

// Reflect the active language in the trigger button + the menu's selected row.
function updateLangUI() {
  const cur = I18N.getLang();
  langFlag.innerHTML = I18N.flags[cur];
  langMenu.querySelectorAll(".langItem").forEach((li) => {
    const on = li.dataset.lang === cur;
    li.classList.toggle("active", on);
    li.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function setLanguage(code) {
  I18N.setLang(code);
  chrome.storage.local.set({ lang: code });
  applyStaticI18n();
  updateLangUI();
  updateTabName();
  reRenderStatus();
  refreshAudioTabs(); // re-translate "Switch to" + tab fallbacks
}

function openLangMenu() {
  langMenu.classList.add("open");
  langBtn.setAttribute("aria-expanded", "true");
}
function closeLangMenu() {
  langMenu.classList.remove("open");
  langBtn.setAttribute("aria-expanded", "false");
}

langBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  langMenu.classList.contains("open") ? closeLangMenu() : openLangMenu();
});
document.addEventListener("click", closeLangMenu);

(async function init() {
  // Language first so every status/label below renders translated.
  const { lang: savedLang } = await chrome.storage.local.get("lang");
  I18N.setLang(savedLang || I18N.detect());
  buildLangMenu();
  applyStaticI18n();
  updateLangUI();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    status("noActiveTab", null, true);
    return;
  }
  tabId = tab.id;
  currentTab = tab;

  restricted = /^(chrome|edge|about|chrome-extension|devtools):/.test(tab.url || "");
  updateTabName();

  // Place tick labels at their true (nonlinear) track positions.
  // The thumb center travels [thumbW/2 … trackW−thumbW/2], so we map
  // fill ratio into that inner range to align ticks with the thumb.
  tickEls = [...document.querySelectorAll(".ticks span")];
  const trackW = slider.offsetWidth;
  const thumbW = 22; // matches .slider::-webkit-slider-thumb width
  tickEls.forEach((el) => {
    const v = Number(el.dataset.v);
    const fill = volToPos(v) / POS_MAX;
    const leftPx = thumbW / 2 + fill * (trackW - thumbW);
    el.style.left = ((leftPx / trackW) * 100).toFixed(2) + "%";
    el.style.transform =
      v === 0 ? "translateX(0)" : v === MAX ? "translateX(-100%)" : "translateX(-50%)";
    if (!restricted) {
      el.addEventListener("click", () => {
        const vol = clamp(v);
        render(vol);
        saveAndPush(vol);
      });
    }
  });

  if (restricted) {
    status("openNormalPage", null, true);
    slider.disabled = true;
    volIcons.forEach((b) => (b.disabled = true));
    modeBtns.forEach((b) => (b.disabled = true));
    autoBtn.disabled = true;
    powerBtn.disabled = true;
    return;
  }

  // Restore last value + mode + auto-level for this tab (session-scoped).
  const stored = await chrome.storage.session.get([String(tabId), modeKey(tabId), autoKey(tabId)]);
  const start = stored[String(tabId)] != null ? Number(stored[String(tabId)]) : 100;
  mode = stored[modeKey(tabId)] || "generic";
  auto = stored[autoKey(tabId)] === true;
  renderMode();
  renderAuto();
  render(start);
  status("dragToBoost");

  refreshAudioTabs();
})();
