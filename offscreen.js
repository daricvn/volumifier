// Offscreen audio engine. Persists AudioContext + GainNode per captured tab.
// Captured tab audio is muted at source, so we MUST reconnect it to the
// destination — otherwise the user hears nothing.

const engines = new Map(); // tabId -> { ctx, source, filter, gain, comp, makeup, stream, routed }

// Log here AND forward to the service-worker console (the one the user watches).
function swLog(line) {
  chrome.runtime.sendMessage({ target: "background", type: "swlog", data: line }).catch(() => {});
}

// Per-mode biquad target. "generic" leaves the filter transparent and lets
// the master gain carry the whole boost. "voice"/"bass" pin the master at
// unity and pour the boost into a single band so only that band changes.
const BANDS = {
  voice: { type: "peaking", frequency: 2000, Q: 1.0 }, // speech presence band
  bass: { type: "lowshelf", frequency: 200, Q: 0.7 }, // low end
};

// Auto-level: a compressor/limiter inserted before the destination so a loud
// ad gets clamped while a quiet video is lifted toward the same loudness.
// Fast attack catches the ad's onset; the high ratio limits its peaks; the
// makeup gain restores the loudness the compression removed so quiet content
// stays audible. Tunable here — these are the only knobs for the feature.
const COMP = {
  threshold: -28, // dB; level where limiting kicks in
  knee: 30, // dB; soft bend so it doesn't pump
  ratio: 12, // strong limiting on anything above threshold (the ad)
  attack: 0.003, // s; fast enough to catch a sudden loud transient
  release: 0.25, // s; relaxes smoothly afterward
};
const MAKEUP = 1.8; // linear (~+5 dB) makeup gain to lift quiet content

// Does this engine still have a live captured audio track? A tab navigation
// (Netflix browse -> /watch/) ends the capture; sometimes the "ended" event
// never fires, leaving a dead engine that silently blocks re-capture.
function isLive(e) {
  return !!e && e.stream.getAudioTracks().some((t) => t.readyState === "live");
}

async function start(tabId, streamId, volume, mode, auto) {
  // Reuse only if the existing capture is still live; a dead one must be torn
  // down first so we re-capture the freshly-navigated page instead of poking a
  // zombie stream (which is why the boost "only came back after a refresh").
  const existing = engines.get(tabId);
  if (existing) {
    if (isLive(existing)) {
      setVolume(tabId, volume, mode, auto);
      return;
    }
    console.warn("[Volumifier] stale capture for tab", tabId, "- rebuilding");
    stop(tabId);
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  const at = stream.getAudioTracks()[0];
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
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
  // gain -> (comp -> makeup) -> destination, wired by route() per the auto flag.

  // Tap the captured signal so we can measure whether ANY audio is flowing in.
  // peak ~0 with ctx running => the capture grabbed a silent stream (the tab's
  // audio is on a path tabCapture can't reach until the media is reloaded).
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  engines.set(tabId, { ctx, source, filter, gain, comp, makeup, stream, routed: null, analyser, verified: false });
  configure(tabId, volume, mode, auto);

  // The offscreen AudioContext can be created "suspended" (no user gesture in
  // this document). A suspended ctx mutes the captured tab without replaying it
  // -> silence. Resume it, and keep it running if it ever flips back.
  if (ctx.state !== "running") {
    try { await ctx.resume(); } catch (_) {}
  }
  ctx.onstatechange = () => {
    if (ctx.state !== "running" && engines.has(tabId)) ctx.resume().catch(() => {});
  };

  // If the stream ends (tab closed / navigated), clean up.
  stream.getAudioTracks().forEach((t) => {
    t.addEventListener("ended", () => {
      console.warn("[Volumifier] capture track ended for tab", tabId);
      stop(tabId);
    });
  });

  // Detect a SILENT capture: Chrome can hand back a live, unmuted track that
  // carries no audio (the tab's sound is on a path tabCapture can't reach until
  // the page reloads). Sample the captured signal; if nothing flows, the popup
  // prompts the user to reload. Exit early as soon as any signal appears so the
  // normal (working) case stays fast.
  const silent = await measureSilent(analyser);
  const e0 = engines.get(tabId);
  if (e0 && !silent) e0.verified = true; // audio proven to flow -> never re-measure
  swLog(`[Volumifier] capture tab ${tabId} silent=${silent} ctx=${ctx.state}`);
  return { silent };
}

// Re-check an existing engine on a slider reuse. Once a capture has been proven
// to carry audio (verified), skip the measurement so dragging stays smooth; only
// a still-unproven capture (e.g. first created while the video was paused) pays
// the ~660ms cost, and only until it either produces audio or the user reloads.
async function measureEngine(tabId) {
  const e = engines.get(tabId);
  if (!e || !e.analyser) return { silent: false };
  if (e.verified) return { silent: false };
  const silent = await measureSilent(e.analyser);
  if (!silent) e.verified = true;
  return { silent };
}

const SILENCE_EPS = 1e-4;
async function measureSilent(analyser) {
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 110));
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    if (peak >= SILENCE_EPS) return false; // audio is flowing — done
  }
  return peak < SILENCE_EPS;
}

