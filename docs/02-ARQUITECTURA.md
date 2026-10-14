# 02 · Arquitectura

## Visión en capas

```text
index.html  (importmap: three → vendor/three)
   │
   ├─ app/experience-app.js        raíz de composición de la página: boot(), HUD, entrada,
   │                               audio, salas anidadas, montaje del Studio (?authoring=1)
   │
   ├─ engine/                      MOTOR SEMÁNTICO: sin Three.js ni DOM
   │    core/        runtime (raíz del motor), reloj, bus de eventos, RNG determinista, tiers
   │    schema/      tipos y validador (las invariantes aplicadas al World)
   │    world/       WorldStore (registro canónico), WorldGraph, WorldState, ciclo de vida
   │    camera/      autoridad de cámara + controladores explore · focus · directed ·
   │                 crossing · author · third-person-explore
   │    interaction/ proximidad y despacho de Actions
   │    experience/  Experience Director y manifiesto del recorrido
   │    scenekit/    el contrato motor ↔ representación
   │
   ├─ render/                      host de Three.js (renderer, cámara, carga de medios)
   ├─ scene-kits/museum/           ÚNICO lugar donde la semántica se convierte en museo
   ├─ worlds/museum-v1.world.json  datos: salas, obras, anclajes, portales y recorrido
   │
   ├─ authoring/                   configuración (Schema 3), MediaVault y Studio
   ├─ character/                   Character 2027 (capas activadas por URL)
   ├─ experiences/                 Wet Paint: puente y app anidada congelada
   └─ app/nested/                  host de salas anidadas (Breeze)
```

## Invariantes (Constitución IW-0, §5)

Se pueden ejecutar en el navegador con `await window.__IW.assertInvariants()`, y las prueba `npm test`.

| # | Invariante | Dónde se cumple |
|---|---|---|
| 5.1 | Los datos semánticos no son la representación visual | `engine/` no importa Three.js; `scene-kits/museum/` es la única traducción a geometría |
| 5.2 | Un objeto semántico tiene un único registro canónico | `engine/world/world-store.js` (`INV-CANONICAL`) |
| 5.3 | El mundo existe con independencia de la cámara | `engine/world/world-state.js` no contiene poses (`INV-WORLD-NOT-CAMERA`) |
| 5.4 | Explorar y Guiado comparten el mismo World State | `engine/experience/experience-director.js` |
| 5.5 | El Hotspot dispara; el Portal conecta | `engine/schema/validate.js` (`INV-HOTSPOT-NOT-PORTAL`) |
| 5.6 | El comportamiento de transición de un portal no es su representación | `transitionBehaviour` frente a `representationHint` en el World |
| 5.7 | Una Action es semántica, no un callback arbitrario | `engine/interaction/action-dispatch.js` (`INV-SHARED-ACTIONS`) |
| 5.8 | El Anchor es una referencia espacial genérica | `anchors[]` del World |
| 5.9 | Exactamente un controlador de cámara con autoridad por frame | `engine/camera/camera-authority.js`, con token de escritura (`INV-ONE-CAMERA-WRITER`) |
| 5.10 | Editor y Experiencia son responsabilidades separadas | El Studio edita configuración; el runtime se reconstruye desde ella |

## Orden de actualización por frame

```text
reloj → experiencia → cuerpo del visitante → autoridad de cámara → proximidad → scene kit → render
```

1. La experiencia decide qué debe ocurrir.
2. El cuerpo del visitante se mueve (`runtime.preCamera`: el avatar, cuando lo hay). Antes de este paso la cámara encuadraba la posición del fotograma anterior.
3. La autoridad de cámara resuelve quién la controla y la escribe **una vez**.
4. La proximidad observa dónde está el visitante: el cuerpo que declara `runtime.proximitySource` (el avatar) o, si no hay ninguno, la cámara en primera persona. Una sola fuente por fotograma.
5. El Scene Kit reacciona a la semántica.
6. El host renderiza.

El estado de cada frame **no** viaja por el bus de eventos (Constitución §8). El bus es para cambios semánticos: `WORLD_READY`, `SPACE_*`, `ENTITY_FOCUSED`, `HOTSPOT_*`, `PORTAL_*`, `ROUTE_*`, `EXPERIENCE_*`, `SHOT_*`, `CAMERA_AUTHORITY_CHANGED`, `AUDIO_CUE`, `NARRATION_CUE`, `QUALITY_TIER_CHANGED`, `ASSET_READY` y `ASSET_ERROR`.

## Ciclo de vida de las salas

```text
UNLOADED → PRELOADING → WARMING → READY → ACTIVE → COOLING → DISPOSED
```

