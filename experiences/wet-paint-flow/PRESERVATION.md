# Wet Paint Flow — Preserved Standalone Experience

**Family:** Immersive Worlds → Museum → Itinerant Experiences
**Experience ID:** `wet-paint-flow`
**Status:** FROZEN CANONICAL STANDALONE (build-and-freeze, Strategy A)
**Role:** Donor 1 — the real Wet Paint experience hosted (not reimplemented) by Museum.

## Canonical donor source

- **Repository:** `Juanmaes83/wet-paint-flow`
- **Pinned commit:** `0b9ba9a5be665f3a2a8b2450945ec5006e61e2de`
- **Human-validated running independently at:** `http://127.0.0.1:4186/`

The donor at that commit contains `index.html` / `main.js` / `styles.css` /
`package-lock.json` etc. It does **not** ship a `dist/`. This preserved artifact
is produced deterministically by us from the pinned source, not copied from any
build shipped by the donor.

## Deterministic build provenance

```
git checkout 0b9ba9a5be665f3a2a8b2450945ec5006e61e2de
npm ci                     # from the committed package-lock.json (three@0.185.1, vite@8)
npx vite build --base=./   # RELATIVE base so the artifact works at a nested path
```

- **Base:** `./` (relative). Required so the standalone loads when served from a
  nested path such as `/escaparates-pro/labs/immersive-worlds/experiences/wet-paint-flow/`.
  An absolute-base build white-screens when nested.
- **Node:** v22.x (donor `engines`: `^20.19.0 || >=22.12.0`).
- **Output frozen verbatim** from `dist/` into this directory.

## Content hashes (SHA-256)

| File | SHA-256 |
| --- | --- |
| `index.html` | `e36da00af331fdb6190e8de5e5173ca9e6b63c42e24ae94d759354b5a2f82da8` |
| `assets/index-BTDr0O24.js` | `313ce7301b0719bca5fb2fb0c095d88ddb38fe7d2f5f89284bd645c6c8cfc09b` |
| `assets/index-CzDU-wAD.css` | `edec4e95d6da5df8a8deaf4007b64614534c063442cd8c153ed6be47c1505301` |
| `assets/GLTFLoader-B3oaXjWN.js` | `aedf8051511f5ba2fb5513bf44d2a4d886060bbf5a60d492e52fd19896175895` |

## What Museum uses (no donor edits)

The donor already exposes everything the Museum bridge needs, so nothing inside
the standalone is modified:

- **Input seam:** `<input id="source-upload" type="file">` (+ `#upload-drop`).
  Museum hands the current `01 ORIGINAL` file to this control.
- **Status surface:** `window.__vangoghFlowState` (`{ ready, sourceMode, strokes,
  sourceSize, ... }`), `document.documentElement.dataset.growthProgress` (0→1)
  and `growthTime`, `window.__vangoghFlowErrors`.
- **Result surface:** the WebGL canvas at `#canvas-mount` (`renderer.domElement`).
  Museum captures one still after RESULT_READY for the `02 WET PAINT` wall plate.

## Museum seam added to index.html (documented, not donor logic)

`index.html` carries ONE tiny inline `<script>` at the top of `<head>`, added by
Museum: it patches `HTMLCanvasElement.prototype.getContext` to force
`preserveDrawingBuffer: true` before the donor bundle creates its WebGL context,
so the host can reliably read the painted frame (`toDataURL`) on real GPUs. This
does not touch the donor bundle or its algorithm; it is the same "neutralise on
the instance" discipline used by the Habitación 3 guest. Because of this line the
entry-HTML SHA-256 differs from a pristine `vite build` output; the `assets/*`
bundles are unchanged from the pinned build.

## Preservation rule

This artifact is a frozen canonical baseline. Do not hand-edit it. To update,
re-run the deterministic build against a new pinned donor commit, refresh the
hashes above, and record the change as a new version.
