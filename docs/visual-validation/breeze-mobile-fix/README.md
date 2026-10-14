# Breeze: validación visual de la primera visita

Dos series en esta carpeta:

- **`r2-*` (revisión del 2026-10-13).** Código probado: `641515e`. La aplicación es la de `d23ffca` más `0135deb`, que hace que el velo de entrada deje pasar los toques y no cambia nada visible en las capturas. `0e06e95`, `5a4c91a` y `641515e` solo cambian pruebas. Después, `92b8908` cambia solo el aviso de Breeze sin WebGPU (capturas `r2-notice-*`), que ninguna otra captura muestra, y `7b4d311` solo una prueba de la tienda. Chromium 141 empaquetado con WebGL sobre SwiftShader; WebGPU sobre SwiftShader (`--enable-unsafe-webgpu`) solo en las pasadas `r2-visit-*`; móvil emulado (tamaño, `isMobile`, `hasTouch`). Cada `manifest-r2-*.json` identifica sala, modo, viewport, navegador, renderizador, ruta, commit y resultado de cada captura.
- **Serie anterior (`d655e2c`)**, con GPU real; se conserva tal cual (más abajo).

## Serie r2

Tres tipos de pasada, todas desde una sesión limpia:

- **Llegadas** (`r2-<modo>-<viewport>-*`): `node tests/breeze-first-visit.mjs --arrivals --capture --set=r2 [--mobile] [--landscape] [--avatar]`, la misma pasada que ejecuta `npm test`. Primera llegada a la Galería B, aproximación a la puerta, segunda llegada tras B→A→B y segunda aproximación, sin entrar en Breeze.
- **Visita** (`r2-visit-<modo>-<viewport>-*`): `--webgpu --capture --set=r2-visit [...]`, con el invitado real de Breeze. Primera llegada, aproximación y Breeze sin panel en la primera y en la segunda entrada; en el Studio, el panel visible y editable. Una pasada más sin capturas, `--webgpu --reload`, comprueba la entrada después de recargar.
- **Antes de la corrección**: `r2-baseline-desktop-gallery-b-first.png`, la primera llegada servida desde `af30d50` con este mismo test (`BREEZE_TEST_BASE`). La pasada falla, como debe («nested shell covered the first-visit opening»), y el test solo escribe manifiestos de pasadas correctas, así que esta captura no tiene. Su registro mide la carcasa de Breeze visible y los tres rayos hacia el hueco bloqueados por `space.breeze` a 5,01, 9,49 y 6,73 m.

| Evidencia | Escritorio 1280 × 800 | Móvil vertical 390 × 844 | Móvil horizontal 844 × 390 |
|---|---|---|---|
| POV, llegadas | `r2-pov-desktop-*.png` | `r2-pov-mobile-portrait-*.png` | `r2-pov-mobile-landscape-*.png` |
| Avatar (`?character=1&mobility=1&continuity=1&gatea=1`), llegadas | `r2-avatar-desktop-*.png` | `r2-avatar-mobile-portrait-*.png` | — |
| POV, visita: Breeze sin panel | `r2-visit-pov-desktop-*.png` | `r2-visit-pov-mobile-portrait-*.png` | `r2-visit-pov-mobile-landscape-*.png` |
| Avatar, visita | `r2-visit-avatar-desktop-*.png` | `r2-visit-avatar-mobile-portrait-*.png` | — |
| Studio: panel visible y editable | `r2-visit-studio-desktop-breeze-panel-visible.png` | `r2-visit-studio-mobile-portrait-breeze-panel-visible.png` | — |
| Antes de la corrección (`af30d50`), primera llegada | `r2-baseline-desktop-gallery-b-first.png` | — | — |

