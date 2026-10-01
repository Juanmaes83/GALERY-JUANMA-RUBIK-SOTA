# Auditoría de extracción: museo grande de escaparates-pro

Fecha: 2026-10-01
Origen: `Juanmaes83/escaparates-pro` (privado), módulo `labs/immersive-worlds`
Destino: `Juanmaes83/GALERY-JUANMA-RUBIK-SOTA` (público), rama `claude/extract-museo-grande-repo-cs0gwm`

Este documento sirve de registro de la Fase 1 (informe previo a la copia) y de inventario de la extracción.

---

## 1. Estado seleccionado

| Campo | Valor |
|---|---|
| Rama | `codex/museum-glb-marble-bust-v1` (head de la **PR #85**, borrador y abierta) |
| SHA exacto | **`382e566e3125ce3624fd948d0ef64eaa5c1511df`** |
| Base | `claude/museum-itinerant-living-art-graft-v1` @ `eb207827c542aeec4831055278f808ebb06dfbd8` (head de la **PR #61**, línea de integración del museo) |
| Método | Snapshot limpio de archivos concretos. Sin historial, sin `git subtree` y sin clonación del historial general |

### Motivo de la selección

La selección se hizo por contenido, no por el nombre de la rama:

- `master` (`e1d26c4`) **no contiene** `labs/immersive-worlds`.
- La PR #61 es la línea de integración del museo. Su descripción y sus merges la definen como el estado canónico: «Four room freeze»; Character 2027 hasta la fase 6; Vasija premium (PR #84); recuperación de controles (`repair/museum-control-recovery-v1`); recuperación de Studio Schema 3 (PR #82).
- Estas ramas candidatas son **ancestros** del head de la PR #61, así que su contenido ya está incluido:
  - `candidate/museum-character-2027-complete`;
  - `integration/museum-full-studio-three-room-v1`;
  - `repair/museum-control-recovery-v1`;
  - `codex/museum-visual-stone-vasija-v1`;
  - `chatgpt/museum-character-2027-phase6-cinematic-camera-v1`.
- La PR #85 parte **exactamente** del head de la PR #61 y solo añade 3 commits (12 archivos), todos relativos a Marble Bust 01 y a sus correcciones de QA y de shells. Por tanto, el head de #85 es el superconjunto más completo y coherente que contiene la escultura pedida. Para obtenerlo no hubo que combinar ramas.

### PR y cambios

| PR / rama | Estado en el origen | En la extracción |
|---|---|---|
| PR #61 (`eb20782`) | Abierta, no fusionada, `dirty` frente a `master` | **Incluida**, como base del head de la PR #85 |
| PR #85 (`382e566`) Marble Bust 01 | Borrador, abierta, sin veredicto humano. CI `breeze-browser-qa` en verde | **Incluida. Veredicto visual humano KEEP o ADJUST: PENDIENTE.** No se marca como aprobada |
| PR #83 (`fc153d8`) recuperación del avatar en la vista previa de Studio | Borrador, «DO NOT MERGE» hasta KEEP o ADJUST, basada en `b1efb37` (anterior a #84) | **Excluida**: no forma parte de la línea canónica y combinarla sería una fusión no autorizada. Su contenido (elección POV/avatar al entrar y reinstalación tras reconstruir Studio) queda en el roadmap |
| `chatgpt/museum-character-2027-phase6-exterior-full-world-v1` (`b6bad26`) | 2 commits por delante de la PR #61, sin fusionar | **Excluida**: no está en la línea canónica |

Las PR, las ramas y los archivos del origen no se han modificado. Para leer el estado se usó un worktree desacoplado en un directorio temporal.

## 2. Funcionalidades y salas

- **Incluidas y operativas:**
  - Vestíbulo, Galería A (4 obras, *Vasija de arenas* y **Marble Bust 01**), Galería B (2 obras y la proyección), Archivo y Sala Itinerante Wet Paint (con Wet Paint Flow anidado);
  - recorrido comentado, mapa, modo detalle y estados deterministas;
  - avatar Character 2027 (capas por URL).
- **Incluida sin su motor:** la Sala Breeze. Sigue en el World y en el recorrido; al entrar muestra un aviso con salida a Galería B (ver §4).

## 3. Dependencias fuera de `labs/immersive-worlds`

| Dependencia | Dónde está | ¿Necesaria? | Decisión |
|---|---|---|---|
| `tests/static-server.mjs` del monorepo (servidor del README original) | raíz de escaparates-pro | Sí, para ejecutar en local | **No copiada.** Se sustituye por `tools/serve.mjs`, propio y sin dependencias |
| `labs/website-modules-source/breeze-studio-pro/` (Breeze Studio PRO V4.1; 20 archivos, 44 MB) | Otro lab de escaparates-pro. Se carga por iframe desde `app/nested/breeze/breeze-studio-pro-guest.js` | Solo para la Sala Breeze | **No copiada (bloqueo, §4)** |
| Licencia y avisos de Wet Paint Flow | `Juanmaes83/wet-paint-flow` @ `0b9ba9a` (`LICENSE`, `THIRD_PARTY_NOTICES.md`, `ASSET_PROVENANCE.md`) | **Sí**: la licencia MIT exige que el aviso acompañe al build ya incluido | **Copiados verbatim** (hash de blob verificado) |
| Avatar `Avatar_1.glb` (30 MB) | Bucket externo `pub-0f344e596c324724a0b7300e3bc1d129.r2.dev` | Sí, para el avatar | **No copiado.** Se mantiene la referencia remota del origen (§5) |
| Configuración raíz del monorepo (`vercel.json`, `package.json`) | raíz de escaparates-pro | No: contiene rutas de otras aplicaciones (`/studio`, `/projects` y `/p/:slug`) | **No copiada.** Se crea un `package.json` propio y mínimo |

## 4. Bloqueo: Sala Breeze

- **Qué falta:** Breeze Studio PRO V4.1, en `escaparates-pro/labs/website-modules-source/breeze-studio-pro/` (donor `c86cd3e2`).
- **Por qué es necesario:** la Sala Breeze (`space.breeze`, `metadata.nestedRuntime = room.breeze`) no tiene representación propia en el museo. Ejecuta ese producto completo dentro de un iframe, y el último capítulo del recorrido comentado termina en esa sala.
- **Por qué no se copió:**
  1. Es un producto Studio independiente, y el encargo los excluye.
  2. Sus assets tienen licencias mixtas que requieren revisión antes de publicarse en un repositorio público. Por ejemplo:
     - el modelo Venus de Milo de Sketchfab, sin licencia indicada en `CREDITS.md`;
     - una textura de Vecteezy;
     - HDRI de Poly Haven y modelos de Khronos (CC0).
  3. Requiere WebGPU.
- **Qué se hizo:** en lugar de un iframe con un 404, la sala comprueba con `HEAD` si el producto está servido. Si no lo está, muestra el aviso «Sala no disponible en esta edición» con un botón que reenvía a la salida canónica (portal del WorldGraph a Galería B). Si el producto se sirviera en su ruta, el camino original no cambia.
- **Para incluirla:** hace falta autorización expresa y revisar las licencias de `CREDITS.md`.

## 5. Archivos sospechosos y riesgos

- **Studio (editor) acoplado al runtime del visitante.** `index.html` instala siempre `visitor-phase1`, `museum-phase2`, `avatar-phase5*`, `breeze-persistence-adapter` y `wet-paint-studio-controls`. Estos módulos parchean a la vez el HUD del visitante y el prototipo de `StudioShell`, que importan de forma estática.
  - Quitar ese código exigiría refactorizar el museo. Por eso se incluye como **dependencia de código**: `studio-shell.js`, `experience-tree.js`, `media-catalogue.js`, `readiness.js` y CSS de capas de visitante.
  - **El Studio no se monta:** `authoringOn = false` en `app/experience-app.js`.
  - Se excluyen las piezas que solo usa el editor: `authoring-panel.js`, `authoring.css`, `studio.css`, `museum-b.config.json` y los assets `bruma-*`.
- **Avatar remoto sin licencia documentada.** El origen identifica el GLB como «VECINIA S3-A1R approved Character 2027 asset» (commit `45e454fe`), pero no indica licencia. Además, el repositorio de origen es privado: al publicar este repositorio, la URL del bucket pasa a ser pública. No es un secreto, pero sí un recurso de hosting. **Recomendación:** documentar la licencia y alojar el avatar en un origen controlado.
- **Defectos heredados del origen**, reproducidos en `382e566` con Breeze PRO real:
  - la barra superior del HUD tapa el botón-puente «← Galería B» de las salas anidadas;
  - el aviso de proximidad de la Sala Breeze dice «Volver a la Galería A»;
  - la tecla `E` no saca de la sala.

  No se corrigen en el código heredado. El botón del aviso propio garantiza la salida.
- **Secretos y datos personales:** búsqueda sin resultados de claves, tokens, credenciales, archivos `.env` o sourcemaps en los archivos importados. El único email es ficticio (`visitas@fundacionarenas.example`). No hay archivos ocultos importados aparte de `.gitignore`, que es propio.

## 6. Excluido deliberadamente

| Excluido | Motivo |
|---|---|
| Resto de escaparates-pro (`apps/`, `js/`, `css/`, otros `labs/`, `studio.html`, `legal/`, etc.) | Otros productos |
| `author.html`, `app/author-app.js`, `authoring/authoring-panel.js`, `authoring.css`, `studio.css` y `museum-b.config.json` | Herramientas de autoría o editor |
| `breeze-integration-studio.html`, `wet-paint-studio.html`, `media-recovery-studio.html`, `wet-paint-visit.html` y `authoring/project-cloud/` | Shells de Studio o demos ajenas a la visita |
| `authoring/studio/` sin importar (validaciones, `breeze-museum-authoring-bridge`, `gallery-b-closeout-validation`) y `authoring/museum-*-media*.js` y `wet-paint-*-media*.js` | El runtime de la visita no los referencia |
| `worlds/institutional-demo.world.json` y `worlds/itinerant-wet-paint-lab.world.json` | Mundos de demostración, no forman parte del museo |
| `assets/institutions/` (Museo de la Bruma) | Demo del Studio |
| `vendor/breeze-core/` (16 MB) y `app/nested/breeze/breeze-guest.js` | Guest de Breeze anterior, no registrado en el runtime |
| `engines/` (painterly, wet-paint-pipeline) | El runtime no los referencia |
| `donors-frozen/` (CharacterStudio, VECINIA) | Fuentes donantes congeladas que el runtime no importa |
| `preview/` (9,9 MB) | Material de vista previa sin referencias en el runtime |
| `qa/` salvo `deterministic-states.js` (evidencias de 432 MB y herramientas), incluido `qa/run-qa.mjs` | Evidencias internas. La suite original depende de la estructura del monorepo y de los mundos de demostración; se sustituye por `tests/museum-smoke.mjs` |
| `docs/` salvo los dos registros de piezas de Galería A, y el `README.md` original | Documentación interna (handoffs, automatización de tareas, trackers con rutas del monorepo). El README se sustituye por uno propio |
| `experiences/wet-paint-flow/og.png` | Imagen social que el runtime no usa; el HTML apunta a una URL absoluta externa |

## 7. Modificaciones respecto al origen

Solo dos archivos del snapshot cambian (commit `adapt:`):

1. `app/experience-app.js`: `authoringOn = false`. Edición pública de visita, sin Studio.
2. `app/nested/breeze/breeze-studio-pro-guest.js`: comprobación de presencia de Breeze PRO, aviso y botón de salida.

El commit `import:` contiene el snapshot **sin modificar**: 132 archivos idénticos byte a byte al origen, más los 3 avisos de Wet Paint Flow copiados verbatim. Un `git diff` entre ese commit y el siguiente muestra exactamente las adaptaciones.

## 8. Validaciones

Ver el resultado en la PR. Comandos: `npm install` (instalación limpia), `npm run check`, `npm test` y `git diff --check`. No hay paso de build: el museo es estático (módulos ES y `importmap`).

## 9. Inventario de archivos importados

Cada archivo tiene una justificación. «Referenciado por» indica el primer archivo, en el grafo de dependencias desde `index.html`, que lo importa, enlaza o carga. Los archivos propios de este repositorio (`README.md`, `THIRD_PARTY_NOTICES.md`, `package.json`, `package-lock.json`, `.gitignore`, `tools/*`, `tests/*` y este documento) no figuran en la tabla.

| Archivo | Bytes | Justificación |
|---|---:|---|
| `app/audio-director.js` | 5408 | Referenciado por `app/experience-app.js` |
| `app/experience-app.js` | 26583 | Referenciado por `index.html` |
| `app/nested/breeze/breeze-studio-pro-guest.js` | 9523 | Referenciado por `app/nested/nested-room-controller.js` |
| `app/nested/nested-room-controller.js` | 5830 | Referenciado por `app/experience-app.js` |
| `app/nested/nested-room-host.js` | 7956 | Referenciado por `app/nested/nested-room-controller.js` |
| `app/ui/hud.js` | 28848 | Referenciado por `app/experience-app.js` |
| `app/ui/input.js` | 8942 | Referenciado por `app/experience-app.js` |
| `app/ui/styles.css` | 20173 | Referenciado por `index.html` |
| `assets/collection/RIGHTS.md` | 2175 | Registro de derechos de la colección |
| `assets/collection/campo-de-ceniza.jpg` | 80396 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/collection/cuaderno-de-luz.webm` | 4746 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/collection/division-tercera.jpg` | 104310 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/collection/estudio-de-figura.jpg` | 140886 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/collection/horizonte-interrumpido.jpg` | 81548 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/collection/marea-baja.jpg` | 95415 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/collection/noche-de-invierno.jpg` | 341356 | Referenciado por `worlds/museum-v1.world.json` |
| `assets/models/sculpture/marble_bust_01_1k.glb` | 897296 | Referenciado por `scene-kits/museum/model-assets.js` |
| `assets/models/sculpture/marble_bust_01_1k.provenance.json` | 1446 | Procedencia y licencia CC0 de Marble Bust 01 |
| `authoring/config-store.js` | 1222 | Referenciado por `app/experience-app.js` |
| `authoring/experience-config.js` | 19237 | Referenciado por `app/experience-app.js` |
| `authoring/media-vault.js` | 12598 | Referenciado por `app/experience-app.js` |
| `authoring/studio/avatar-phase5-motion.js` | 15169 | Referenciado por `index.html` |
| `authoring/studio/avatar-phase5-visibility-continuity.js` | 16516 | Referenciado por `index.html` |
| `authoring/studio/avatar-phase5.css` | 5257 | Referenciado por `index.html` |
| `authoring/studio/avatar-phase5.js` | 25163 | Referenciado por `index.html` |
| `authoring/studio/breeze-persistence-adapter.js` | 12452 | Referenciado por `index.html` |
| `authoring/studio/experience-tree.js` | 5166 | Referenciado por `authoring/studio/studio-shell.js` |
| `authoring/studio/media-catalogue.js` | 6763 | Referenciado por `authoring/studio/studio-shell.js` |
| `authoring/studio/museum-phase2-hardening.css` | 4935 | Referenciado por `index.html` |
| `authoring/studio/museum-phase2-hardening.js` | 11108 | Referenciado por `index.html` |
| `authoring/studio/museum-phase2-layout-fix.js` | 1155 | Referenciado por `index.html` |
| `authoring/studio/museum-phase2.css` | 4274 | Referenciado por `index.html` |
| `authoring/studio/museum-phase2.js` | 30230 | Referenciado por `index.html` |
| `authoring/studio/readiness.js` | 8246 | Referenciado por `authoring/studio/studio-shell.js` |
| `authoring/studio/studio-shell.js` | 73738 | Referenciado por `app/experience-app.js` |
| `authoring/studio/visitor-phase1.css` | 6913 | Referenciado por `index.html` |
| `authoring/studio/visitor-phase1.js` | 20114 | Referenciado por `index.html` |
| `authoring/studio/wet-paint-studio-controls.js` | 18534 | Referenciado por `index.html` |
| `character/approved-avatar-asset-loader.js` | 4310 | Referenciado por `authoring/studio/avatar-phase5-visibility-continuity.js` |
| `character/character-motion-v2.js` | 7898 | Referenciado por `authoring/studio/avatar-phase5-motion.js` |
| `character/character-social-motion-v3.js` | 4332 | Referenciado por `character/museum-character-phase6-gatea.js` |
| `character/motion-foundation-v2-idle.js` | 4275 | Referenciado por `character/museum-character-phase3.js` |
| `character/museum-character-cinematic-camera.js` | 15851 | Referenciado por `index.html` |
| `character/museum-character-phase3.js` | 10246 | Referenciado por `index.html` |
| `character/museum-character-phase4a-final-polish.js` | 4166 | Referenciado por `character/museum-character-phase4a.js` |
| `character/museum-character-phase4a.js` | 16252 | Referenciado por `index.html` |
| `character/museum-character-phase4b-gallery-b-circulation.js` | 3303 | Referenciado por `character/museum-character-phase4b.js` |
| `character/museum-character-phase4b.js` | 7866 | Referenciado por `index.html` |
| `character/museum-character-phase6-gatea.js` | 22881 | Referenciado por `index.html` |
| `character/museum-character-semantic-view.js` | 3758 | Referenciado por `character/museum-character-phase6-gatea.js` |
| `character/museum-character-tour-bridge.js` | 26668 | Referenciado por `index.html` |
| `character/museum-human-spatial-contract.js` | 5830 | Referenciado por `character/museum-character-phase6-gatea.js` |
| `docs/MUSEUM_GLB_MARBLE_BUST_PILOT_2026-09-02.md` | 5071 | Registro del piloto Marble Bust 01 (fuente, licencia, validación, veredicto pendiente) |
| `docs/MUSEUM_VISUAL_STONE_VASIJA_PREMIUM_V1_2026-09-02.md` | 2708 | Registro de la pieza Vasija de arenas (Galería A) |
| `engine/camera/camera-authority.js` | 8042 | Referenciado por `engine/core/runtime.js` |
| `engine/camera/controllers/author-controller.js` | 2651 | Referenciado por `engine/core/runtime.js` |
| `engine/camera/controllers/crossing-controller.js` | 13400 | Referenciado por `engine/core/runtime.js` |
| `engine/camera/controllers/directed-controller.js` | 6776 | Referenciado por `engine/core/runtime.js` |
| `engine/camera/controllers/explore-controller.js` | 4952 | Referenciado por `engine/core/runtime.js` |
| `engine/camera/controllers/focus-controller.js` | 3533 | Referenciado por `engine/core/runtime.js` |
| `engine/camera/controllers/third-person-explore-controller.js` | 15272 | Referenciado por `character/museum-character-phase4a.js` |
| `engine/camera/framing.js` | 4187 | Referenciado por `character/museum-character-cinematic-camera.js` |
| `engine/core/clock.js` | 2507 | Referenciado por `engine/core/runtime.js` |
| `engine/core/device-tier.js` | 4828 | Referenciado por `app/experience-app.js` |
| `engine/core/event-bus.js` | 3223 | Referenciado por `app/experience-app.js` |
| `engine/core/rng.js` | 1600 | Referenciado por `engine/core/runtime.js` |
| `engine/core/runtime.js` | 34088 | Referenciado por `app/experience-app.js` |
| `engine/experience/experience-director.js` | 40791 | Referenciado por `engine/core/runtime.js` |
| `engine/experience/tour-manifest.js` | 7305 | Referenciado por `character/museum-character-tour-bridge.js` |
| `engine/interaction/action-dispatch.js` | 2668 | Referenciado por `engine/core/runtime.js` |
| `engine/interaction/proximity.js` | 4063 | Referenciado por `engine/core/runtime.js` |
| `engine/scenekit/scene-kit.js` | 8431 | Referenciado por `engine/core/runtime.js` |
| `engine/schema/types.js` | 11545 | Referenciado por `app/experience-app.js` |
| `engine/schema/validate.js` | 14201 | Referenciado por `engine/world/world-store.js` |
| `engine/world/space-lifecycle.js` | 10923 | Referenciado por `engine/core/runtime.js` |
| `engine/world/world-graph.js` | 3373 | Referenciado por `engine/core/runtime.js` |
| `engine/world/world-state.js` | 6868 | Referenciado por `app/experience-app.js` |
| `engine/world/world-store.js` | 6142 | Referenciado por `engine/core/runtime.js` |
| `experiences/experience-bridge.js` | 6160 | Referenciado por `experiences/wet-paint-adapter.js` |
| `experiences/wet-paint-adapter.js` | 23307 | Referenciado por `index.html` |
| `experiences/wet-paint-flow/ASSET_PROVENANCE.md` | 7915 | Procedencia/dominio público de las escenas (verbatim) |
| `experiences/wet-paint-flow/LICENSE` | 1079 | Licencia MIT de Wet Paint Flow (verbatim, wet-paint-flow@0b9ba9a) |
| `experiences/wet-paint-flow/PRESERVATION.md` | 3437 | Procedencia del build congelado de Wet Paint Flow |
| `experiences/wet-paint-flow/THIRD_PARTY_NOTICES.md` | 2204 | Avisos MIT de terceros de Wet Paint Flow (verbatim) |
| `experiences/wet-paint-flow/assets/GLTFLoader-B3oaXjWN.js` | 44210 | Referenciado por `experiences/wet-paint-flow/assets/index-BTDr0O24.js` |
| `experiences/wet-paint-flow/assets/index-BTDr0O24.js` | 661164 | Referenciado por `experiences/wet-paint-flow/index.html` |
| `experiences/wet-paint-flow/assets/index-CzDU-wAD.css` | 22619 | Referenciado por `experiences/wet-paint-flow/index.html` |
| `experiences/wet-paint-flow/favicon.svg` | 393 | Referenciado por `experiences/wet-paint-flow/index.html` |
| `experiences/wet-paint-flow/index.html` | 17757 | Referenciado por `experiences/wet-paint-adapter.js` |
| `experiences/wet-paint-flow/scenes/full/auvers-church.webp` | 207272 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/cypresses.webp` | 399992 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/olive-trees-blue-sky.webp` | 345432 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/olive-trees-yellow-sky.webp` | 477212 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/roses.webp` | 311212 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/seascape-saintes-maries.webp` | 516074 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/starry-night.webp` | 445202 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/sunflowers.webp` | 306452 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/vineyards-auvers.webp` | 347716 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/wheat-field-cypresses.webp` | 391532 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/full/yellow-house.webp` | 290778 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/manifest.json` | 3801 | Referenciado por `experiences/wet-paint-flow/assets/index-BTDr0O24.js` |
| `experiences/wet-paint-flow/scenes/thumb/auvers-church.webp` | 12502 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/cypresses.webp` | 15534 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/olive-trees-blue-sky.webp` | 14482 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/olive-trees-yellow-sky.webp` | 18992 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/roses.webp` | 9270 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/seascape-saintes-maries.webp` | 17282 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/starry-night.webp` | 15550 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/sunflowers.webp` | 11236 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/vineyards-auvers.webp` | 15184 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/wheat-field-cypresses.webp` | 12128 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-flow/scenes/thumb/yellow-house.webp` | 6764 | Referenciado por `experiences/wet-paint-flow/scenes/manifest.json` |
| `experiences/wet-paint-museum-skin.js` | 14473 | Referenciado por `experiences/wet-paint-adapter.js` |
| `experiences/wet-paint-store.js` | 1609 | Referenciado por `experiences/wet-paint-adapter.js` |
| `index.html` | 8418 | Punto de entrada de la visita |
| `qa/deterministic-states.js` | 12548 | Referenciado por `app/experience-app.js` |
| `render/media-loader.js` | 9907 | Referenciado por `app/experience-app.js` |
| `render/render-host.js` | 4714 | Referenciado por `app/experience-app.js` |
| `scene-kits/museum/builders.js` | 35924 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `scene-kits/museum/guide.js` | 15465 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `scene-kits/museum/model-assets.js` | 1999 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `scene-kits/museum/museum-scene-kit.js` | 100236 | Referenciado por `app/experience-app.js` |
| `scene-kits/museum/portal-surface.js` | 11539 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `scene-kits/museum/profiles.js` | 4514 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `scene-kits/museum/textures.js` | 25293 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `vendor/three/LICENSE` | 1081 | Licencia MIT de three.js (obligación de atribución) |
| `vendor/three/VENDOR.md` | 2951 | Registro de procedencia de three.js |
| `vendor/three/addons/environments/RoomEnvironment.js` | 4980 | Referenciado por `scene-kits/museum/museum-scene-kit.js` |
| `vendor/three/addons/loaders/GLTFLoader.js` | 114959 | Referenciado por `authoring/studio/avatar-phase5.js` |
| `vendor/three/addons/utils/BufferGeometryUtils.js` | 37621 | Referenciado por `vendor/three/addons/loaders/GLTFLoader.js` |
| `vendor/three/addons/utils/CameraUtils.js` | 3224 | Referenciado por `scene-kits/museum/portal-surface.js` |
| `vendor/three/addons/utils/SkeletonUtils.js` | 11535 | Referenciado por `vendor/three/addons/loaders/GLTFLoader.js` |
| `vendor/three/three.core.min.js` | 385386 | Referenciado por `vendor/three/three.module.min.js` |
| `vendor/three/three.module.min.js` | 365552 | Referenciado por `index.html` |
| `worlds/museum-v1.world.json` | 85206 | Referenciado por `app/experience-app.js` |