// Route the master gain to the destination, optionally through the auto-level
// compressor. Only rewires when the flag actually flips, so dragging the
// slider doesn't churn the graph (and never clicks).
function route(e, auto) {
  const want = !!auto;
  if (e.routed === want) return;
  try {
    e.gain.disconnect();
    e.comp.disconnect();
    e.makeup.disconnect();
  } catch (_) {}
  if (want) {
    e.gain.connect(e.comp);
    e.comp.connect(e.makeup);
    e.makeup.connect(e.ctx.destination);
  } else {
    e.gain.connect(e.ctx.destination); // replay so the tab stays audible
  }
  e.routed = want;
}

// Apply a volume + mode to a live engine. Smooth ramps avoid clicks/pops.
function configure(tabId, volume, mode, auto) {
  const e = engines.get(tabId);
  if (!e) return;
  route(e, auto);
  const now = e.ctx.currentTime;
  const ramp = (param, val) => {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(val, now + 0.05);
  };

  const band = BANDS[mode];
  if (band) {
    // Boost the targeted band only; everything else stays at unity.
    e.filter.type = band.type;
    e.filter.frequency.setValueAtTime(band.frequency, now);
    e.filter.Q.setValueAtTime(band.Q, now);
    ramp(e.filter.gain, volToDb(volume));
    ramp(e.gain.gain, Number(volume) === 0 ? 0 : 1); // honor mute at 0%
  } else {
    // Generic: transparent filter, master gain carries the flat boost.
    e.filter.type = "peaking";
    e.filter.frequency.setValueAtTime(1000, now);
    e.filter.gain.setValueAtTime(0, now); // 0 dB peaking = passthrough
    ramp(e.gain.gain, clampGain(volume));
  }
}

function setVolume(tabId, volume, mode, auto) {
  configure(tabId, volume, mode, auto);
}

function stop(tabId) {
  const e = engines.get(tabId);
  if (!e) return;
  try {
    e.source.disconnect();
    e.filter.disconnect();
    e.gain.disconnect();
    e.comp.disconnect();
    e.makeup.disconnect();
    e.stream.getTracks().forEach((t) => t.stop());
    e.ctx.close();
  } catch (_) {}
  engines.delete(tabId);
}

function clampGain(volume) {
  const v = Number(volume);
  if (!isFinite(v)) return 1;
  return Math.max(0, Math.min(6, v / 100)); // 0%..600% -> 0..6
}

// Slider % -> band gain in dB. 100% = 0 dB (no change), 600% ≈ +15.6 dB.
// Floor the input so 0% doesn't blow up to -Infinity dB.
function volToDb(volume) {
  const v = Math.max(1, Number(volume) || 0);
  return Math.max(-60, Math.min(20, 20 * Math.log10(v / 100)));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;

  (async () => {
    try {
      switch (msg.type) {
        case "start": {
          const diag = await start(msg.tabId, msg.streamId, msg.volume, msg.mode, msg.auto);
          sendResponse({ ok: true, diag });
          break;
        }
        case "set-volume": {
          setVolume(msg.tabId, msg.volume, msg.mode, msg.auto);
          // Re-measure unproven captures so a dead one created while paused gets
          // flagged once the video plays.
          const diag = await measureEngine(msg.tabId);
          sendResponse({ ok: true, diag });
          break;
        }
        case "has-stream": {
          // Report active only if the capture is still live. Drop a dead engine
          // here so the next apply() takes the re-capture path instead of
          // set-volume on a stream that no longer produces audio.
          const e = engines.get(msg.tabId);
          const live = isLive(e);
          if (e && !live) {
            console.warn("[Volumifier] dropping dead capture for tab", msg.tabId);
            stop(msg.tabId);
          }
          sendResponse({ ok: true, active: live });
          break;
        }
        case "stop":
          stop(msg.tabId);
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: "unknown type" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();

  return true;
});
