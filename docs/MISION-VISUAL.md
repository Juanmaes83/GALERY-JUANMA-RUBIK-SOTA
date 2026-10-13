# Misión visual: presentación de las siete salas

**Rama:** `mision-visual-presentacion` · **Base:** `4f0c01c` (Misión 5, tienda del museo) · **Estado:** candidata local, sin fusionar ni desplegar a producción · **Actualizado:** 2026-10-04 · **Declaración:** **bloqueada** (ver §11).

**Alcance:** seis salas (Vestíbulo, Galería A, Galería B, Archivo, Wet Paint y Tienda). **La Sala Breeze queda excluida** de esta misión: no se ha modificado su bundle ni su comportamiento.

Este documento sustituye a `MISION-VISUAL-IMPLEMENTACION.md` y `MISION-VISUAL-AMPLIADA.md`, que se han retirado porque contenían afirmaciones falsas (ver §1). Se conservan en el historial de git.

## 1. Auditoría de la candidata anterior

La primera candidata (commits `b83562e`…`7f28812`) no cumplía la misión y, además, tenía defectos:

| Pieza | Qué afirmaba | Qué hacía realmente |
|---|---|---|
| `buildPlinthStoneDetail` (peana con zócalo de 7 y luego 12 cm) | "El cambio más notable" | **Código muerto.** Ninguna entidad del World usa la rama genérica de peanas: las esculturas usan `plinth-vessel-premium-v1` y `plinth-glb-marble-bust-v1`, con constructor propio. No se veía en ninguna sala. |
| `buildFramedWorkFineArt` | Marcos de 9 cm en capas | **Alteraba la presentación de las obras:** ignoraba `mount: unframed` y `paper` (enmarcaba un lienzo sin marco y quitaba el passe-partout a las obras sobre papel) y ponía marcos de 6,5 cm a los productos planos de las vitrinas de la tienda. |
| `createFocusLight` | Iluminación jerárquica | Leía `profile.key` (no existe), interpretaba `anchor.position` `[x, y, z]` como `[x, z]`, colocaba coordenadas de mundo dentro de un grupo ya orientado y activaba sombras de luz puntual en cada obra fuera del presupuesto de sombras del sistema de calidad. El museo ya tenía un foco por obra (`_buildSpot`). |
| `roughnessMap` / `normalMap` / `hdriBumpMap` | Texturas PBR, HDRI | Mapas de ruido de 512 px sin efecto apreciable; `hdriBumpMap` y `wallTexture` no se usaban. Además, el "respaldo en calidad baja" no existía: el umbral `textureScale >= 0.5` se cumple también en LOW. |
| `docs/visual-validation/museo-overview.png` | Captura de validación | Era la pantalla de bienvenida; no mostraba ninguna sala. |

Todo ese código se ha retirado (commit `bebe985`). Las mejoras actuales se implementaron desde la base `4f0c01c`.

## 1 bis. Verificación de base y referencia

- **Base vigente:** `git ls-remote` muestra `main` = `b16bfd2` (commit inicial vacío), `claude/extract-museo-grande-repo-cs0gwm` = `70dd65d` y `mision5/tienda-del-museo` = `4f0c01c`. Las dos primeras están contenidas en `4f0c01c` (0 commits propios cada una), así que `4f0c01c` es la versión más avanzada de las siete salas y la base correcta.
- **Commits anteriores** `b83562e` y `3e7206c`: existen en la historia de esta rama. Se auditaron en el código (§1).
- **`0d2a91c` → `af39ce0`:** entre ambos solo hay documentación, capturas y ROADMAP (`f65ec17`, `af39ce0`); **ningún cambio de código**. `af39ce0` añade el registro de la suite sobre `0d2a91c` y el estado por elemento. Las pruebas de `bebe985` y `0d2a91c` corresponden a la candidata anterior a la optimización (§7) y no se atribuyen a la versión actual.
- **Proyecto de museo de una sala (referencia):** **no verificable**. Esta sesión solo tiene acceso a este repositorio, y la API de GitHub devuelve 403 para `Juanmaes83/escaparates-pro` y para cualquier otro. No se ha reutilizado ni copiado nada de él. Las técnicas de la tabla siguiente vienen del enunciado de la misión (PBR con mapas separados, HDRI/IBL, reflejos controlados, luces por obra, sombras de contacto), no de una inspección del proyecto.

### Matriz de trabajo

Clave: **O** = observado (código o captura), **I** = inferencia por comprobar, **D** = descartado.

