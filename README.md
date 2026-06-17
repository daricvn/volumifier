# Volumifier — 600%

A tiny Chrome extension that boosts any tab's volume from **0% up to 600%**, with a
glassmorphic slider, quick presets, and a live boost badge on the toolbar icon.

Useful for quiet videos, faint conference calls, or podcasts recorded too low.

## Features

- **0–600% gain** per tab via the Web Audio API (`GainNode`).
- **Nonlinear slider** — extra width at low/mid volumes for precise aiming.
- **Presets**: Mute, 100%, 200%, 400%, Max.
- **Per-tab memory** — each tab remembers its level for the session.
- **Toolbar badge** shows the current boost %.
- **Smooth ramping** to avoid clicks/pops on big jumps.
- Manifest V3, no remote code, no tracking.

## How it works

| File            | Context                | Role                                                          |
| --------------- | ---------------------- | ------------------------------------------------------------ |
| `manifest.json` | —                      | MV3 config, permissions, icons.                              |
| `popup.html/css/js` | Action popup       | UI — slider, presets, power button.                          |
| `background.js` | Service worker         | Gets the tab capture stream id, coordinates the engine.      |
| `offscreen.js`  | Offscreen document     | Holds the `AudioContext` + `GainNode` per captured tab.      |

The captured tab audio is muted at source, so the offscreen engine reconnects the
stream to the speakers through a `GainNode` — that gain (0–6) is the boost.

### Permissions

| Permission   | Why                                                       |
| ------------ | -------------------------------------------------------- |
| `tabCapture` | Capture the active tab's audio stream.                  |
| `offscreen`  | Run an `AudioContext` outside the service worker.        |
| `storage`    | Remember per-tab volume (`storage.session`).             |
| `activeTab`  | Read the active tab's title/URL for the popup.           |

> Browser pages (`chrome://`, `edge://`, the Web Store, etc.) can't be captured —
> the popup disables itself on those.

## Development

Load the **unminified source** directly — no build needed:

1. `chrome://extensions`
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.

## Production build (minify + mangle)

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install      # one-time: pulls esbuild
npm run build    # -> dist/   (minified, mangled)
npm run zip      # -> dist/ + volume-booster-<version>.zip (store-ready)
npm run clean    # remove dist/
```

The build ([`build.mjs`](build.mjs)) uses **esbuild** to:

- minify + mangle each JS file **in place** (the three runtime contexts never
  import each other, so they are not bundled together),
- minify `popup.css`,
- strip comments / collapse whitespace in the HTML,
- re-emit `manifest.json` minified,
- copy icons verbatim.

Output goes to `dist/`. Test the production build with **Load unpacked → `dist/`**.

## Publishing to the Chrome Web Store

1. `npm run zip` → `volume-booster-<version>.zip`.
2. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration).
3. **Add new item** → upload the zip.
4. Fill listing: description, screenshots (1280×800 or 640×400), at least one
   128×128 icon, category, privacy justification for each permission above.
5. Submit for review.

> Bump `version` in `manifest.json` (and `package.json`) before each new upload —
> the store rejects duplicate versions.

## License

MIT.
