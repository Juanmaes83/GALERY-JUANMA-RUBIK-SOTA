# Museum — piloto GLB `Marble Bust 01`

Fecha: 2026-09-02  
Rama: `codex/museum-glb-marble-bust-v1`  
Base canónica: `claude/museum-itinerant-living-art-graft-v1` (`eb207827c542aeec4831055278f808ebb06dfbd8`)

## Decisión

La segunda fase visual incorpora un único GLB real, local y gobernado en la Galería A. No sustituye `Vasija de arenas`: esa entidad describe una vasija y asignarle un busto habría falseado el contrato semántico del World. Se registra por tanto una obra invitada independiente, `entity.sculpture.marble-bust-study`, que reutiliza sin duplicarlos los caminos existentes de proximidad, `FOCUS_ENTITY`, inspección, ficha y guardado.

La elección procede de la documentación del proyecto de referencia Rubik Sota. `docs/14-RUBIK-SOTA-ASSET-LIBRARY-MASTER.md` identifica `Marble Bust 01` como `RS-GLB-03`, una pieza aprobada para lectura escultórica, silueta y material. El repositorio de referencia no contiene el binario: la fuente oficial es Poly Haven.

## Fuente y trazabilidad

- Activo: `Marble Bust 01`
- Autor: Rico Cilliers
- Fuente: <https://polyhaven.com/a/marble_bust_01>
- Licencia: CC0 1.0
- Archivo en runtime: `assets/models/sculpture/marble_bust_01_1k.glb`
- Registro verificable: `assets/models/sculpture/marble_bust_01_1k.provenance.json`
- SHA-256 del GLB: `846a99ead6340cffbbe2492328ff030d9a53bd2201385195d6ebd21ab63263a5`

Los cinco archivos fuente 1K se descargaron desde la API oficial de Poly Haven y se verificaron contra sus MD5 publicados. `glTF-Transform 4.5.0` realizó solamente el empaquetado a GLB autocontenido; no redujo ni reinterpretó la geometría.

## Presupuesto y comportamiento

- 897.296 bytes
- 17.456 triángulos
- 9.746 vértices
- 1 material PBR
- 3 texturas JPEG 1K embebidas
- 0 animaciones
- 0 extensiones requeridas

`MuseumModelAssets` mantiene la ruta binaria y los metadatos fuera del World semántico. Descarga el binario local una sola vez y crea una escena nueva en cada construcción del Space; así, la eliminación de una sala por el ciclo `HOT/WARM/COOL` no invalida una escena parseada que pudiera reutilizarse después.

Si falla la carga, la peana, el collider, la placa, la luz, la proximidad y la interacción permanecen activos, y una silueta neutral authorada reemplaza al archivo. El informe `window.__IW.report().models` distingue explícitamente `READY/GLB` de `FALLBACK`; no disfraza el respaldo como el activo original.

## Instalación museográfica

- Peana cilíndrica de la familia visual P02, con base de grafito y remate mineral.
- Escala normalizada por bounding box a 0,92 m sobre una peana de 1 m.
- Material PBR original, luz local dirigida y relleno cálido de baja intensidad.
- Placa museográfica real con autoría, año y técnica.
- Señal de proximidad integrada en la peana.
- Encuadre determinista `museum:marble-bust-detail` para auditoría reproducible.
- Consulta `glbStone=fallback` para comprobar deliberadamente la degradación segura.

## Superficie modificada

- Registro/cargador de modelos: `scene-kits/museum/model-assets.js`
- Constructor visual y fallback: `scene-kits/museum/builders.js`
- Integración, ciclo de vida e informe: `scene-kits/museum/museum-scene-kit.js`
- Entidad, ancla y hotspot: `worlds/museum-v1.world.json`
- Estado determinista: `qa/deterministic-states.js`
- Selector de QA e informe público: `app/experience-app.js`
- Resolución de `three` para shells alternativos: `breeze-integration-studio.html` y `wet-paint-studio.html`

No se modifican Breeze, WePaint, Avatar, navegación POV/Avatar ni sus controles.

## Validación

- `git diff --check`: correcto.
- Sintaxis Node de los cinco módulos JS afectados: correcta.
- JSON del World y de procedencia: válido.
- Auditoría Playwright local en el estado determinista: GLB local `READY`, entidad `GLB`, foco correcto y World válido.
- La primera captura detectó el busto de espaldas; se eliminó la rotación incorrecta y una segunda captura confirmó la vista frontal.
- Prueba explícita `glbStone=fallback`: entidad `FALLBACK`, peana, placa, foco e inspección conservados.
- El primer CI de Breeze reveló que sus shells alternativos no tenían el `importmap` de `three` del shell principal. La importación de `GLTFLoader` fallaba antes de crear `window.__IW`; ambos shells comparten ahora el mismo mapa local. El gate de Breeze vuelve a arrancar en 1,6 s y sin errores de consola en la reproducción local.
- La suite integral detectó además una aserción antigua que equiparaba número de beats de contemplación con número de paradas. La exposición itinerante ya puede tener más de una contemplación dentro de una parada; el gate cuenta ahora paradas únicas y sigue exigiendo visitante presente y guía ausente en todos sus beats C.
- Suite completa `labs/immersive-worlds/qa/run-qa.mjs`: pendiente de cierre en el momento de redactar este registro.

## Veredicto pendiente

La integración queda como candidata y no debe fusionarse en la rama canónica hasta recibir validación visual humana `KEEP` o `ADJUST` con el paso exacto que falle.