| Sala o sistema | Problema observado | Técnica propuesta | Resultado visual esperado | Coste/riesgo de rendimiento | Cómo se validará |
|---|---|---|---|---|---|
| Suelos, todas | **O:** color plano con un mapa de grano de 512 px como rugosidad/relieve; en captura se lee como "blockout" | Acabado por sala dibujado con canvas 2D: color + relieve (rugosidad y relieve), a escala física | Material reconocible desde la puerta | 2 texturas por sala; ≈ 100–300 ms de dibujo (§7) | Capturas antes/después; `perf-probe` |
| Luz, galerías blancas | **O:** el IBL ilumina pared y obra por igual; focos imperceptibles (medido: bajar el entorno ×0,5 bajaba pared y obra en la misma proporción) | Respuesta al entorno ×0,5 en arquitectura, completa en obras; focos ×1,9 | Obras como lo más luminoso; bañados de foco visibles | Ninguna luz nueva ni sombra nueva | Capturas; muestras de luminancia por región |
| Juntas y apoyo | **O:** banco y peanas "flotan"; esquinas sin sombra | Oclusión y sombras de contacto como decal | Objetos asentados, volumen legible | +4 llamadas por sala (fusionado), transparencias pequeñas | Capturas; llamadas de dibujo |
| Marcos | **O:** sección de caja plana de 45 mm | Perfil escalonado con filete, misma huella | Dos líneas de sombra y canto iluminado | 2 mallas por marco (antes 4) | Capturas de exposición; `WORK-OUTLINE` |
| Cartelas | **O:** lámina sin grosor | Bloque de 5 mm, misma posición de la cara | Canto visible | Igual número de llamadas | Capturas |
| Vestíbulo | **O:** caja blanca sin base | Zócalo de piedra (misma caliza del suelo) | Carácter de entrada institucional | ~1 llamada por material (fusionado) | Capturas; puerta y panel despejados |
| Archivo | **O:** sala verde lisa, techo plano | Zócalo de plafones, vigas, parqué | Carácter de sala de archivo | Fusionado por material | Capturas |
| Galería B | **O:** techo negro sin plano legible | Retícula de servicio | Techo con borde y escala sin añadir luz | 2 llamadas | Capturas (la sala debe seguir oscura) |
| Peanas genéricas | **O:** ninguna entidad usa la rama genérica | — | — | — | **D:** sin efecto visible; descartado |
| HDRI real | **I:** mejoraría reflejos de metal y vidrio | — | Poco visible con materiales rugosos | Descarga y memoria | **D:** sin fuente local con licencia verificada y beneficio dudoso a distancia de visita |
| Luces puntuales por obra con sombra | **O:** ya existía `_buildSpot` con presupuesto de sombras | — | — | Sombras cúbicas caras | **D:** se refuerzan los focos existentes |
| Sala Breeze | **O:** la dibuja un bundle MIT de terceros importado como copia exacta | — | — | — | **D:** fuera de alcance (§3) |

## 2. Qué cambia: capas y técnicas (versión actual)

| Técnica | Estado | Cómo |
|---|---|---|
| Suelos con acabado propio | **Implementada (procedural)** | `floor-canvas.js` + `surfaces.js`: cada acabado (caliza, roble, roble ahumado, hormigón, terrazo, parqué) se dibuja con canvas 2D en dos lienzos — color (sRGB) y relieve en gris, que hace de `roughnessMap` y `bumpMap`, el mismo par que usaba el suelo original más el mapa de color. ≈ 213 px/m en HIGH (la mitad en LOW), texturas de 256–1024 px, anisotropía 1. No son materiales escaneados. |
| Jerarquía de luz | **Implementada** | `profiles.js → profileForSpace`: en Galería A y Wet Paint la arquitectura recibe la mitad de la respuesta al entorno, menos relleno y focos ×1,9; las obras (`userData.exhibit`) conservan la respuesta completa. Ajuste más suave en Vestíbulo y Tienda. Ninguna luz nueva. |
| HDRI / IBL | **No implementado** | Sigue el `RoomEnvironment` procedural. |
| Sombras de contacto | **Decal** | `buildContactShadow`, bajo bancos, peanas, vitrinas, mostrador y dependienta. |
| Oclusión en juntas | **Decal** | `buildJunctionOcclusion`: suelo–pared (0,45 m), pared–techo y esquinas desde el zócalo. No es SSAO. |
| Zócalos | **Implementados** | Vestíbulo: caliza (0,9 m) en una capa Lambert que comparte el relieve del suelo. Archivo: plafones horneados en un mapa de módulo (128 px) + moldura real (1,0 m). La pared **no se dibuja** detrás del zócalo (`buildRoomShell` `dado`). En todos los tiers. |
| Marcos y cartelas | **Implementados** | Perfil escalonado con filete en la misma huella de 45 mm (2 mallas); cartela de 5 mm que recibe sombra y no la proyecta. |
| Relieve arquitectónico | **Implementado** | Vigas (Archivo), retícula de servicio (Galería B). Fusionado por material. |
| Compilación sin dibujar la sala | **Corrección (it. 5)** | `warmSpace` vuelve a ocultar la sala justo después del recorrido síncrono de `compileAsync`. Antes, la sala que se estaba compilando se dibujaba —con sus focos proyectando sombras— durante segundos. Era un defecto previo que la misión agravaba al añadir programas de shader. |

## 3. Cambios por sala

