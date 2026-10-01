# 10 · Auditoría E2E: problemas, causas y soluciones

Diario vivo de la auditoría completa de la plataforma:

- recorrido por todas las salas en escritorio y en móvil;
- personalización desde el Studio con imágenes y vídeos en cada soporte;
- Wet Paint con cuadros antiguos;
- avatar en todas las salas;
- Breeze;
- grabación de los recorridos.

Método: **detectar → reproducir → documentar la causa → corregir → verificar con una prueba → continuar.**

Rama de trabajo: `import/breeze-studio-pro`. La PR #1 queda congelada para revisión.

Entorno de prueba: Chromium de Playwright 1.56 con WebGL2 y WebGPU por **SwiftShader** (render por software). Los tiempos y los FPS son mucho peores que en un equipo real. Un problema solo se clasifica como de producto si persiste con independencia del entorno.

Estados:

- ✅ corregido y verificado con prueba;
- 🟡 corregido, pendiente de verificación (en curso o en un navegador real);
- 📋 documentado con solución propuesta;
- ⛔ bloqueado;
- 👁 requiere validación humana o en GPU real.

## Resumen

| Id | Área | Problema | Estado |
|---|---|---|---|
| A-01 | Breeze | Producto no presente en el repositorio | ✅ importado (`import/breeze-studio-pro` @ `9ff10b3`) e integrado en la Sala Breeze · 👁 **no validado**: falta la prueba visual en una GPU real |
| A-02 | Avatar | GLB en un host externo (r2.dev), inaccesible en algunos entornos | ✅ alojado en `assets/models/character/Avatar_1.glb` (mismo SHA-256) |
| A-03 | Avatar | 30 MB por visita y varias rutas de carga con `cache: 'no-store'` | 📋 |
| A-04 | Avatar | Continuidad entre salas solo en Galería A ↔ B: el resto de cruces congelaba el avatar y devolvía la cámara a primera persona | ✅ `npm test`: tercera persona en las 6 salas, oculto en Breeze, 0 violaciones · 👁 validación humana pendiente |
| A-05 | Avatar | Tras cada cruce, cámara cenital pegada a la cabeza del avatar | ✅ medido: plano `NORMAL` a 3,3 m en todas las salas |
| A-06 | Avatar | Paneles de QA «PHASE 3/4A/4B · HUMAN GATE» visibles al público | ✅ solo con `?debug=1` |
| A-07 | Entrada | Velo: «Compilando materiales…» con todo listo; botón «Entrar en Vestíbulo» con el avatar en Galería A | ✅ el título ya no se sobrescribe; el botón dice «Entrar en POV» o «Entrar con mi avatar» |
| A-08 | Avatar | Se podía entrar antes de que el avatar existiera: arrancaba en primera persona y saltaba a tercera | ✅ «Preparando tu avatar…» hasta que monta (`AVATAR-READY`) |
| A-09 | Avatar | Sin selector POV o avatar: solo por URL (PR #83 sin portar) | ✅ PR #83 portada (`PRESENCE-CHOICE`) |
| A-10 | Avatar | Paso de locomoción limitado a 0,05 s: por debajo de 20 FPS el avatar camina a cámara lenta | 📋 |
| A-11 | Mundo | Al volver de la Itinerante o de Breeze se aparecía junto a la puerta de la Galería A | ✅ anclajes de llegada propios |
| A-12 | Render | Aviso de three r185: `PCFSoftShadowMap` obsoleto | 📋 trivial |
| A-13 | UI | A 960 px de ancho, la barra superior y el título de sala se parten en dos líneas | 📋 (auditoría móvil) |
| A-14 | Rendimiento | El motor oculto de Wet Paint (iframe, bundle de 660 KB y un contexto WebGL) se carga para **todos** los visitantes, aunque no entren en la Itinerante | 📋 |
| A-15 | Motor | Carrera entre calentamiento (`compileAsync`) y liberación de salas: `TypeError isReady` y riesgo de sala que nunca termina de calentarse | 🟡 liberación aplazada más tiempo límite |
| A-16 | Breeze | Sin WebGPU: error crudo en inglés. Con el dispositivo perdido: bucle de errores y escenario negro | ✅ aviso sin WebGPU (`BREEZE-NOTICE`) y vigilancia verificada con pérdida real del dispositivo (escucha `error` y `unhandledrejection`) |
| A-17 | Breeze | El panel del producto mezcla inglés y español | 📋 |
| A-18 | Breeze | El botón-puente «← Galería B» tapa la barra «info» del panel de Breeze (abajo a la izquierda) | ✅ elevado 48 px; alcanzable (`BREEZE-BRIDGE-REACHABLE`) |
| A-19 | Breeze | Licencias: Venus (Sketchfab), HDRI de Poly Haven y Fabric Lace sin confirmar | ⛔ **pendiente** de verificación documental |
| A-20 | Móvil · Avatar | El pulgar no movía al avatar: el gesto táctil solo movía la cámara en primera persona | ✅ `MOBILE-AVATAR-TOUCH` (≈1 m en 2,5 s) |
| A-21 | Móvil | Sin `touchcancel`: si el sistema interrumpía el gesto (una notificación, una llamada), el visitante seguía caminando solo | ✅ `touchcancel` termina el gesto |
| A-22 | Móvil · Puertas | El aviso «E · Entrar en…» no se podía tocar: en un móvil no había forma de cruzar una puerta | ✅ el aviso es un botón (44 px en táctil, sin la tecla) · `MOBILE-DOOR-TAP` |
| A-23 | Móvil · UI | La barra superior ocupaba 209 px de 844 (una cuarta parte de la pantalla) en tres filas | ✅ una sola fila desplazable: 118 px · `MOBILE-LAYOUT` |
| A-24 | Ficha | El encuadre que reserva sitio para la cartela desplazaba la obra hacia **abajo** (signo invertido). En móvil, la obra quedaba debajo de la cartela | ✅ `MOBILE-DETAIL-FRAMING` |
| A-25 | Móvil · Ficha | «1 / 6» y «Volver a la sala» partidos en dos líneas, tecla «Esc» en una pantalla táctil y controles de 20 px | ✅ una línea, sin tecla en táctil y área táctil de ≈44 px |
| A-26 | Mapa | Nombres superpuestos («Vestíbulo» sobre «Sala de Exposición Itinerante») y títulos de sala insertados sin escapar, aunque son editables desde el Studio | ✅ colocación sin choques y escape · `MAP-LABELS` |
| A-27 | Móvil · Avatar | En vertical, el avatar tapaba el centro de la pantalla: el campo horizontal es de solo ~30° | ✅ en vertical la cámara mira a la altura del pecho; el cuerpo queda al 67 % de la altura · `MOBILE-AVATAR-FRAMING` · 👁 validación humana |
| A-28 | Accesibilidad | Tras tocar la escena, el anillo de foco naranja del navegador enmarcaba toda la pantalla | ✅ anillo propio solo con teclado; ninguno en pantallas táctiles |
| A-29 | Contenido | La versión en texto no coincidía con la cartela: «once obras» frente a «Nueve obras», y cinco obras con otras medidas (220 × 150 frente a 260 × 178) | ✅ corregido y vigilado por `npm run check` (texto = cartela) |
| A-30 | Derechos | La nota del World afirmaba que todo era ficticio, pero Marble Bust 01 (Rico Cilliers, Poly Haven) y Breeze (Niklas Niehus) tienen autoría real | ✅ nota corregida, sin declarar licencias nuevas |

## Detalle

### Auditoría móvil (390 × 844, táctil): A-20 a A-28
- **Método:** `audit/mobile.mjs`, grabado en vídeo. Usa gestos táctiles reales (CDP `Input.dispatchTouchEvent`): pulgar izquierdo para caminar, arrastre a la derecha para mirar, toques en botones. Recorre la visita en primera persona, una puerta, una ficha, el mapa, el contenido en texto, el avatar y el Studio.
- **Primera pasada:**
  - el visitante camina y mira, pero **no puede cruzar ninguna puerta** porque el aviso no se puede tocar (A-22);
  - con avatar, el pulgar no lo mueve (A-20);
  - la barra superior ocupa una cuarta parte de la pantalla (A-23);
  - la obra enfocada queda bajo la cartela (A-24).
- **Última pasada:** 0 hallazgos y 0 errores de consola. Las comprobaciones esenciales quedan en `npm test` (sección «Phone»), para que no vuelvan a romperse.

### A-24 · El encuadre con cartela tenía el signo invertido
- **Cálculo:** la cartela cubre la fracción `f` inferior del encuadre, así que la zona visible está centrada en NDC y = +f. Para que la obra quede ahí, la cámara y su objetivo deben **bajar** `halfHeight · f`. El código los subía, y la obra aparecía desplazada hacia abajo, detrás de la cartela.
- **Medido tras corregirlo:** en 390 × 844, el borde inferior de la obra queda por encima de la cartela (`MOBILE-DETAIL-FRAMING`). En 1280 × 720, la obra queda centrada en la zona libre.

### A-26 · Mapa de salas
- **Colocación:** cada nombre se coloca donde no choca con nada:
  - por defecto, encima de su sala; si no cabe, debajo, a la derecha o a la izquierda;
  - se evitan las otras etiquetas, los nodos y las líneas de paso;
  - los nombres largos se parten en dos líneas.
- **Escape:** los títulos se escapan antes de insertarse en el SVG.
- **Verificación:** `MAP-LABELS`, 0 choques en 390 y 1280 px.

### A-27 · Avatar en vertical
- **Medida:** con 52°–59° de campo vertical y una relación de aspecto de 0,46, el campo horizontal es de ~30°. A 3,25 m, el avatar ocupaba el 40 % del ancho y el centro de la imagen.
- **Corrección:** en vertical, el `ThirdPersonExploreController` apunta a 1,55 m en lugar de 1,02 m, desde la misma posición de cámara. La distancia 3D (≈3,29 m) sigue dentro de la envolvente 2,75–3,72 m, y el plano horizontal no cambia.
- **Resultado:** el cuerpo queda al 67 % de la altura y la cabeza al 48 %, y la sala se ve por encima del avatar.

### A-29 y A-30 · Contenido y derechos
- **Medidas:** la cartela calcula las medidas desde `size`, que es lo que se ve en la sala; la versión en texto estaba escrita a mano con medidas antiguas. Una visita con lector de pantalla recibía otros números.
- **Recuento:** «Nueve obras» es correcto para la colección permanente sin el piloto Marble Bust 01: 5 piezas en la Galería A, 3 en la Galería B y 1 en el Archivo. Marble Bust 01 queda fuera del recuento mientras su veredicto visual siga **pendiente**.
- **Nota de derechos:** ahora nombra las dos piezas con autoría real y remite a `THIRD_PARTY_NOTICES.md`. No declara ninguna licencia nueva.

### A-04 · El avatar solo era navegable entre Galería A y B
- **Reproducción:** `?character=1&mobility=1&continuity=1&gatea=1`, tercera persona en Galería A, cruce al Vestíbulo y vuelta. Al cruzar, la cámara pasaba a `EXPLORE`. De vuelta en A, el avatar estaba inmóvil donde se quedó y en B la cámara estaba dentro de su cabeza.
- **Causa:** `museum-character-phase4b.js` solo envolvía `traversePortal` para `portal.gallery-a-gallery-b` y su inverso. En el resto:
  1. el cruce estándar pedía `EXPLORE`;
  2. `updateLocomotion` dejaba de mover el personaje porque la sala activa no era la suya;
  3. nada volvía a vincularlo con la sala nueva.
- **Corrección:** todos los portales pasan por la continuidad (mismo avatar, mismo motion, mismo controlador de cámara). En una sala anidada (Breeze), el avatar se aparca oculto y se recupera al salir.
- **Verificación:** recorrido Galería A → Vestíbulo → A → Archivo → A → B → Itinerante → B → Breeze → B. Resultado: tercera persona en todas las salas, 0 violaciones de cámara, avatar oculto en Breeze y visible al volver.

### A-05 · Cámara cenital tras cruzar
- **Medición:** al cruzar al Vestíbulo, el avatar aparecía a 0,92 m de la pared, porque los puntos de llegada están pensados para primera persona. La cámara solo cabía 0,69 m detrás y a 2 m de altura (plano `CLOSE_OPTICAL`).
- **Corrección:**
  - al re-vincular, el avatar avanza a lo largo de la normal de llegada hasta tener 3,3 m libres detrás, resuelto contra los obstáculos de la sala;
  - la cámara se recoloca al instante (`ThirdPersonExploreController.reacquire()`) en vez de interpolar desde la sala anterior.
- **Verificación:** plano `NORMAL` a 3,04 m horizontal y 3,31 m de distancia en todas las salas, con capturas.

### A-15 · Carrera entre calentamiento y liberación
- **Síntoma:** al entrar en Breeze, `TypeError: Cannot read properties of undefined (reading 'isReady')` dentro de `three.module.min.js`.
- **Causa:** `renderer.compileAsync(scene)` consulta en un temporizador si los programas de los materiales compilados están listos. Si una sala vecina se libera mientras tanto (`material.dispose()`), su programa desaparece y la consulta lanza el error dentro del temporizador. La promesa no se resuelve nunca y esa sala puede quedarse calentando para siempre.
- **Corrección:**
  - `RenderHost.warm()` cuenta los calentamientos en curso y tiene un límite de 15 s;
  - `MuseumSceneKit.disposeSpace()` saca la sala de la escena al instante pero aplaza la liberación de GPU con `renderHost.whenIdle()`.

### A-16 · Breeze sin WebGPU o con el dispositivo perdido
- **Hechos:**
  - En Chromium headless sin `--enable-unsafe-webgpu` no hay adaptador WebGPU, y el producto mostraba «Couldn't initialize WebGPU…».
  - Con WebGPU emulado (SwiftShader), el dispositivo se pierde a los ~5 s, **también con Breeze funcionando solo**. Esto es un límite del entorno, pero ha destapado que el producto no se recupera: lanza `reading 'size'` cada 0,8 s y deja el escenario en negro.
- **Corrección (en el museo, sin tocar el producto):**
  - antes de montar, se comprueba que hay un adaptador WebGPU; si no lo hay, se muestra el aviso «Esta sala necesita WebGPU» con salida;
  - si el producto lanza errores en bucle (3 en 5 s), se muestra «La instalación se ha detenido» con «Reintentar» y «Volver a Galería B».
- **Pendiente:** 👁 validación en un navegador con GPU real (preview).

### A-14 · Wet Paint se carga para todos los visitantes
- **Hecho:** `installWetPaint()` crea al arrancar el iframe oculto del motor (bundle de 660 KB más un contexto WebGL). En la prueba de Breeze se perdieron a la vez los contextos del museo, de Breeze **y** de Wet Paint.
- **Solución propuesta:** crear el puente del motor bajo demanda: al entrar en la Sala Itinerante, al abrir sus controles en el Studio o al subir un medio. Liberarlo al salir de la sala, salvo en el Studio.

### Licencias de Breeze (A-19)
Siguen **pendientes**, y no se declara ninguna licencia no verificada:

- Venus de Milo (Sketchfab, chiwei y Lanzi Luo);
- HDRI de Poly Haven;
- Fabric Lace 038 (3dtextures.me).

Las dos texturas originales de terceros siguen fuera. Las sustituyen texturas propias con el mismo nombre (ver `experiences/breeze-studio-pro/IMPORT_NOTES.md`).