- **WARMING es un estado real.** Una sala no se muestra hasta que sus materiales están compilados, para no tener tirones de shaders al entrar.
- **Conjunto de trabajo acotado:** la sala activa, sus vecinas en el grafo y la que se acaba de dejar. Lo demás se libera.
- Por eso **el mesh vivo nunca es la fuente de verdad**. Cualquier cambio (por ejemplo, un medio subido desde el Studio) se escribe en el registro canónico del `WorldStore`, y el Scene Kit reconstruye la sala desde él cuando vuelve a entrar.

## Cámara

`CameraAuthority` entrega un token de escritura a un único controlador por frame. Una escritura con token ajeno, caducado o duplicado se registra como violación, y `npm test` exige cero violaciones. Controladores disponibles:

| Controlador | Cuándo |
|---|---|
| `explore` | Visita libre en primera persona (WASD y ratón) |
| `focus` | Detalle de una obra; al salir, vuelve exactamente a la pose de origen |
| `directed` | Recorrido comentado (planos del Experience Director) |
| `crossing` | Cruce de portal entre salas |
| `author` | Cámara de autoría |
| `third-person-explore` | Avatar en tercera persona (Character 2027) |

## Salas anidadas («Option E»)

Una sala puede estar implementada por un runtime que el museo no posee. Breeze necesita WebGPU para la simulación de tela; el museo usa WebGL. Regla única:

```text
SOLO UNA PRESENTACIÓN DE SALA ES AUTORITATIVA EN CADA INSTANTE.
EL MUSEO DECIDE LA CÁMARA. EL INVITADO LA RENDERIZA.
```

- `app/nested/nested-room-host.js`: intercambia la presentación (el museo deja de dibujar y el invitado presenta), gestiona el canvas e iframe del invitado, su bucle y su destrucción.
- `app/nested/nested-room-controller.js`: escucha `SPACE_ENTERED`. Si la sala declara `metadata.nestedRuntime`, activa el invitado registrado y añade un botón-puente de salida que cruza el portal canónico del WorldGraph.
- El recorrido, el Director, la guía y el HUD **no** pasan al invitado.

## Medios

```text
MediaVault (asset READY) → MediaLoader compartido → superficie viva
      → actualización canónica de entity.content.media en el WorldStore
      → la sala puede liberarse → MuseumSceneKit la reconstruye desde el WorldStore
```

- Las rutas de medios del World son relativas al propio archivo del World.
- Si un archivo falla, la sala no se rompe: aparece la lámina generada y se emite `ASSET_ERROR`.
- El validador **rechaza un medio sin `rights`**.

## Modelos 3D (GLB)

`scene-kits/museum/model-assets.js` mantiene la ruta binaria y los metadatos **fuera** del World semántico. Descarga cada binario una vez y crea una escena nueva en cada construcción de sala. Si la carga falla, la peana, el collider, la cartela, la luz, la proximidad y la interacción siguen activos, y una silueta neutra sustituye al modelo. `window.__IW.report().models` distingue `GLB` de `FALLBACK`.

## Configuración y Studio

El World de `worlds/` es la base. El Studio produce una **configuración** (Schema 3) que `applyConfigToWorld()` aplica al World **antes** de construir nada. Aplicar cambios reinicia el runtime desde los datos: no hay mutación en caliente con segundo camino, porque dos caminos acaban divergiendo. Detalle en [04-STUDIO](04-STUDIO.md).

## Audioguía

`app/audioguide/audioguide-model.js` (datos, sin DOM) define el modelo y fusiona los textos base del World con lo editado en el Studio dentro de `applyConfigToWorld()`, que escribe `world.metadata.audioguide`. `app/audioguide/audioguide-ui.js` es el panel y el único reproductor del visitante, instalado y retirado en cada arranque. Al sonar, baja el ambiente (`AudioDirector.duck`) y calla la narración sintética. Detalle en [11-AUDIOGUIA](11-AUDIOGUIA.md).

## Deuda técnica conocida

- **Parches de prototipo.** Ocho módulos sobrescriben métodos de `StudioShell.prototype`: `visitor-phase1`, `museum-phase2`, `museum-phase2-layout-fix`, `museum-phase2-hardening`, `avatar-phase5`, `breeze-persistence-adapter`, `wet-paint-studio-controls` y `experiences/wet-paint-adapter`. Tres de ellos parchean también `ExperienceHUD.prototype`. El orden de instalación en `index.html` importa. Antes de añadir funciones grandes conviene consolidar estas capas en extensiones declaradas del Studio (roadmap, fase T).
- **Código del Studio en la visita.** `index.html` importa de forma estática código del Studio aunque el visitante no lo use.
- **Servicio externo de QR.** El QR de «Recursos» usa un servicio externo (`api.qrserver.com`, en `authoring/studio/museum-phase2.js`). Para publicar hay que codificar en local, porque el servicio recibe la URL del recurso.