| Sala | Perfil | Cambios |
|---|---|---|
| **Vestíbulo** | white-cube | Caliza en losas a matajuntas; zócalo de piedra de 0,9 m; oclusión en juntas; sombra de contacto del banco; entorno ×0,7. Panel de bienvenida y puerta despejados. |
| **Tienda** | white-cube | Terrazo con juntas; sombras de contacto bajo vitrinas, mostrador y dependienta; entorno ×0,8. Vitrinas, productos y huecos sin cambios. |
| **Galería A** | white-cube | Roble en tablas; jerarquía de luz; marcos perfilados; cartelas con grosor; contacto bajo peanas y banco. |
| **Archivo** | heritage | Parqué en cestería; zócalo de plafones de 1,0 m con moldura; vigas; oclusión. |
| **Galería B** | dark-exhibition | Roble ahumado mate; retícula bajo el techo; oclusión; marcos y cartelas. Moderado a propósito. |
| **Wet Paint** | white-cube | Hormigón sellado con juntas; jerarquía de luz; marcos perfilados. |
| **Sala Breeze** | anidada | **Excluida de la misión.** Sin cambios. |

Lo que no cambia: World, posiciones, identificadores, portales, hotspots, interacciones, rutas, avatar, Studio, tienda y contenidos.

## 4. Recursos y licencias

Ningún archivo de terceros nuevo ni descargas. Texturas generadas en el navegador a partir de la semilla de cada sala. `BufferGeometryUtils.mergeGeometries` es parte de three.js (MIT, ya vendorizado).

## 5. Iteraciones de optimización

Herramientas: `tools/perf-probe.mjs` (recorrido por portales, poses de las capturas, 8 fotogramas parado y 8 caminando por sala, `renderer.info`, heap, bytes, errores), `tools/perf-serie.sh` (serie alterna base/candidata, reanudable), `tools/perf-ab.sh` (comparación rápida de tres salas) y `tools/perf-summary.py` (medianas). Datos en `docs/visual-validation/rendimiento/serie/`.

| It. | Commit | Cambio | Resultado | Decisión |
|---|---|---|---|---|
| 0 | `0d2a91c` | Candidata anterior | Archivo +42 %, `ready` +8 % (HIGH) / +15 % (móvil) | No aceptable |
| 1 | `fea52d0` | Suelos en Web Worker; zócalo en una capa y pared no dibujada detrás | 5+5: Archivo a la par; `ready` −2,6 %; **cruces +12…+58 %** | No aceptable |
| 2 | `974baa2` | Subida anticipada, caché, anisotropía 2× | 2+2: `ready` +20 % | No aceptable |
| 3 | `af6db55` | Suelos con canvas 2D (≈ 8× más baratos de generar), sin worker | Archivo a la par; caminando +5…+8 % en Galería A y Wet Paint | No aceptable |
| 4 | — | 213 px/m, anisotropía 1, cartelas sin sombra, sin franja de pared | AB 3+3: caminando +6…+8 %, `ready` +5,1 % | Insuficiente |
| 5 | `66c514b` | Sala oculta durante su compilación | **Serie oficial 5+5 HIGH** (§6) | Arranque y cruces mejoran; tres salas siguen por encima |

Diagnósticos que descartan causas (misma sesión, alternando, Galería A):

- Quitar en toda la escena la oclusión, los zócalos, vigas y retícula: 0–3 % cada uno. Quitar el mapa de color del suelo: ≈ −2 %; su relieve: ≈ −4 %.
- Luces y sombras: **idénticas** en base y candidata en cada sala del recorrido (p. ej. Galería A: 37 luces, 4 con sombra). Ocultar las salas vecinas baja el fotograma un 43 % en ambas versiones: el coste dominante es preexistente (sus luces entran en el sombreado de cada píxel).
- Perfil de CPU: > 99 % del tiempo de fotograma es espera del rasterizador por software (`(program)`); el JavaScript por fotograma es despreciable en ambas versiones.
- Dos pasadas sueltas con el recorrido completo (`diagnostico-ruta/`, `diagnostico-perfil/`) dan la candidata **igual o más rápida** en esas salas, mientras que la serie de 5+5 la da más lenta. La causa de esa diferencia **no está identificada**.

## 6. Carga y rendimiento — serie oficial

**Equipo:** contenedor Linux de 2 núcleos y 8 GB, Chromium headless (Playwright 1.56.1). **Renderizador:** `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))` — **render por software**. Los tiempos solo comparan versiones en esta máquina; no son FPS de ninguna GPU ni móvil.

### Escritorio `?tier=HIGH`, código de `66c514b`, 5+5 pasadas alternas (medianas)

Arranque hasta `ready`: **56,3 s → 40,3 s (−28,5 %)**. Transferido 3,82 → 3,86 MB. Errores de página 0 → 0. Peticiones fallidas 0 → 0.

