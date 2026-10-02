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
| A-10 | Avatar | Paso de locomoción limitado a 0,05 s: por debajo de 20 FPS el avatar camina a cámara lenta | ✅ ver A-37 |
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
| A-31 | Studio · Medios | Al sustituir un archivo, mientras el nuevo cargaba, la ranura mostraba «En el proyecto» en verde con el nombre del archivo **anterior**, aunque ese archivo hubiera fallado. Guardar en ese intervalo escribía una referencia muerta | ✅ la ranura sigue al archivo nuevo desde «Seleccionado»; un selector cancelado no borra nada · `STUDIO-MEDIA-REPLACE` |
| A-32 | Studio · Vídeo | MP4 H.264 rechazado en Chromium sin códecs propietarios con el mensaje «Prueba con un MP4 (H.264) o un WebM»: recomendaba el mismo formato que acababa de fallar | ✅ el mensaje consulta `canPlayType` y da el consejo que corresponde · `STUDIO-VIDEO-ADVICE` |
| A-33 | Medios · Compatibilidad | La proyección «Cuaderno de luz» solo existía en WebM (VP9): en navegadores sin VP9 (iPhone antiguos) la pared mostraba el sustituto generado | ✅ `media.alternates` con MP4 H.264 (28 kB); el cargador elige la primera variante que el navegador puede reproducir. Un medio subido desde el Studio sustituye también las variantes. `npm run check` comprueba que existen |
| A-34 | **Wet Paint · Visitante** | Las transformaciones Wet Paint guardadas solo se aplicaban al arrancar el puente del motor. Una visita que empieza en el Vestíbulo (todas) o que vuelve a la Itinerante encontraba los cuadros originales: **el visitante nunca veía el trabajo del autor** | ✅ se restauran en cada `SPACE_READY` de la Itinerante · `WETPAINT-RESTORE` (falla sin la corrección: «original · original») |
| A-35 | Studio | «Guardar» daba la vista previa por aplicada (el mismo indicador servía para las dos cosas). «Empezar experiencia» se saltaba la reconstrucción y mostraba la sala tal como se aplicó por última vez | ✅ `previewStale` separado de «sin guardar» · `STUDIO-SAVED-NOT-APPLIED` |
| A-36 | Studio · Medios | Al recargar, las referencias `authored:` de otra sesión se pasaban al cargador como URL: un error CORS por obra y un sustituto generado en la pared. El Studio, además, las mostraba como «En el proyecto» | ✅ la sala conserva el original; la ranura dice «Archivo no disponible» y Validar lo avisa sin bloquear · `STALE-UPLOAD`. La persistencia real de medios sigue pendiente (ROADMAP 2.2) |
| A-37 | Avatar · Rendimiento | Confirmado en el recorrido grabado: con pocos FPS, el avatar avanzaba 0,16–0,31 m en ~6 s de teclas (≈5 % de su velocidad). El paso de locomoción recortaba **cada fotograma** a 0,05 s | ✅ subpasos de 0,05 s (la colisión sigue resolviéndose fina) hasta el `maxDelta` del reloj (0,5 s) · `AVATAR-PACE-LOW-FPS` con la CPU frenada 6× |
| A-38 | Wet Paint | 2 de cada 8 fotogramas capturados de la transición eran blancos: el lienzo WebGL del motor se copiaba entre el borrado y el dibujo. Cada bucle parpadeaba en blanco ~300 ms, y un visitante podía ver un cuadro vacío («03 — Living» en la grabación) | ✅ las copias planas se descartan; verificado con dos cuadros: 0 fotogramas blancos |
| A-39 | Orientación | No había forma de **terminar la visita**: ni salida en el espacio ni botón | ✅ puerta «Salida» en el Vestíbulo (`END_VISIT`, con confirmación) y botón «Salir» en cualquier sala · `EXIT-DOOR`, `EXIT-FAREWELL` |
| A-40 | Orientación | Ninguna indicación de por dónde se sale desde cada sala | ✅ señales verdes derivadas del grafo, junto a la puerta correcta y sin tapar obras · `EXIT-SIGNS`, `EXIT-ROUTE` |
| A-41 | **Obras** | En una esquina, delante de *Estudio de figura, IV*, el aviso y la tecla E abrían *División tercera* (la vecina de la otra pared estaba a 1,76 m). La cercanía se medía sin mirar hacia dónde mira el visitante | ✅ se prioriza la obra de enfrente; `WORK-OUTLINE` falla sin la corrección |
| A-42 | Obras | No se distinguía qué obra abriría E | ✅ marco cálido y filete en la obra que nombra el aviso, o anillo en el suelo si es exenta; nada se resalta con la ficha abierta |
| A-43 | Tienda | La tienda del museo no existía | ✅ sala `SHOP` con 8 productos administrables desde el Studio (categoría, precio de demostración, orden y visibilidad, además de los campos comunes) · `SHOP-*` |
| A-44 | Contenido | La doc 03 decía «Viento sobre mármol (dominio público)» y «Breeze no migrada» | ✅ corregido: licencias pendientes e integración real |

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