**Puertas de todas las salas** (`r2-doors-<sala>.jpg`). Una hoja por sala: la vista desde el punto de llegada y cada puerta desde 4,5 m delante, mirándola. A la izquierda `5b40747` (cabeza de la PR #3) y a la derecha `641515e`. Mismo navegador y viewport que la serie, 1280 × 800, con cada vista reducida a la mitad. `manifest-r2-doors.json` lista commits, ruta, cámaras y vistas. Las hojas salen de un guion de diagnóstico de la revisión, no de una prueba automática; ninguna de las dos pasadas dio errores de consola.

**Aviso sin WebGPU** (`r2-notice-*.png`, `manifest-r2-notice.json`), capturado en `92b8908`. `no-adapter`: el navegador tiene WebGPU pero no obtiene tarjeta gráfica, como el Chrome con la GPU apagada que vio la revisión humana. `no-api`: el navegador no tiene WebGPU.

Lo que comprueba cada pasada antes de capturar (aserciones del test, no inspección visual):

- llegada, primera y segunda: Breeze `READY`, su carcasa oculta, ningún objeto de otra sala entre la llegada y el hueco (rayos desde tres puntos), una sola copia de cada sala, el marco, la luz del suelo y el resplandor de la puerta presentes, la placa de dirección, sin desbordamiento horizontal;
- aproximación: el aviso «Entrar en la sala Breeze» dentro del radio y de la pantalla, y la luz del umbral intensificada;
- Breeze: una sola activación por tecla o toque, iframe en modo `visitor`, `#breezeStudioPanel` y su botón de reapertura con `display: none`, `show()` sin efecto; salida por el puente con `lastError: null` y, con avatar, el avatar visible al volver;
- Studio: panel visible y editable, «Empezar experiencia» → visita sin panel y vuelta al Studio con panel; en escritorio, además, «Guardar en Museum» (`SAVED`) y, tras recargar, la personalización restaurada en el Studio y para el visitante (sin panel).

### Límites de esta serie

- **Reinicio del proceso GPU.** En las pasadas de visita, Chromium reinicia su proceso GPU durante cada visita a Breeze. El invitado pierde su dispositivo WebGPU («A valid external Instance reference no longer exists», también en `5b40747`) y el contexto WebGL del museo se pierde y vuelve un segundo después sin el contenido que guardaba la GPU: los lienzos de los rótulos y de las texturas generadas. En una primera pasada, la captura de la segunda llegada cayó en ese segundo: lienzo en blanco; poco después, la sala salía oscurecida y sin rótulos. No es lo que ve un visitante. Desde `5a4c91a`, cada captura del museo comprueba que su contexto no se ha perdido; si se perdió, no se captura, el manifiesto la registra como `not captured` y las aserciones de esa etapa se ejecutan igual. Por eso las pasadas de visita no tienen segunda llegada ni segunda aproximación: están en las de llegadas, que no entran en Breeze. Con una pérdida de contexto WebGL forzada (`WEBGL_lose_context`, sin WebGPU), el museo se recupera completo, igual en `5b40747` que con esta corrección.
- **Escenario de Breeze.** Con WebGPU sobre SwiftShader el escenario no llega a dibujarse (también en `5b40747`): las capturas de Breeze muestran el negro con el puente de salida y sin panel. Prueban la ausencia del panel y el estado del invitado, no el aspecto de la instalación.
- La franja «info» de abajo a la izquierda, dentro de Breeze, es el panel de créditos del Breeze original: descripción, código fuente y atribución del modelo de Venus, de los HDRi y de la textura del tejido. No tiene controles y sigue visible en la visita.
- El borde claro de 2 px alrededor del lienzo en escritorio es el indicador de foco de teclado del museo (`#iw-canvas:focus-visible`), anterior a esta revisión; en pantallas táctiles no aparece.
- Nada de esta serie equivale a un teléfono físico ni certifica fluidez.

## Serie anterior (`d655e2c`)

Código probado: `d655e2c11ac37bdbefc203c0393b9607bcdca56c`. Cada `manifest-*.json` identifica sala, modo, viewport, navegador, renderizador, ruta y resultado de sus capturas. El commit final de publicación añade únicamente estas evidencias al código probado.

| Evidencia | Escritorio 1280 × 800 | Móvil vertical 390 × 844 | Móvil horizontal 844 × 390 |
|---|---|---|---|
| POV: primera llegada, aproximación, Breeze sin panel, segunda visita | `pov-desktop-*.png` | `pov-mobile-portrait-*.png` | `pov-mobile-landscape-*.png` |
| Avatar: mismas etapas | `avatar-desktop-*.png` | `avatar-mobile-portrait-*.png` | — |
| Studio: Breeze con panel editable | `studio-desktop-breeze-panel-visible.png` | `studio-mobile-portrait-breeze-panel-visible.png` | — |

`baseline-desktop-gallery-b-first.png` muestra la misma primera llegada sobre `af30d509` antes de corregirla: la carcasa adyacente de Breeze tapaba el hueco. La prueba de regresión falló allí con `breezeShellVisible: true`; pasó en `d655e2c` con un único portal y hotspot, Breeze `READY` y la carcasa oculta.

Las pasadas con `--chrome` usaron Chrome/Chromium en Windows con WebGL sobre ANGLE/Direct3D11 y NVIDIA GeForce RTX 5070 Ti, según `WEBGL_debug_renderer_info`; en vista móvil se emularon tamaño y touch, pero se usó la misma GPU del equipo. El test base con Chromium empaquetado usó SwiftShader. Ninguna de estas capturas equivale a una prueba en iPhone o Android físicos. La captura de aproximación en vertical es muy oscura porque el hueco ocupa todo el campo visual a menos de 2,3 m; las vistas de llegada y la captura horizontal muestran el marco y la señal, y el prompt cercano indica literalmente la acción.