| Sala | Parado (ms) | Δ | Caminando (ms) | Δ | Cruce de puerta (ms) | Δ | Llamadas | Texturas vivas |
|---|---|---|---|---|---|---|---|---|
| Vestíbulo | 4819 → 4958 | +2,9 % | 5739 → 5752 | +0,2 % | 4913 → 2930 | −40 % | 416 → 433 | 72 → 63 |
| Tienda | 3108 → 3132 | +0,8 % | 2851 → 2980 | +4,5 % | 12 → 12 | 0 | 257 → 255 | 61 → 51 |
| Galería A | 3037 → 3306 | **+8,9 %** | 2560 → 2699 | **+5,4 %** | 25920 → 23432 | −10 % | 251 → 241 | 74 → 64 |
| Archivo | 842 → 863 | +2,5 % | 868 → 853 | −1,7 % | 7244 → 6705 | −7 % | 21 → 24 | 62 → 52 |
| Galería B | 4006 → 4285 | **+7,0 %** | 4720 → 4986 | **+5,6 %** | 18959 → 15894 | −16 % | 124 → 121 | 115 → 93 |
| Wet Paint | 1524 → 1637 | **+7,4 %** | 1533 → 1646 | **+7,4 %** | 9 → 11 | +2 ms | 105 → 104 | 104 → 81 |

En Galería A, Galería B y Wet Paint la candidata fue más lenta parada en las 5 parejas: **regresión repetible** en este entorno. Triángulos: Galería A 32 962 → 34 282.

Notas de método: la fila `floorsReadyMs` del resumen es un artefacto (desde la it. 3 los suelos se dibujan al construir la sala; la sonda espera a que el hilo principal le responda). Dos reinicios del contenedor cortaron series (19:21 y 22:45 del 2026-10-04); las pasadas guardadas son completas. Una réplica de la serie no llegó a ejecutarse por otro reinicio.

### Móvil emulado

**No medido sobre la versión actual.** La serie móvil se detuvo para no medir una candidata que ya no cumplía en escritorio; los datos móviles de §6 de la candidata anterior (`0d2a91c`) no se aplican a esta versión.

## 7. Pruebas de comportamiento

| Ejecución | Commit | Resultado | Registro |
|---|---|---|---|
| `npm run check` | `dc519a4` | **OK** (exit 0) | — |
| `npm test` | `53b5de8` (= árbol de `dc519a4`, salvo un enlace `node_modules` retirado) | **1 fallo · `EXIT 1`**: `SHOP-STUDIO` (`postales` sigue visible tras ocultarlo en el Studio y recargar). `AVATAR-PACE-LOW-FPS` **pasa** (0,46 m frente a 0,44 esperados, 105 %). Pruebas Node: proximidad, audioguía y persistencia, OK | `docs/visual-validation/npm-test-dc519a4.log` |
| `npm test` | base `4f0c01c` | **2 fallos · `EXIT 1`**: `SHOP-COLLIDE` (la candidata lo pasa) y `SHOP-STUDIO` con **el mismo detalle** que en la candidata. `AVATAR-PACE-LOW-FPS` pasa (105 %) | `docs/visual-validation/npm-test-base-4f0c01c.log` |
| `SHOP-STUDIO` aislado (2 pasadas por ejecución, alternando) | base y candidata | **Pasa en ambas** (base 4/4, candidata 4/4) | `docs/visual-validation/shop-studio-aislado.log` |

| `npm test` | `ec29066` (rama `mision-visual-limpia`, solo alcance visual) | **2 fallos · `EXIT 1`**: `SHOP-STUDIO` (mismo detalle que en la base) y **`MOBILE-DOOR-TAP`** (`{"tag":"BUTTON","text":"EEntrar en la Galería A"}`). `AVATAR-PACE-LOW-FPS` pasa (105 %) | `docs/visual-validation/npm-test-mision-visual-limpia-ec29066.log` |
| `MOBILE-DOOR-TAP` aislado (`tools/mobile-door-tap.mjs`, 2 × 2 intentos alternos) | base y misión | **Base 4/4 · misión 0/4** (también 0/2 sobre `f4fe47d`) | `docs/visual-validation/mobile-door-tap-aislado.log` |

**`MOBILE-DOOR-TAP` — regresión repetible en la prueba, causa identificada.** El toque en el aviso sí cruza la puerta (Vestíbulo → Galería A, una sola vez). Pero `locator.tap()` de Playwright no termina en sus 8 s porque, en móvil LOW con SwiftShader, los fotogramas de la misión son más lentos que los de la base; la prueba entonces repite el clic por DOM, el aviso ya es «Volver al vestíbulo» y el visitante vuelve atrás (registro: cruce a Galería A a los 8,5 s y vuelta inmediata). En la base el toque termina en ≈ 7,5 s y la prueba pasa. No es un doble disparo de la aplicación, pero sí indica fotogramas móviles más lentos que la base, que no se han medido en serie sobre la versión actual. La prueba no se ha modificado. **Bloquea la fusión hasta resolverlo o aceptarlo expresamente.**

**`SHOP-STUDIO`:** falla dentro de la suite completa en la base y en la candidata con el mismo síntoma, y pasa aislado en las dos. Es un defecto previo dependiente del orden o del tiempo de la suite, **no causado por esta misión**; no se ha tocado la prueba. **`AVATAR-PACE-LOW-FPS`:** pasa en ambas en esta ejecución; en la ejecución de `0d2a91c` falló por falta de fotogramas (SwiftShader). Se mantiene como sensible al entorno.

