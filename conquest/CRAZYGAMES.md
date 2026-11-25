# CrazyGames submission — CONQUEST

Everything the portal asks for, and where each requirement is implemented.

## Build

| | |
|---|---|
| Build file | `dist/conquest.html` (single self-contained file) |
| Size | **1.46 MB** (limit 50 MB basic / 250 MB full) |
| File count | **1** (limit 1500) |
| External assets | none — map, styles, audio and all 12 modules are inlined |
| External requests | only `https://sdk.crazygames.com/crazygames-sdk-v3.js` |
| Paths | none — nothing is loaded by path, so the "no absolute paths" rule cannot be violated |

To rebuild: `node scripts/bundle-single.mjs`

---

## Technical requirements

| Requirement | Status | Where |
|---|---|---|
| Initial download ≤ 50 MB | ✅ 1.46 MB total, and that *is* the initial download | — |
| Total size ≤ 250 MB, ≤ 1500 files | ✅ 1 file, 1.46 MB | — |
| Relative paths only | ✅ no paths at all | — |
| Chrome / Edge / Safari | ✅ plain ES2020 + canvas 2D, no engine, no WebGL requirement | — |
| 4 GB Chromebook | ✅ measured frame budget; the sim throttles itself when frame time exceeds 42 ms | `loop()` in `js/main.js` |
| Mouse, keyboard **and** touch | ✅ pointer events + floating thumb pad + pinch | `.touch-pad` in `styles.css` |
| Landscape desktop | ✅ and portrait too, below 900 px it switches to a single-column layout | `@media` blocks in `styles.css` |
| `user-select: none` snippet | ✅ with the full `-moz-`/`-ms-` variants | `body` in `styles.css` |
| iOS `AudioContext` resume on gesture | ✅ resumed from the play button, not from `visibilitychange` | `sfx.resume()` |
| No custom fullscreen button | ✅ hidden when running on the portal, kept off-portal | `#btn-fs` handler in `js/main.js` |

### Tested iframe sizes

All ten sizes QA checks pass in the harness (`.smoketest/iframes.mjs`):

`907×510` `1216×684` `1077×606` `821×462` `1366×768` `1920×1080` `1536×864` `1280×720` `800×450` `1080×607`

No element on the menu is fixed wider than the tightest frame (821 px).

---

## SDK integration

`js/crazygames.js` is the only file that touches `window.CrazyGames`. If the
SDK is missing, blocked, or the page is opened from `file://`, every call
degrades to a no-op and the game still runs — that is what keeps the same build
usable as a downloadable `.html`.

| Requirement | Status | Notes |
|---|---|---|
| SDK loaded in `<head>` | ✅ injected by `loadSdk()`, `async`, 4 s timeout | never blocks first paint |
| `await SDK.init()` | ✅ | boot continues in parallel; nothing waits on the CDN |
| `loadingStart` / `loadingStop` | ✅ | start fires before module work, stop when the menu is interactive. A start that happens before `init()` resolves is replayed |
| `gameplayStart` / `gameplayStop` | ✅ | start on match begin and on unpause; stop on pause, on returning to the menu, and on the results screen |
| `muteAudio` respected | ✅ and it **outranks** the in-game toggle | the in-game checkbox locks and greys out so it cannot appear to unmute |
| `disableChat` respected | ✅ | chat dock, lobby chat and both inputs hidden *and* disabled |
| Settings change listener | ✅ | re-applies mute/chat live without a reload |
| `happytime()` | ✅ wins only | not on every milestone |
| `reportGameCompletedPercentage` | ✅ | share of the world map at match end, 0–100 |
| `systemInfo.locale` → language | ✅ | `ar*` gets Arabic, everything else English; a saved Settings choice always wins |
| Midgame ad | ✅ one placement | on the results screen — a real break, never during play. Frequency and unfilled ads are left to the portal; `adError` is handled and never blocks |
| Rewarded ads | ❌ none | deliberately: the game has no lives or currency sink that would make one honest |
| Banner ads | ❌ none | nothing to gain before Full Launch, and banners during play are prohibited |
| Works with AdBlock | ✅ | no ad call is on a critical path; the error callback just continues |
| Room data (`updateRoom`) | ✅ | room id = lobby code, `isJoinable` true while the lobby fills, false once the match starts |
| `leftRoom()` | ✅ | on leaving the lobby or the match |
| Invite link params | ✅ | `inviteParams` / `?room=CODE` pre-fills the join box and joins automatically |
| Join-room listener | ✅ | accepting an invite mid-match drops into that room without a reload |
| Instant multiplayer | ✅ | `isInstantMultiplayer` creates a room instead of showing the lobby browser |
| Player name from CG account | ❌ not yet | name field defaults to the player's own; showing the CG username is a Full Launch item |
| Progress save via `data` module | ❌ not yet | saves are `localStorage`; moving them onto the `data` module is a Full Launch item and needs the *Progress Save* toggle |