### Personalización completa desde el Studio (A-31 a A-36)
- **Método:** `audit/personalize.mjs`, grabado en vídeo. Cubre:
  - logotipo de la institución;
  - 7 piezas de las Galerías A y B y la proyección, con cuadros de Van Gogh (dominio público) y vídeos WebM propios;
  - un MP4 H.264 como prueba de códec;
  - las 5 obras de la Itinerante con Wet Paint a partir de cuadros antiguos;
  - guardar, «Empezar experiencia», recorrido con foco en cada obra y recarga.
- **Resultado:** 12/12 medios aceptados y visibles en las Galerías A y B. Wet Paint aplica las 5 transiciones en el Studio, en unos 14 s cada una.
- **Hallazgos:** el visitante no veía Wet Paint (A-34); guardar no es aplicar (A-35); los archivos de otra sesión rompían las obras (A-36). Los tres quedan corregidos y vigilados por `npm test`.
- **Límite conocido (no es un defecto):** los medios subidos viven solo mientras el Studio está abierto. Los textos y las transformaciones Wet Paint persisten en el navegador del autor. La publicación real requiere backend (ROADMAP fase 2).

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

## Grabaciones y estado por sala (2026-10-01)

Grabadas con Playwright y Chromium SwiftShader (render por CPU): el tiempo real es lento. Los vídeos no se versionan en el repositorio.

| Grabación | Qué cubre | Resultado |
|---|---|---|
| Studio: personalización y visita (1440 × 900) | Logotipo; 7 piezas de A y B y la proyección con Van Gogh y WebM propios; prueba MP4; 5 cuadros Wet Paint; guardar, «Empezar» y foco en cada obra; recarga | 12/12 medios y 5/5 Wet Paint visibles en la visita · 0 errores de consola |
| POV en escritorio (1280 × 720) | Teclado: W + E para cruzar, E para la ficha, flechas para recorrer la colección, Esc; Archivo, B y proyección, Itinerante, Breeze (aviso sin WebGPU y salida), mapa y texto | 0 violaciones de cámara · 0 errores |
| Avatar en las 6 salas (1280 × 720) | Paseo con teclado en cada sala, incluidas la Itinerante y Breeze | Tercera persona en todas, oculto en Breeze, 0 violaciones · 0 errores |
| Móvil (390 × 844, táctil) | Pulgar, puerta tocando el aviso, ficha, mapa, texto, avatar y Studio | 0 hallazgos · 0 errores |

| Sala | POV | Avatar | Móvil |
|---|---|---|---|
| Vestíbulo | PASS | PASS | PASS (POV) |
| Galería A | PASS | PASS | PASS (POV y avatar) |
| Galería B | PASS | PASS | NO PROBADO (avatar) |
| Archivo | PASS | PASS | NO PROBADO |
| Itinerante (Wet Paint) | PASS | PASS | NO PROBADO |
| Breeze | PASS **solo el aviso sin WebGPU y la salida** | PASS (avatar aparcado) | NO PROBADO |