Ejecutadas en serie, nunca a la vez. La suite recorre navegación por las salas, puertas y señales de salida, POV y avatar (tercera persona, suavidad, ritmo con pocos FPS), móvil POV y encuadres, obras y fichas, Studio, tienda, Breeze sin WebGPU, Wet Paint y audioguía.

## 8. Validación visual

**Herramienta:** `tools/visual-capture.mjs`, mismas poses calculadas desde el World en base y candidata. «Antes»: `docs/visual-validation/before/` (base `4f0c01c`). «Después»: `docs/visual-validation/after-final/` (código de `dc519a4`, 2026-10-05). Hojas de contacto: `hoja-contacto-final-escritorio.png` y `hoja-contacto-final-movil.png` (con `.json` de luminancia por pareja). Escritorio 1280 × 800 `?tier=HIGH`; móvil 390 × 844 DPR 2 (el sistema elige LOW).

**Inspección (abiertas y revisadas una a una, no solo generadas):**

| Sala | ¿Se percibe a distancia de visita? | Observaciones |
|---|---|---|
| Vestíbulo | **Sí** | Losas de caliza y zócalo de piedra en vista general y de exposición; panel y puertas despejados. |
| Tienda | **Sí en la vista general** (terrazo) | El primer plano de vitrina no muestra suelo: casi idéntico. Mobiliario y productos en su sitio. |
| Galería A | **Sí, claramente** | Roble en tablas, bañados de foco, marcos perfilados, cartelas; busto y vasija en su sitio. |
| Archivo | **Sí, claramente** | Parqué, zócalo de plafones y vigas; la nota de cierre queda por encima del zócalo. |
| Galería B | **Moderado, a propósito** | Suelo y techo algo más legibles; la sala sigue oscura (luminancia media 36,8 → 34,3 en exposición). |
| Wet Paint | **Sí, claramente** | Hormigón con juntas, jerarquía de luz (165,7 → 136,1 en la general). |
| Breeze | **Excluida** | Sin WebGPU aquí muestra su aviso, igual en base y candidata. |

No se observan artefactos nuevos (z-fighting, franjas, texturas sin cargar). Obras, marcos, cartelas, accesos y mobiliario conservan posición y aspecto.

**Incidencias durante las capturas (no reproducidas al repetir):** en escritorio, una pasada completa se quedó parada en la pose de exposición de Wet Paint (se repitió esa sala sola sin problema); en móvil, una pasada completa terminó con «Execution context was destroyed» al cruzar del Archivo a la Galería A; la repetición completa terminó sin errores. La base completó su pasada móvil sin incidencias. Con 1 de 2 pasadas afectadas, **no se puede descartar** un problema intermitente; queda pendiente.

## 9. Estado por elemento

| Elemento | Estado |
|---|---|
| Mejora visible en las seis salas | **Validado en capturas SwiftShader** en Vestíbulo, Galería A, Archivo y Wet Paint; **parcialmente** en Tienda (solo vista general) y Galería B (moderada a propósito) |
| Arranque | **Validado en SwiftShader**: −28,5 % (5+5) |
| Cruces de puerta | **Validado en SwiftShader**: igual o más rápido salvo Wet Paint (+2 ms) |
| Fluidez parado/caminando | **No validado**: regresión repetible de +5…+9 % en Galería A, Galería B y Wet Paint (SwiftShader) |
| Móvil emulado | **Pendiente** (no medido sobre la versión actual) |
| Comportamiento (`npm test`, rama limpia `ec29066`) | **No validado**: `MOBILE-DOOR-TAP` falla de forma repetible (0/4 aislado; base 4/4) por fotogramas móviles más lentos; `SHOP-STUDIO` es previo. |
| Comportamiento (`npm test`, `dc519a4`) | **Parcialmente validado**: candidata 1 fallo (`SHOP-STUDIO`, previo: falla igual en la base y pasa aislado en ambas); base 2 fallos. Ver §7 |
| GPU real y móvil real | **No validado** |
| Preview | **No existe**: push rechazado (403) y Vercel sin los archivos (`missing_files`) |
| Sala Breeze | **Excluida**; sin cambios |

## 10. Pendiente y limitaciones

- Identificar la causa de la regresión de fotograma en Galería A, Galería B y Wet Paint, que las ablaciones en la propia sala no explican (§5). Hasta entonces, no se puede afirmar que la candidata no empeora la fluidez.
- Medir en GPU real y en un móvil real: todo lo de aquí es SwiftShader.
- Serie móvil sobre la versión actual.
- `SHOP-STUDIO`: defecto previo de la suite (falla en base y candidata, pasa aislado); investigar aparte.
- Incidencias intermitentes en las capturas (§8): repetir varias pasadas completas en base y candidata.
- No implementados: HDRI real, reflexión planar, sombras de contacto calculadas.


## 12. Rama limpia `mision-visual-limpia`: MOBILE-DOOR-TAP y móvil (2026-10-05)

