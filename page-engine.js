// In-page audio engine — the "Fullscreen mode" alternative to tab capture.
//
// tabCapture puts the tab in a "being captured" state, which blocks/exits the
// page's native <video> fullscreen. This path never captures the tab: it wires
// each <video>/<audio> element through a Web Audio graph in the page itself
// (createMediaElementSource -> filter -> gain -> [comp -> makeup] -> output),
// so fullscreen, PiP and casting keep working.
//
// Tradeoff (documented in the README): createMediaElementSource is irreversible
// per element and outputs SILENCE for cross-origin (CORS-tainted) media, so this
// mode only boosts same-origin media elements the script can reach.
//
// Injected via chrome.scripting.executeScript on a user gesture (activeTab).
// Idempotent: re-injection no-ops thanks to the window guard.

(function () {
  if (window.__volumifierPage) return; // already installed in this frame

  // Mirror offscreen.js so both modes shape sound identically.
  const BANDS = {
    voice: { type: "peaking", frequency: 2000, Q: 1.0 },
    bass: { type: "lowshelf", frequency: 200, Q: 0.7 },
  };
  const COMP = { threshold: -28, knee: 30, ratio: 12, attack: 0.003, release: 0.25 };
  const MAKEUP = 1.8;

  let ctx = null;
  const chains = []; // { el, source, filter, gain, comp, makeup, routed }
  const wired = new WeakSet(); // elements already routed (can only wire once)
  let state = { volume: 100, mode: "generic", auto: false };

  function clampGain(volume) {
    const v = Number(volume);
    if (!isFinite(v)) return 1;
    return Math.max(0, Math.min(6, v / 100));
  }
  function volToDb(volume) {
    const v = Math.max(1, Number(volume) || 0);
    return Math.max(-60, Math.min(20, 20 * Math.log10(v / 100)));
  }

  // Would routing this element through Web Audio keep it audible? A cross-origin
  // (CORS-tainted) source goes SILENT once captured, and the capture can't be
  // undone — so we refuse to wire it and leave its audio untouched. blob: / MSE
  // sources (e.g. YouTube) are same-origin and safe, so the common fullscreen
  // case still works. Srcless elements are skipped until they have a source.
  function isPlayable(el) {
    const src = el.currentSrc || el.src || "";
    if (!src) return false;
    if (/^(blob:|data:|mediastream:|file:)/.test(src)) return true;
    try {
      const u = new URL(src, location.href);
      if (u.protocol === "http:" || u.protocol === "https:") {
        if (u.origin !== location.origin && !el.crossOrigin) return false;
      }
    } catch (_) {}
    return true;
  }

  // Wire one media element into its own chain. Returns false if it can't be
  // routed (already wired, cross-origin, or createMediaElementSource throws).
  function wire(el) {
    if (wired.has(el) || !isPlayable(el)) return false;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(el);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      comp.threshold.value = COMP.threshold;
      comp.knee.value = COMP.knee;
      comp.ratio.value = COMP.ratio;
      comp.attack.value = COMP.attack;
      comp.release.value = COMP.release;
      makeup.gain.value = MAKEUP;
      source.connect(filter);
      filter.connect(gain);
      const chain = { el, source, filter, gain, comp, makeup, routed: null };
      chains.push(chain);
      wired.add(el);
      configureChain(chain);
      return true;
    } catch (_) {
      // createMediaElementSource throws if the element was already captured by
      // another AudioContext, or for some cross-origin cases. Skip it.
      return false;
    }
  }

  function route(c, auto) {
    const want = !!auto;
    if (c.routed === want) return;
    try {
      c.gain.disconnect();
      c.comp.disconnect();
      c.makeup.disconnect();
    } catch (_) {}
    if (want) {
      c.gain.connect(c.comp);
      c.comp.connect(c.makeup);
      c.makeup.connect(ctx.destination);
    } else {
      c.gain.connect(ctx.destination);
    }
    c.routed = want;
  }

  function configureChain(c) {
    if (!ctx) return;
    route(c, state.auto);
    const now = ctx.currentTime;
    const ramp = (param, val) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(val, now + 0.05);
    };
    const band = BANDS[state.mode];
    if (band) {
      c.filter.type = band.type;
      c.filter.frequency.setValueAtTime(band.frequency, now);
      c.filter.Q.setValueAtTime(band.Q, now);
      ramp(c.filter.gain, volToDb(state.volume));
      ramp(c.gain.gain, Number(state.volume) === 0 ? 0 : 1);
    } else {
      c.filter.type = "peaking";
      c.filter.frequency.setValueAtTime(1000, now);
      c.filter.gain.setValueAtTime(0, now);
      ramp(c.gain.gain, clampGain(state.volume));
    }
  }

  function configureAll() {
    chains.forEach(configureChain);
  }

  // Find and wire every media element currently in this frame.
  function scan() {
    let found = 0;
    document.querySelectorAll("video, audio").forEach((el) => {
      if (wire(el)) found++;
    });
    return found;
  }

  // New media elements can appear after load (SPAs, ad rolls). Wire them as they
  // arrive and apply the current state so the boost "sticks".
  const mo = new MutationObserver((muts) => {
    let added = false;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.("video, audio")) added = wire(n) || added;
        n.querySelectorAll?.("video, audio").forEach((el) => {
          added = wire(el) || added;
        });
      }
    }
    if (added) configureAll();
  });
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Resume the context if a gesture had it suspended (autoplay policy).
  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  // Boost amount we leave behind when this mode is turned off. We can't undo
  // createMediaElementSource, so "off" = unity passthrough (element at 100%),
  // which also lets the tabCapture path take over cleanly if re-enabled.
  function passthrough() {
    state = { volume: 100, mode: "generic", auto: false };
    configureAll();
  }

  window.__volumifierPage = {
    apply(volume, mode, auto) {
      state = { volume, mode, auto };
      scan(); // wire any media not yet routed
      configureAll();
      resume();
      return chains.length;
    },
    stop() {
      passthrough();
    },
    count() {
      return chains.length;
    },
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.target !== "page") return;
    try {
      if (msg.type === "page-apply") {
        const media = window.__volumifierPage.apply(msg.volume, msg.mode, msg.auto);
        sendResponse({ ok: true, injected: true, media });
      } else if (msg.type === "page-stop") {
        window.__volumifierPage.stop();
        sendResponse({ ok: true, injected: true });
      } else if (msg.type === "page-ping") {
        sendResponse({ ok: true, injected: true, media: window.__volumifierPage.count() });
      }
    } catch (e) {
      sendResponse({ ok: false, injected: true, error: String(e.message || e) });
    }
    return false; // synchronous response
  });

  // Wire whatever is already on the page right away.
  scan();
})();
