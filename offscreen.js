// Offscreen audio engine. Persists AudioContext + GainNode per captured tab.
// Captured tab audio is muted at source, so we MUST reconnect it to the
// destination — otherwise the user hears nothing.

const engines = new Map(); // tabId -> { ctx, source, filter, gain, comp, makeup, stream, routed }

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

async function start(tabId, streamId, volume, mode, auto) {
  // Reuse if already running.
  if (engines.has(tabId)) {
    setVolume(tabId, volume, mode, auto);
    return;
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

  engines.set(tabId, { ctx, source, filter, gain, comp, makeup, stream, routed: null });
  configure(tabId, volume, mode, auto);

  // If the stream ends (tab closed / navigated), clean up.
  stream.getAudioTracks().forEach((t) => {
    t.addEventListener("ended", () => stop(tabId));
  });
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
        case "start":
          await start(msg.tabId, msg.streamId, msg.volume, msg.mode, msg.auto);
          sendResponse({ ok: true });
          break;
        case "set-volume":
          setVolume(msg.tabId, msg.volume, msg.mode, msg.auto);
          sendResponse({ ok: true });
          break;
        case "has-stream":
          sendResponse({ ok: true, active: engines.has(msg.tabId) });
          break;
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