**Causa.** En el tier LOW no hay precompilación de shaders (política del motor, para no arriesgar la pérdida del contexto WebGL en teléfonos), así que cada programa se compila en el primer fotograma del cruce, el que responde al toque. Registrando los shaders compilados durante el toque Vestíbulo → Galería A: base **10** programas; misión **15** (suelo con color + relieve, zócalo Lambert y decal, cada uno en dos configuraciones de luces). Fotogramas de ese momento: base ≈ 1,5 + 1,3 s; misión ≈ 2,1 + 3,9 + 1,7 s. Con eso, `locator.tap()` superaba los 8 s y la prueba repetía el clic por DOM, que ya llevaba de vuelta al Vestíbulo.

**Corrección (`176f7f7`).** La pared lleva un mapa de color blanco 1×1 (sin efecto visible) y comparte programa con el suelo; el zócalo de piedra pasa a MeshStandard con los mapas del suelo. Resultado: **10 programas en el cruce, igual que la base**; capturas del Vestíbulo y Galería A sin diferencia apreciable. No se ha cambiado la prueba ni el timeout.

**Pruebas tras la corrección:**

| Ejecución | Resultado | Registro |
|---|---|---|
| `npm test` en `176f7f7` | **2 fallos · `EXIT 1`**: `SHOP-COLLIDE` y `SHOP-STUDIO`, **los mismos dos y con el mismo detalle que en la base** (`npm-test-base-4f0c01c.log`). `MOBILE-DOOR-TAP` **pasa**. `AVATAR-PACE-LOW-FPS` pasa (105 %) | `docs/visual-validation/npm-test-mision-visual-limpia-176f7f7.log` |
| `MOBILE-DOOR-TAP` aislado, 4 + 4 alternos | **Base 0/4** (toque 8,1–8,4 s) · **misión 1/4** (7,3–8,9 s). En esta máquina la prueba aislada falla también en la base: depende del tiempo de SwiftShader y no puede darse por verde en ninguna de las dos. Mediana del toque: misión ≈ 0,5 s más lenta | `docs/visual-validation/mobile-door-tap-tras-correccion.log` |

**Móvil emulado (390 × 844, LOW), serie 5 + 5 alterna, `176f7f7` frente a `4f0c01c`** (`serie/movil-176f7f7`):

| | Base → misión | Δ |
|---|---|---|
| Arranque (`ready`) | 17,7 s → 19,4 s | **+9,5 %** |
| Vestíbulo parado / caminando | 935 → 922 / 1347 → 1294 ms | −1,4 % / −3,9 % |
| Tienda | 570 → 571 / 834 → 827 | 0 % / −1 % |
| Galería A | 728 → 768 / 490 → 517 | **+5,5 % / +5,4 %** |
| Archivo | 176 → 197 / 191 → 188 | **+12 %** / −2 % |
| Galería B | 969 → 1057 / 1109 → 1120 | **+9,1 %** / +1 % |
| Wet Paint | 337 → 325 / 332 → 346 | −3,4 % / +4,2 % |
| Cruce a Galería A | 3632 → 3800 ms | +4,6 % |

Errores de página 0 → 0; peticiones fallidas 0 → 0.

**Conclusión.** La corrección iguala el número de shaders del cruce, y la suite completa ya muestra solo los fallos de la base. Pero no se puede demostrar que la navegación móvil no empeora: el arranque sube un 9,5 % (límite 5 %) y Galería A, Galería B y Archivo son más lentas paradas. **La misión queda bloqueada**: no se publica la rama, no se abre la PR y no se fusiona. Todo medido con SwiftShader; sin pruebas en GPU ni teléfono físicos.

## 11. Declaración

**Bloqueada** (rama limpia `mision-visual-limpia`, §12). La mejora visual está implementada; el arranque y los cruces mejoran frente a la base; pero la serie oficial muestra una regresión repetible de fluidez en tres salas con render por software, y la suite tiene un fallo. No se declara terminada.

## 13. Corrección de acceso a Breeze y panel de visita (2026-10-12)

Las secciones anteriores conservan el diagnóstico histórico de la misión visual. Esta intervención parte de `af30d509` en la PR #3 y se limita al acceso a Breeze y a la separación entre Studio y visita.

### Reproducción y causa

En una sesión limpia se recorrió Vestíbulo → Galería A → Galería B. En la primera llegada, `portal.gallery-b-breeze` y `hotspot.gallery-b.to-breeze` existían una sola vez, la Galería B estaba `ACTIVE` y Breeze ya estaba `READY`. El hotspot estaba a 10,24 m del punto de llegada y ofrecía el prompt al acercarse dentro de su radio de 2,3 m. El problema visible era otro: la carcasa WebGL de la sala anidada se mostraba como sala adyacente y se solapaba un metro con el hueco de la Galería B, tapando la puerta y el rótulo. Tras volver a Galería A, Breeze quedaba `DISPOSED`; al regresar a Galería B su carcasa ya no tapaba el acceso, lo que explicaba la diferencia entre visitas.

La reconciliación del conjunto de salas solo precargaba estados `UNLOADED`. Tras una descarga, Breeze permanecía `DISPOSED` hasta el siguiente cruce. Ahora se vuelve a preparar también desde `DISPOSED`, sin añadir portales ni cambiar sus destinos.

