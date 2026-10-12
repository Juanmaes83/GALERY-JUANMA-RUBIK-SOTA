# Breeze: validación visual de la primera visita

Código probado: `d655e2c11ac37bdbefc203c0393b9607bcdca56c`. Cada `manifest-*.json` identifica sala, modo, viewport, navegador, renderizador, ruta y resultado de sus capturas. El commit final de publicación añade únicamente estas evidencias al código probado.

| Evidencia | Escritorio 1280 × 800 | Móvil vertical 390 × 844 | Móvil horizontal 844 × 390 |
|---|---|---|---|
| POV: primera llegada, aproximación, Breeze sin panel, segunda visita | `pov-desktop-*.png` | `pov-mobile-portrait-*.png` | `pov-mobile-landscape-*.png` |
| Avatar: mismas etapas | `avatar-desktop-*.png` | `avatar-mobile-portrait-*.png` | — |
| Studio: Breeze con panel editable | `studio-desktop-breeze-panel-visible.png` | `studio-mobile-portrait-breeze-panel-visible.png` | — |

`baseline-desktop-gallery-b-first.png` muestra la misma primera llegada sobre `af30d509` antes de corregirla: la carcasa adyacente de Breeze tapaba el hueco. La prueba de regresión falló allí con `breezeShellVisible: true`; pasó en `d655e2c` con un único portal y hotspot, Breeze `READY` y la carcasa oculta.

Las pasadas con `--chrome` usaron Chrome/Chromium en Windows con WebGL sobre ANGLE/Direct3D11 y NVIDIA GeForce RTX 5070 Ti, según `WEBGL_debug_renderer_info`; en vista móvil se emularon tamaño y touch, pero se usó la misma GPU del equipo. El test base con Chromium empaquetado usó SwiftShader. Ninguna de estas capturas equivale a una prueba en iPhone o Android físicos. La captura de aproximación en vertical es muy oscura porque el hueco ocupa todo el campo visual a menos de 2,3 m; las vistas de llegada y la captura horizontal muestran el marco y la señal, y el prompt cercano indica literalmente la acción.