### Where "translated" has to be checked beyond the DOM

The map is a `<canvas>`, so none of its text exists as DOM nodes. A page can
test as 100% English while the map under it still reads روسيا. Three paths need
their own handling, and all three have a harness:

| Path | Why the DOM walker misses it | Where it is handled |
|---|---|---|
| Nation names painted on the map | canvas text, no DOM nodes | `drawLabels()` in `js/render.js` picks `c.name` / `n.ar` from `getLang()` |
| Browser tab title | lives in `<head>`, outside `<body>` | `applyDocumentTitle()` in `js/i18n.js`, original kept in a data attribute |
| `confirm()` on surrender | native browser dialog | the message string goes through `t()` |

`.smoketest/canvas-text.mjs` records every `fillText`/`strokeText` and asserts
no Arabic survives on the canvas in English mode (and that Arabic is still
there in Arabic mode). `.smoketest/sweep.mjs` opens the campaigns list, a
campaign detail card, a live campaign match, the how-to and medals panels.

---

## Gameplay requirements

| Requirement | Status | Notes |
|---|---|---|
| **English localisation, everywhere** | ✅ | English is the default; Arabic is optional. Covers DOM text *and* the three places the DOM walker cannot reach — see below |
| Uses `locale`, falls back to English | ✅ | see above |
| Readable at `devicePixelRatio: 1` | ✅ | 12–14 px minimum body text, high-contrast palette |
| **Land in gameplay, max 1 click** | ✅ | **⚡ Quick start** on the menu is one click to a live match. The nation picker is a separate, clearly labelled choice |
| Consistent physics at 144/165 Hz | ✅ | integration uses real delta time, clamped at 250 ms, never a fixed per-frame step |
| Originality | ✅ | own name, own procedural pixel map of real borders, no borrowed assets |
| No cross-promotion | ✅ | no external links anywhere in the game |
| PEGI 12 | ✅ | war strategy, no gore, no blood, no strong language; chat has a profanity filter |
| Chat moderation | ✅ | word-list filter with leet/diacritic folding, applied before every send |

---

## What is still open for Full Launch

These are the only gaps, and none of them block a Basic Launch:

1. **CG account name + avatar** in the lobby (`user.getUser()`).
2. **Progress save on the `data` module** — currently `localStorage`, which the
   data docs say must be replaced wholesale, not mirrored.
3. **Lobby size** declared in the submission form.

## Submission metadata

- **Title:** CONQUEST — World Domination
- **Genre:** strategy / io
- **Controls:** mouse or touch to pick a nation and select targets; `1`–`8`
  build, `R` research, `Q`/`E` attack strength, `Space` pause, `+`/`-` speed,
  `F` centre on your capital
- **Players:** single player vs AI; online rooms of 2–8
- **Languages:** English (default), العربية
- **Cover image:** still required — the portal will not accept a submission
  without one.