### Corrección

- La carcasa WebGL de una sala con `nestedRuntime` permanece oculta cuando es adyacente. El invitado WebGPU solo presenta Breeze cuando la sala está activa.
- El acceso desde Galería B conserva el hueco real y recibe tres perfiles finos de tono latón y una pequeña señal direccional en la pared. No hay luz dinámica adicional, plano que bloquee la puerta ni cambio de colisión.
- El controlador anidado comunica al iframe el modo real del museo. En visitante, el panel `#breezeStudioPanel`, su pestaña para mostrarlo y su control de ocultación no se ven; `show()` no puede reabrirlo. En Studio, el panel y sus controles siguen disponibles. La misma regla se aplica a «Vista previa» del Studio y se revierte al volver a editar.
- La salida desde el iframe usa el portal canónico sin solicitar una animación de cruce que el invitado no puede mostrar. Esto evita que el controlador Avatar interprete una transición todavía en curso como fallo, manteniendo la salida y la reaparición del avatar.

### Verificación

`tests/breeze-first-visit.mjs` falla contra `af30d509` en la primera llegada (`breezeShellVisible: true`) y pasa con la corrección (`false`, una puerta, un hotspot, señal presente, prompt dentro del radio). Con Chrome 153 y adaptador WebGPU se probaron POV y Avatar en escritorio 1280 × 800 y móvil 390 × 844, además de POV móvil horizontal 844 × 390: primera entrada, salida, vuelta por Galería A, segunda entrada y salida. Cada activación de Breeze desde el prompt se contó una sola vez. En Studio se comprobó el panel visible, un control editable y la transición Studio → vista de visitante → Studio. No hubo desbordamiento horizontal ni respuestas HTTP fallidas de la aplicación en esas pasadas.

Las capturas y sus manifiestos están en `docs/visual-validation/breeze-mobile-fix/`. Chromium 141 con SwiftShader se usó para la regresión visual de la primera llegada; Chrome 153 permitió además inspeccionar el invitado WebGPU. Los logs registraron un 404 de `favicon.ico` ya existente y cancelaciones `ERR_ABORTED` de solicitudes del iframe al desmontarlo. Esas cancelaciones no son respuestas HTTP fallidas. Los screenshots del invitado muestran la instalación, pero no certifican su fluidez ni su estabilidad en un teléfono físico. Quedan pendientes Safari iOS, Chrome Android y mediciones en GPU móvil real. La PR #3 permanece sin fusionar.

Se repitió también el ciclo completo tras recargar en POV y Avatar de escritorio: la primera llegada posterior a la recarga mantuvo un portal y un hotspot, la escena anidada se abrió sin panel, la salida dejó `lastError: null` y el avatar reapareció. El test verifica que los avisos de proximidad y salida quedan dentro del viewport; en móvil emulado no apareció desbordamiento horizontal. La entrada encuadrada de cerca llena casi toda la anchura en vertical: la captura de llegada y la señal direccional muestran la ubicación desde lejos, mientras que el prompt confirma la acción al acercarse.

## 14. Revisión de la corrección Breeze: ciclo de vida, puertas y panel (2026-10-13)

Parte de `5b40747`, cabeza de la PR #3. La captura con el panel visible que motivó esta revisión venía de la preview `ihx4lr96o`, construida con `af30d50`, anterior a §13: en esa versión el panel sí se mostraba en la visita. `5b40747` ya corregía la oclusión y el modo del panel, pero su CI estaba en rojo (`BREEZE-EXIT`, `SHOP-STUDIO` y un cruce del avatar que no terminaba) y la revisión encontró dos defectos previos del ciclo de vida que afectan directamente al acceso a Breeze.

### Diagnóstico reproducido

Chromium 141 con SwiftShader, sesión limpia, Vestíbulo → Galería A → Galería B y vuelta B → A → B. Rayos lanzados contra el centro del hueco de Breeze (19,9; 1,3; −12).

| | `af30d50` 1.ª llegada | `af30d50` B→A→B | `5b40747` 1.ª llegada | `5b40747` B→A→B |
|---|---|---|---|---|
| Estado de Breeze | `READY` | `DISPOSED` | `READY` | `READY` |
| Carcasa de Breeze visible | sí | — | no | no |
| Rayo desde la cámara de llegada (9,7; 1,62; −10) | choca con `space.breeze` a 9,48 de 10,45 m | libre | libre | libre |
| Rayo desde el centro de la sala (14; 1,6; −12) | choca con `space.breeze` a 5,01 de 5,96 m | libre | libre | libre |
| Grupos `space:*` en la escena | uno por sala | uno por sala | uno por sala | **dos de Galería A y dos de Galería B** |

En todas las pasadas el portal y el hotspot de Breeze existían una sola vez y el aviso «Entrar en la sala Breeze» aparecía al acercarse. En la segunda llegada de `af30d50` no hubo ningún `space:preload-requested space.breeze`. Errores de consola: 0.

### Causas