**Breeze y el avatar no están validados.** Falta la prueba visual en una GPU real y la revisión humana. El recorrido comentado se inició, pero sus paradas no quedaron verificadas: **NO PROBADO**.

## Misión 2 (2026-10-02): experiencia, orientación y tienda

### Estado de las funciones

| Función | Estado | Evidencia |
|---|---|---|
| 7 salas visitables (más la tienda) | Operativas | `ROOM-*`, `SHOP-ROOM` |
| Primera persona (POV) | Operativa | Recorrido grabado; `MOBILE-DOOR-TAP` |
| Avatar en tercera persona | Implementado; **validación humana pendiente** | `AVATAR <sala>` en las 7 salas, incluida la tienda |
| Ficha de obra (abrir, recorrer, cerrar) | Operativa | `FOCUS`, `MOBILE-DETAIL-FRAMING`, `WORK-OUTLINE` |
| Panel: textos y metadatos → visita | Operativo, persiste en el navegador del autor | `STUDIO-RELOAD`, `SHOP-STUDIO` |
| Panel: imágenes y vídeos → visita | Operativo **solo durante la sesión** | `STALE-UPLOAD` (sin backend) |
| Breeze | Integrado; aviso sin WebGPU y salida verificados; **no validado en GPU real** | `BREEZE-*` |
| Tienda | Operativa y simulada | `SHOP-*` |
| Salida y señales | Operativas | `EXIT-*` |
| Publicación para todos los visitantes | **Ausente**, bloqueada por la decisión de backend | ROADMAP 2.1 |
| Recorrido comentado | Operativo según `npm test` (ruta y cámara); paradas no revisadas visualmente en esta misión | — |

### Validación de la misión (`npm test`: 72/72 OK, 2026-10-02)

| Criterio | Resultado | Evidencia |
|---|---|---|
| Las salas principales abren y se navega entre ellas | **PASS** | `ROOM-*`, `SHOP-ROOM`, `SHOP-EXIT` |
| El avatar y la vista subjetiva recorren las salas | **PASS** (automático) · 👁 humana pendiente | `AVATAR <sala>`, recorridos grabados |
| La ficha se abre y se cierra | **PASS** | `FOCUS`, `EXIT-DOOR` (Esc) |
| Los datos de la obra son los de la configuración | **PASS** | `SHOP-SHEET`, `STUDIO-RELOAD`, `npm run check` (texto = cartela) |
| Los cambios en el panel persisten y llegan a la visita | **PASS** en el navegador del autor · publicación: **NO DISPONIBLE** | `SHOP-STUDIO` |
| Breeze carga, permite volver y avisa sin WebGPU | **PASS** sin WebGPU · **NO PROBADO** con GPU real | `BREEZE-NOTICE`, `BREEZE-EXIT` |
| Se puede visitar y abandonar la tienda | **PASS** | `SHOP-ROOM`, `SHOP-EXIT` |
| Los productos del panel aparecen en la sala y en su ficha | **PASS** | `SHOP-STUDIO`, `SHOP-SHEET` |
| La compra se identifica como ficticia | **PASS** (no hay compra; cartela, ficha y rótulo lo dicen) | `SHOP-SHEET` |
| Las señales llevan a rutas reales | **PASS** | `EXIT-SIGNS`, `EXIT-ROUTE` |
| Sin errores críticos, recursos rotos ni regresiones | **PASS** | `NO-CONSOLE-ERRORS`, `NO-BROKEN-REQUESTS` y consola por sección |
| Móvil | **PASS** en POV y avatar (Galería A y tienda por portal) · **NO PROBADO** en un teléfono real | Sección «Phone» |
| Licencias de Venus, Poly Haven y Fabric Lace | **NO PROBADO**: dominios bloqueados en el entorno | `IMPORT_NOTES.md` |

