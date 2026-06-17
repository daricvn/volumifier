// Production build for the Volume Booster extension.
// Minifies + mangles JS and CSS, copies the static assets into dist/,
// and (with --zip) produces a store-ready archive.
//
//   npm run build     -> dist/
//   npm run zip       -> dist/ + volume-booster-<version>.zip

import { build } from "esbuild";
import {
  rmSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  createWriteStream,
} from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = ".";
const OUT = "dist";

// Each JS file is its own runtime context (service worker / offscreen / popup)
// and they only talk via chrome.runtime messaging — so minify each in place,
// never bundle them together.
const JS_ENTRIES = ["background.js", "offscreen.js", "popup.js", "i18n.js", "page-engine.js"];
const CSS_ENTRIES = ["popup.css"];
const HTML_FILES = ["popup.html", "offscreen.html"];

// Fresh output dir.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// --- JS: minify + mangle, keep no sourcemaps in the shipped bundle ---
await build({
  entryPoints: JS_ENTRIES.map((f) => `${SRC}/${f}`),
  outdir: OUT,
  bundle: false,
  minify: true, // whitespace + identifiers + syntax
  format: "esm",
  target: "chrome110",
  legalComments: "none",
});

// --- CSS: minify ---
await build({
  entryPoints: CSS_ENTRIES.map((f) => `${SRC}/${f}`),
  outdir: OUT,
  minify: true,
  loader: { ".css": "css" },
});

// --- HTML: strip comments + collapse inter-tag whitespace (lightweight) ---
for (const f of HTML_FILES) {
  const html = readFileSync(`${SRC}/${f}`, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
  writeFileSync(`${OUT}/${f}`, html);
}

// --- manifest.json: re-emit minified ---
const manifest = JSON.parse(readFileSync(`${SRC}/manifest.json`, "utf8"));
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest));

// --- icons: copy verbatim ---
mkdirSync(`${OUT}/icons`, { recursive: true });
for (const icon of readdirSync(`${SRC}/icons`)) {
  copyFileSync(`${SRC}/icons/${icon}`, `${OUT}/icons/${icon}`);
}

console.log(`Built -> ${OUT}/ (v${manifest.version})`);

// --- optional: zip for the Chrome Web Store ---
if (process.argv.includes("--zip")) {
  const zipName = `volume-booster-${manifest.version}.zip`;
  rmSync(zipName, { force: true });
  try {
    // Windows 10+ ships tar (libarchive) which can write zips.
    execFileSync("tar", ["-a", "-c", "-f", `../${zipName}`, "."], {
      cwd: OUT,
      stdio: "inherit",
    });
    console.log(`Zipped -> ${zipName}`);
  } catch {
    console.warn(
      "Could not auto-zip. Manually zip the CONTENTS of dist/ (not the folder itself)."
    );
  }
}