1. **Primera visita frente a segunda** (§13, confirmado). La carcasa de la sala anidada (x 19…65) entra un metro en la Galería B (x 8…20), delante del hueco (x = 20). Precargada como sala adyacente, se dibujaba y tapaba la puerta y su rótulo; desde la Galería A se veía como un bloque negro al fondo. Al ir a la Galería A, Breeze se liberaba y la precarga solo aceptaba `UNLOADED`: en la segunda llegada no se reconstruía y la puerta aparecía.
2. **La sala recién dejada se construía otra vez** (previo a `af30d50`). `prepare()` solo daba por preparada una sala `READY` o `ACTIVE`; la anterior (`COOLING`) se volvía a construir al regresar y la primera copia se quedaba en la escena con sus medios y animaciones. En la prueba unitaria, un recorrido de ida y vuelta dejaba cuatro copias de la Galería B.
3. **Liberar una sala a medio preparar** (previo). Si el visitante salía de la Galería B mientras Breeze se calentaba, el calentamiento terminaba marcándola `READY` sin escena; al volver, entrar en Breeze lanzaba `TypeError: Cannot read properties of null (reading 'group')`. En un teléfono el calentamiento dura segundos: basta con no detenerse. Volver a precargar desde `DISPOSED` lo hacía más probable.
4. **CI en rojo.** Las tres fallas eran trabajo de más en el hilo principal, salvo `SHOP-STUDIO`:
   - `BREEZE-EXIT`: el clic real tardó más de 10 s en atenderse (en CI el cruce llegó 20 s después del clic). Al salir de Breeze se reconstruía la Galería B y se precargaban A y la Itinerante; al reentrar, se reconstruía Breeze.
   - Avatar, `portal.gallery-b-gallery-a`: no era un bloqueo. El cruce terminó a los 36 s, más de los 30 s del test: esperaba a una Galería A cuya construcción tardó 60 s compitiendo con la Itinerante, la Galería B reconstruida y el dibujo del avatar.
   - `SHOP-STUDIO`: el ayudante `press()` repetía por el DOM un clic que Playwright ya había enviado pero no había confirmado a tiempo; la casilla «Visible en la tienda» volvía a marcarse. En local pasaba; en CI, con más carga, fallaba.

### Corrección

- `engine/world/space-lifecycle.js`: volver a una sala `COOLING` reutiliza su escena. Una sala liberada mientras se construye o se calienta se descarta al terminar, sin calentarse y sin quedar `READY` vacía. Si vuelve a pedirse antes, se conserva. Se mantiene la precarga desde `DISPOSED` de §13: la segunda llegada encuentra las mismas salas que la primera.
- `scene-kits/museum/door-cues.js` (nuevo), aplicado a todas las puertas: marco fino de bronce del suelo al dintel; una mancha de luz cálida en el suelo, ante el umbral, que se intensifica cuando el aviso nombra esa puerta (`setNearestDoor`, desde el hotspot más cercano, no desde su estado: el de una puerta ya cruzada se queda `ACTIVE`); y, donde la sala de destino no se ve por el hueco (Breeze, que dibuja su propio motor, y el Archivo, que es un teletransporte), un resplandor tenue al fondo del vano, más allá del muro y dentro de su contorno. Sin luces ni sombras; ningún cambio de colisión, portal, destino ni navegación. La placa «← BREEZE» sigue como señal de orientación para el teléfono en vertical.
- Panel de Breeze: dentro de un marco que no puede leerse, el modo es visita (antes, autoría). `__BREEZE_MUSEUM_PANEL.sync` existe desde el arranque del invitado y el anfitrión cambia la clase directamente si el script del invitado aún no ha corrido. El visitante restaura la personalización guardada desde el mismo proyecto que usa el resto del museo (`window.__IW_CONFIG` o `ConfigStore`): ocultar el panel no descarta la configuración.
- `tests/museum-smoke.mjs`: tras un tiempo agotado, `press()` deja que la página se ponga al día y compara el estado del elemento; solo repite un clic que nunca salió de Playwright.

### Medidas (misma máquina, mismo recorrido)

| | `5b40747` | corrección |
|---|---|---|
| Salir de Breeze con E | 23,7 s | 3,3 s |
| Reentrar en Breeze | 12,5 s | 1,7 s |
| Clic real en «Volver a Galería B» | 7,5 s (en la suite, más de 10 s) | 1,1 s |
| Grupos `space:*` en escena en ese momento | 6 | 2 |
| Avatar: cruce B → A tras entrar y salir de Breeze con E | sin terminar a los 30 s (terminó a los 36 s) | 10,8 s |

### Pruebas

`tests/space-lifecycle.test.mjs` (nuevo, Node, mundo real con un Scene Kit que cuenta): 6 fallos en `af30d50`, 5 en `5b40747`, 0 con la corrección. `tests/breeze-first-visit.mjs --arrivals` (en `npm test`): primera y segunda llegada sin entrar en Breeze, rayos libres hasta el hueco, ninguna sala duplicada, señales de la puerta presentes y respuesta de la luz al acercarse. Con `--webgpu` usa WebGPU sobre SwiftShader para cargar el invitado real.
