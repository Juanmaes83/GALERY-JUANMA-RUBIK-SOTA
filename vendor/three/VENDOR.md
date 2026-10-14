# Vendored dependency register

Required by `docs/architecture/immersive-worlds/REFERENCE_LEDGER.md` §22 and
IW-DEC-016: anything copied into this repository is recorded before it is used.

| Field | Value |
|---|---|
| Package | `three` |
| Version | `0.185.1` (exact, pinned) |
| Source | npm registry, `https://registry.npmjs.org/three/-/three-0.185.1.tgz` |
| License | MIT — `LICENSE` in this directory, copied verbatim and unmodified |
| Copyright | © 2010–2026 three.js authors |
| Files vendored | `build/three.module.min.js`, `build/three.core.min.js`, `examples/jsm/environments/RoomEnvironment.js`, `LICENSE` |
| Modifications | `RoomEnvironment.js`: the bare `'three'` import specifier was rewritten to the relative vendored path (`'../../three.module.min.js'`). No other change to any file. |
| Used by | `render/render-host.js`, `scene-kits/museum/*` |
| Not used by | `engine/**` — the semantic engine imports no renderer at all |
| Attribution obligation | MIT requires the copyright notice and licence text to travel with the code. `LICENSE` is kept next to the build and must remain in any export or distribution of this module. |

## Why vendored rather than loaded from a CDN

Other prototypes in `labs/` load Three from jsDelivr. That was rejected here for
three reasons: a deterministic QA state must not depend on a third-party network;
the module should run offline and in restricted build environments (jsDelivr is
in fact unreachable from the environment this milestone was built in); and a
floating CDN version would silently change captured visual baselines.

## What is *not* here

No code and no asset from any Immersive Worlds reference repository
(`Claude-of-Duty`, `artwork-3D-museum`, `3D-art-gallery-threejs`, `3DArtMuseum`,
`kage`, `a-long-expected-party`, `img2threejs`, `webGLImageTransitions`,
`vortex-gallery`, `camera-3D-showroom`, `threejs-procedural-dungeon`,
`-threejs-evidence-graph`, `threejs-journey`, `MengTo/skills`, `unslop`,
`gauntlet-loop`, or any other) has been copied or adapted into this module.
They were read for concepts, contracts and construction order only, which is the
`PATTERNS ONLY / DIRECT REUSE NOT PLANNED` default set by the Reference Ledger.

The reuse register in `REFERENCE_LEDGER.md` §22 therefore still contains no rows.

## `examples/jsm/utils/CameraUtils.js`

| Field | Value |
|---|---|
| Package | `three` (addon) |
| Version | `0.185.1` (exact, matches the pinned core above) |
| Source | npm registry, `three-0.185.1.tgz`, `examples/jsm/utils/CameraUtils.js` |
| License | MIT — same `LICENSE` as the core, copied verbatim |
| Modification | one line: the bare `'three'` specifier rewritten to `'../../three.module.min.js'`, the same rewrite already applied to `addons/environments/RoomEnvironment.js` |
| Required by | Portal variant D — `CameraUtils.frameCorners` reproduces the off-axis portal projection of the owned Infinite Worlds transition engine |
