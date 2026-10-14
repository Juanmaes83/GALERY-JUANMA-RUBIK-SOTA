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
| A-41 | **Obras** | En una esquina, delante de *Estudio de figura, IV*, el aviso y la tecla E abrían *División tercera* (la vecina de la otra pared estaba a 1,76 m). La cercanía se medía sin mirar hacia dónde mira el visitante | ✅ se prioriza la obra de enfrente, y una obra de lado o detrás (más de ~85°) no se ofrece aunque esté en rango; las puertas mantienen la regla simple. `WORK-OUTLINE` (casos «esquina» y «de lado») falla sin cada corrección |
| A-42 | Obras | No se distinguía qué obra abriría E | ✅ marco cálido y filete en la obra que nombra el aviso, o anillo en el suelo si es exenta; nada se resalta con la ficha abierta |
| A-43 | Tienda | La tienda del museo no existía | ✅ sala `SHOP` con 8 productos administrables desde el Studio (categoría, precio de demostración, orden y visibilidad, además de los campos comunes) · `SHOP-*` |
| A-44 | Contenido | La doc 03 decía «Viento sobre mármol (dominio público)» y «Breeze no migrada» | ✅ corregido: licencias pendientes e integración real |
| A-45 | **Breeze · Acceso** | Frente a la puerta de Breeze, E abría la ficha de *Marea baja*: la puerta no tenía hotspot y la obra colgaba sobre el hueco | ✅ hotspot de puerta, obra a 2,1 m del hueco y distancia en planta · `BREEZE-DOOR-E`, `MAREA-BAJA-SHEET`, `SPATIAL-DOOR-HOTSPOTS`, `DOOR-AHEAD` |
| A-46 | **Wet Paint · Montaje** | Cuatro obras en la pared de la puerta (dos invadían el hueco) y tres paredes vacías | ✅ las cinco obras, en bucle por las cuatro paredes · `WETPAINT-FOUR-WALLS`, `WETPAINT-WORKS-ANSWER`, `MOBILE-WETPAINT-FRAMING` |
| A-47 | **Cuerdas** | La cuerda de Wet Paint cruzaba la puerta, y la llegada quedaba entre la pared y la cuerda. A pocos FPS se atravesaba; a FPS normales, el visitante se quedaba atascado. Otros extremos de cuerda dejaban huecos de 0,85–0,9 m | ✅ la cuerda se corta en las puertas y cierra los huecos estrechos; la primera persona resuelve la colisión en subpasos · `SPATIAL-ROPES-OPEN`, `WETPAINT-WALK-IN` |
| A-48 | **Interacción** | La distancia contaba la altura del ancla (puertas en el suelo, cuadros a la altura de los ojos): cualquier obra cercana ganaba a la puerta | ✅ distancia en planta · `tests/proximity.test.mjs` (falla 2 de 5 sin la corrección) |
| A-49 | **Avatar · Interacción** | Con avatar, lo cercano se medía desde la cámara (3 m detrás), no desde el avatar: el aviso y E nombraban lo que estaba cerca de la cámara | ✅ una sola fuente por fotograma: el cuerpo del avatar · `AVATAR-PROXIMITY-BODY` |
| A-50 | **Avatar · Breeze** | Con avatar, dentro de Breeze ni E ni el aviso salían de la sala: la proximidad se medía desde la cámara que seguía encuadrando el avatar aparcado en la Galería B. Solo funcionaba el botón-puente | ✅ aparcado, se mide desde donde el cruce dejó al visitante · `AVATAR-BREEZE-E` |
| A-51 | **Avatar · Fluidez** | La cámara se quedaba quieta y daba saltos (42 de 43 fotogramas quieta, 38 recolocaciones en 2 s) y el avatar pasaba de 0 a velocidad máxima en un fotograma | ✅ cámara que sigue al avatar 1:1, avatar con aceleración, giro suave y colisión deslizante · `AVATAR-CAMERA-FOLLOW`, `AVATAR-EASE`, `AVATAR-DT-INDEPENDENT` · 👁 falta la revisión visual en una GPU real |
| A-52 | Studio · Audio | La duración de un audio subido salía vacía: se leía después de descargar el elemento de prueba, y eso la devuelve como `NaN` | ✅ se lee antes · `AUDIOGUIDE-STUDIO-UPLOAD` |
| A-53 | Audioguía · Teclado | Enter en «Pausar» llegaba también al atajo E/Enter del museo: pausaba y activaba lo que hubiera cerca | ✅ los controles de la audioguía no propagan Enter ni Espacio · `AUDIOGUIDE-KEYBOARD` |
| A-54 | Audioguía · Accesibilidad | Cada play o pausa redibujaba el panel y el foco del teclado se perdía; al terminar una pista, el botón decía «Reanudar» | ✅ el foco vuelve al mismo control; al terminar, la pista vuelve al principio |
| A-55 | Audioguía · Móvil | «Cerrar» medía 31 px de alto en el móvil (mínimo 44 px) | ✅ todos los botones del panel a 44 px · `AUDIOGUIDE-MOBILE` |
| A-56 | Entorno de prueba | En SwiftShader, dibujar cada fotograma satura el hilo principal y un `<audio>` no pasa de `readyState 0`; con el bucle parado, la misma pista suena | 📋 no es un fallo del museo. La prueba deja de dibujar mientras comprueba el audio · 👁 reproducción en GPU real pendiente |
| A-57 | Tienda | La tienda era una galería: fotos de productos enmarcadas en las paredes y cuerdas de museo. Sin mostrador, sin muebles ni existencias | ✅ misión 5, según la referencia: vitrinas de arce y vidrio, mostrador con caja, datáfono, teléfono, llaveros y bandeja, dependienta, cuadros y cordón; 3 productos nuevos · `SHOP-FIXTURES`, `SHOP-COLLIDE`, `SHOP-SELECT` · 👁 revisión visual humana |
| A-58 | Escena · Anclas | Toda ancla `WALL` a menos de 1 m de la pared se proyectaba sobre su superficie: un producto montado en un mueble quedaba detrás del fondo del mueble, invisible | ✅ las anclas con `surface: "FIXTURE"` no se proyectan · `SHOP-FIXTURES` |

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

## Misión 3 (2026-10-02): accesos, montaje, avatar y cuerdas

Incidencias de la revisión humana del preview. Cada una se reprodujo antes de cambiar nada: con teclas reales en Chromium (`audit/repro-m3.mjs`), con una auditoría espacial de todas las salas (`audit/spatial-probe.mjs`) y con un banco determinista del avatar que para el bucle y avanza `runtime.step(dt)` con tiempos elegidos (`audit/avatar-harness.mjs`). Los scripts están en el área de trabajo de la sesión, no en el repositorio. Sus comprobaciones pasaron a `npm test`.

### A-45 · Breeze: E abría la ficha en vez de entrar

- **Reproducción:** en la Galería B, de pie en (18,6; −12) mirando a la puerta de Breeze, el hotspot elegido era `hotspot.art.marea-baja`. E abría su ficha y el visitante seguía en la Galería B.
- **Causa:**
  1. La Galería B no tenía hotspot para `portal.gallery-b-breeze`. Las demás puertas sí, y a esta solo llegaba el recorrido comentado. Las pruebas cruzaban con `traversePortal`, así que no lo veían.
  2. *Marea baja* colgaba de la pared este con su centro a 0,6 m de la puerta, y su ancho invadía el hueco 1,5 m.
  3. La distancia era 3D: una puerta, anclada en el suelo, quedaba 1,6 m «más lejos» que un cuadro a la altura de los ojos (A-48).
- **Corrección:**
  - `hotspot.gallery-b.to-breeze`, igual que las demás puertas;
  - *Marea baja* sigue en la pared este, en z = −8, a 2,1 m del hueco, con su ficha, contenido y personalización intactos (`entity.artwork.marea-baja`);
  - distancia en planta, conservando la ponderación por orientación (de frente ×1, a 90° ×1,5, detrás ×2; las obras de lado o detrás no se ofrecen). No es una regla de «la puerta siempre gana»: mirando la obra desde cerca, E abre la obra (`WORK-AHEAD`).
- **Pruebas:** `BREEZE-DOOR-E`, `BREEZE-EXIT-E` y `MAREA-BAJA-SHEET` (teclas reales), `SPATIAL-DOOR-HOTSPOTS` y `SPATIAL-DOORWAYS-CLEAR` (todas las salas), y `DOOR-AHEAD`, `WORK-AHEAD`, `DOOR-BEHIND`, `BACK-OUT` y `FLOOR-ANCHOR` en `tests/proximity.test.mjs`.

### A-46 · Wet Paint: una pared de cuadros

- **Reproducción:** cuatro obras en la pared norte, que es la de la puerta: *Painterly* y *Living* invadían el hueco 0,83 m cada una. Solo *Experimental* estaba en otra pared (la este); la sur y la oeste estaban vacías.
- **Corrección:** las cinco obras, sin añadir ni quitar ninguna, recorren la sala en bucle desde la puerta y en su orden editorial:
  - *01 Original*, en la oeste;
  - *02 Painterly* y *03 Living*, en la sur, la que ve quien entra;
  - *04 Combined*, en la este;
  - *05 Experimental*, en la norte, a 2,6 m de la puerta.

  Solo cambian las posiciones de los anclajes `anchor.itinerant.wall-1…5`. Las entidades, fichas, imágenes y la personalización del Studio y de Wet Paint se enlazan por `entityId` y no cambian. La llegada antigua `anchor.itinerant.spawn` se movió delante de la nueva cuerda.
- **Pruebas:**
  - `WETPAINT-FOUR-WALLS`;
  - `WETPAINT-WORKS-ANSWER`: cada obra se resalta, es la que nombra E y abre su ficha;
  - `MOBILE-WETPAINT-FRAMING`: en 390 × 844, cada obra enfocada queda por encima de su cartela;
  - `WETPAINT-RESTORE`, sin cambios.

### A-47 · Cuerdas que cierran pasos

- **Reproducción:** en Wet Paint, la cuerda de la pared norte iba de x 7,2 a 20,8, cruzando la puerta (12,7–15,3). La llegada desde la Galería B (z −3,4) quedaba entre la pared (−5) y la cuerda (−3,05).
  - Caminando con W a los FPS de SwiftShader, el visitante **atravesó** la cuerda (z −3,6 → 3,16): un paso de 0,5 s caía más allá del centro de la caja y la colisión lo empujaba al otro lado.
  - A FPS normales, quedaba atascado.
  - En el Vestíbulo, la Galería A y la tienda, los extremos de cuerda dejaban huecos de 0,85–0,9 m entre cuerda y pared, demasiado estrechos para un cuerpo de 0,35 m de radio.
- **Causa:** `_barrierLinesFor` tendía una sola cuerda sobre todo el tramo con obras de la pared, sin mirar sus puertas. Además, la primera persona resolvía la colisión una sola vez por fotograma.
- **Corrección:**
  - la cuerda se corta alrededor de cada puerta de su pared, con 0,6 m libres a cada lado;
  - si un extremo deja un hueco menor de 1,1 m, la cuerda llega hasta la pared (la obra queda protegida y no hay bolsillo);
  - la primera persona resuelve el movimiento en tramos de 0,1 m.

  No se ha quitado ninguna cuerda: en Wet Paint ahora protege la pared con más obra (la sur), sin puertas.
- **Pruebas:** `SPATIAL-ROPES-OPEN` (ninguna cuerda cruza una puerta, ninguna llegada atrapada, ningún hueco intransitable, en todas las salas) y `WETPAINT-WALK-IN` (W real desde la puerta: z −3,40 → 0,20, delante de la cuerda).

### A-48 · Puerta u obra: la altura no es distancia

La causa común de A-45, y de cualquier puerta con una obra cerca. `tests/proximity.test.mjs` falla 2 de 5 casos con el código anterior (`DOOR-AHEAD` y `FLOOR-ANCHOR`) y pasa con la corrección.

### A-49 y A-50 · Proximidad con avatar

- **Reproducción:**
  - con el avatar a 1,6 m de *Marea baja* y mirándola, el hotspot elegido fue `null` durante 3 s: la cámara estaba a 4,4 m;
  - dentro de Breeze con avatar, la salida estaba siempre `AVAILABLE` (nunca `NEAR`), con la cámara en (8,7; −10), en la Galería B.
- **Causa:** el runtime actualizaba la proximidad con la pose de la cámara, y el avatar también, compartiendo la misma ranura de 12 Hz: ganaba la cámara. Al entrar en Breeze, la cámara seguía encuadrando el avatar aparcado.
- **Corrección:** `runtime.proximitySource` da una sola fuente por fotograma:
  - el cuerpo del avatar en su sala;
  - aparcado, el punto donde el cruce dejó al visitante;
  - sin avatar, la cámara en primera persona.
- **Pruebas:** `AVATAR-PROXIMITY-BODY` y `AVATAR-BREEZE-E` (E entra y sale de Breeze con avatar; el avatar reaparece visible). `AVATAR-BREEZE-E` falló en la primera ejecución de esta misión y así destapó A-50, un defecto anterior a la misión.

### A-51 · Fluidez del avatar

- **Reproducción**, con el banco determinista en la Galería A y fotogramas irregulares (1/60, 1/20, 1/45, 1/15, 1/90 s):

  | Medida | Antes | Después |
  |---|---|---|
  | Fotogramas con la cámara quieta y el avatar andando | 42 de 43 | 0 |
  | Recolocaciones bruscas de la cámara en 2 s | 38 | 0 |
  | Salto máximo de la cámara en un fotograma | 1,01 m | 0 |
  | Velocidad de la cámara ÷ la del avatar | media 1,03, σ 6,7 | media 0,997, σ 0,001 |
  | Mayor salto de velocidad del avatar por fotograma | 1,05 m/s | 0,35 m/s |
  | Distancia en 2 s a 60, 30 y 10 FPS e irregular | 2,10–2,12 m | 2,03–2,05 m |

  La distancia ya era independiente de los FPS (A-37). Es algo menor ahora por la rampa de arranque.
- **Causa** (tres defectos encadenados en la cámara, más uno del avatar):
  1. La línea de visión de cada candidato se comprobaba con la regla de altura mínima de la cámara (1,25 m). Desde el pecho del avatar (1,02 m), el primer punto fallaba siempre en horizontal: la cámara vivía en su plan de reserva (`HOLD_LAST_SAFE`), se quedaba quieta, salía de su envolvente y era recolocada de golpe cada 6–7 fotogramas. En vertical el objetivo está a 1,55 m, por eso en el móvil no se notaba.
  2. Perseguía un punto de la sala con un retraso de unos 0,2 m al andar.
  3. Encuadraba la posición del fotograma anterior: el avatar se movía después de la cámara.
  4. El avatar pasaba de 0 a velocidad máxima en un fotograma y paraba en seco.
- **Corrección:**
  - la línea de visión solo se comprueba contra paredes, techo y obstáculos;
  - la cámara sigue su desplazamiento respecto al avatar (andar la arrastra 1:1; solo se suavizan los cambios de encuadre), con zona muerta gradual;
  - `runtime.preCamera` mueve el cuerpo antes que la cámara;
  - velocidad y giro con rampa (la misma constante que la primera persona) y colisión deslizante, que en una esquina detiene al avatar sin oscilar.
- **Pruebas:** `AVATAR-DT-INDEPENDENT`, `AVATAR-CAMERA-FOLLOW`, `AVATAR-EASE` y `AVATAR-PACE-LOW-FPS`, que ahora descuenta la rampa de arranque.
- **Límite:** son medidas funcionales (posición, velocidad y cámara por fotograma), no una valoración visual. La sensación de fluidez **debe revisarla una persona en una GPU real**. SwiftShader no sirve como prueba de rendimiento.

### Validación de la misión 3

`npm test`: `npm run check` OK, `tests/proximity.test.mjs` 5/5 y `tests/museum-smoke.mjs` **93/93**, en Chromium headless con SwiftShader, 2026-10-02.

Las pruebas nuevas, ejecutadas sobre el código anterior (`a2e0cc5`), **fallan**:

- `DOOR-AHEAD` y `FLOOR-ANCHOR`;
- `SPATIAL-DOORWAYS-CLEAR`, `SPATIAL-ROPES-OPEN` y `SPATIAL-DOOR-HOTSPOTS`;
- `WETPAINT-FOUR-WALLS`;
- `BREEZE-DOOR-E` (E abría *Marea baja*) y `AVATAR-BREEZE-E`;
- `AVATAR-CAMERA-FOLLOW` (37 de 43 fotogramas con la cámara quieta);
- `AVATAR-EASE` (salto de 1,05 m/s).

| Criterio de aceptación | Resultado | Evidencia |
|---|---|---|
| 1. E frente a la puerta entra en Breeze, sin abrir la ficha cercana | **PASS** en POV y avatar | `BREEZE-DOOR-E`, `AVATAR-BREEZE-E` |
| 2. *Marea baja* sigue visible y con ficha | **PASS** | `MAREA-BAJA-SHEET` |
| 3. Wet Paint en las cuatro paredes, sin ocupar la puerta ni el paso | **PASS** | `WETPAINT-FOUR-WALLS`, `SPATIAL-DOORWAYS-CLEAR`, `WETPAINT-WALK-IN` |
| 4. Cada obra de Wet Paint conserva contenido y personalización | **PASS**: mismas entidades; solo cambian los anclajes | `WETPAINT-WORKS-ANSWER`, `WETPAINT-RESTORE` |
| 5. Avatar sin saltos, patinaje ni temblores reproducibles | **PASS** funcional · 👁 **revisión visual en GPU real pendiente** | `AVATAR-CAMERA-FOLLOW`, `AVATAR-EASE`, esquina sin oscilación |
| 6. Velocidad coherente con distintos FPS | **PASS**: 2,03–2,05 m en 2 s a 60/30/10 FPS e irregular | `AVATAR-DT-INDEPENDENT`, `AVATAR-PACE-LOW-FPS` |
| 7. Cuerdas que protegen sin bloquear rutas ni atrapar | **PASS** | `SPATIAL-ROPES-OPEN`, `WETPAINT-WALK-IN` |
| 8. Puerta u obra según proximidad y orientación | **PASS** | `tests/proximity.test.mjs`, `AVATAR-PROXIMITY-BODY` |
| 9. Entrada, salida, navegación y selección en POV, avatar y móvil | **PASS** en emulación móvil 390 × 844 · **NO PROBADO** en un teléfono real | Suite completa, `MOBILE-*` |
| 10. Las pruebas nuevas fallan antes y pasan después; sin regresiones | **PASS** | Ver arriba |

**Verificación remota del preview de la misión 3** (`b73bc1f`, despliegue de staging en el proyecto solo-preview): la suite completa contra la URL pública, en un Vercel Sandbox de 8 vCPU, terminó con **93 OK y 0 fallos** (`SMOKE_EXIT=0`). Sigue siendo Chromium con render por software: 👁 la revisión visual en una GPU real sigue pendiente.

## Misión 4 (2026-10-02): audioguía

Bienvenida, 7 introducciones de sala y 16 cápsulas de obra, editables en el Studio y con un reproductor único para el visitante. El diseño, el modelo y las reglas están en [11-AUDIOGUIA](11-AUDIOGUIA.md).

**Lo que hay y lo que no:**

- **Hay:** el sistema completo y 24 borradores de texto compuestos con datos que ya existían (cartelas, fichas, salidas), todos marcados como borrador.
- **No hay ninguna grabación.** No se ha generado audio sintético ni silencioso para aparentar contenido. Cada pista dice «Pendiente de audio» y muestra su transcripción.
- Los audios subidos en el Studio duran solo la sesión, como el resto de subidas, y el editor lo dice. Al recargar, la pista se declara «Audio no disponible».

Defectos encontrados al probar la propia misión, todos corregidos antes del commit: A-52 a A-55. A-56 es una limitación del entorno de prueba.

### Validación de la misión 4

`npm test`: `npm run check` OK, `tests/proximity.test.mjs` 5/5, `tests/audioguide.test.mjs` 19/19 y `tests/museum-smoke.mjs` **106/106** (las 88 anteriores y las 18 `AUDIOGUIDE-*`), en Chromium headless con SwiftShader, 2026-10-02.

| Requisito | Resultado | Evidencia |
|---|---|---|
| Inventario completo (bienvenida, salas, obras; sin productos) | **PASS** | `INVENTORY`, `NO-PRODUCTS`, `AUDIOGUIDE-STUDIO-INVENTORY` |
| Studio: título, idioma, guion, transcripción, audio, duración, créditos, derechos, estado, orden | **PASS** | `AUDIOGUIDE-STUDIO-UPLOAD`, `AUDIOGUIDE-STUDIO-LOCALE` |
| La asociación sobrevive a la recarga | **PASS** para el texto; el audio se declara caducado, de forma honesta | `PERSIST`, `AUDIOGUIDE-PERSIST`, `AUDIOGUIDE-STALE-VISITOR` |
| Sin mezcla entre obras ni idiomas | **PASS** | `LOCALE-ISOLATION`, `ITEM-ISOLATION`, `AUDIOGUIDE-STUDIO-LOCALE` |
| Reproducir, pausar, reanudar, buscar, volumen y detener | **PASS** | `AUDIOGUIDE-PLAY`, `AUDIOGUIDE-KEYBOARD`, `AUDIOGUIDE-CONTROLS` |
| Una pista nueva detiene la anterior | **PASS** | `AUDIOGUIDE-ONE-TRACK` |
| Sin reproducción automática ni descargas al entrar | **PASS** | `AUDIOGUIDE-NO-AUTOPLAY` |
| Pausa al cerrar la ficha y al cambiar de sala, con aviso | **PASS** | `AUDIOGUIDE-SHEET-CLOSE`, `AUDIOGUIDE-ROOM-CHANGE` |
| No se mezcla con el ambiente ni con la narración | **PASS**: el ambiente baja al sonar y la voz sintética se calla | `AUDIOGUIDE-PLAY` (ducked) |
| Transcripción y estado sin audio | **PASS** | `AUDIOGUIDE-PANEL`, `PENDING`, `STALE` |
| La pieza sonora del Archivo se distingue de su cápsula | **PASS** | `AUDIOGUIDE-SOUND-PIECE` |
| Teclado y móvil | **PASS** en Chromium y en emulación 390 × 844 · **NO PROBADO** en un teléfono real | `AUDIOGUIDE-KEYBOARD-OPEN`, `AUDIOGUIDE-KEYBOARD`, `AUDIOGUIDE-MOBILE` |
| Sin errores de consola | **PASS** | `AUDIOGUIDE-VISITOR-CONSOLE`, `AUDIOGUIDE-STUDIO-CONSOLE` |
| Reproducción en un navegador con GPU real | 👁 **pendiente** de revisión humana (A-56) | — |

## Misión 5 (2026-10-02): la tienda como tienda

Rama propia (`mision5/tienda-del-museo`), separada de la PR #2 para revisarla aparte. Referencia: `docs/referencias/mision5-tienda-referencia.jpg` (recortada sin la barra del navegador).

**Antes:** una sala blanca con siete fotos de producto enmarcadas en las paredes, una peana y una cuerda de museo.

**Primera versión (descartada tras la revisión de Juanma):** muebles grandes de roble anaranjado junto a las paredes y el mostrador al fondo. Comparada con la referencia, fallaba en todo esto:

- no había dependienta;
- faltaban las categorías de llaveros, figuras y discos;
- la disposición y la proporción de los muebles no coincidían;
- los materiales no eran los de la referencia;
- no había cuadros en la pared del fondo ni cordón.

**Versión entregada:** reproduce la composición de la referencia. Se comparó de lado a lado con la imagen en cada iteración (`audit/comparar-*.jpg`).

| Elemento de la referencia | En la tienda |
|---|---|
| Mostrador claro en primer plano | ✅ marco de arce, frente claro |
| Caja registradora con visor | ✅ |
| Datáfono | ✅ |
| Tablero de llaveros | ✅ **producto** «Llaveros de la colección» |
| Bandeja de postales y posavasos | ✅ |
| Pila de libros azules | ✅ |
| Teléfono | ✅ en el lado de la dependienta (no se ve en la referencia, pero estaba en el encargo) |
| Dependienta con polo beige y logotipo, mano abierta | ✅ figura procedural |
| Vitrinas de arce y vidrio con cajones, dos por lado | ✅ 4 frontales y 2 laterales |
| Láminas enmarcadas | ✅ 3 **productos** y otras de decorado |
| Cerámica de terracota | ✅ |
| Libros y catálogos | ✅ el catálogo es **producto** |
| Figuras pintadas | ✅ **producto** «Figuras de madera» |
| Discos en soporte escalonado | ✅ **producto** «Vinilo "Sala de escucha"» |
| Peana con vasija tras un cordón | ✅ la réplica (**producto**) |
| Rótulo «Tienda de la Fundación» entre dos cuadros | ✅ |
| Cuadro en la pared derecha | ✅ |
| Techo con lucernario | ✅ cubierta con lucernarios y pared más baja (3,1 m) |

**Diferencias que quedan:**

- el campo de visión de la cámara es más estrecho que el de la imagen. Desde la entrada se ven enteras las vitrinas interiores; las exteriores, al girar o acercarse;
- la dependienta y las figuras son geometría procedural sencilla, no un modelo esculpido;
- las texturas son procedurales (veta, cubiertas, láminas): no hay fotografías.

### Defectos encontrados al desarrollarla

- **A-58:** toda ancla `WALL` a menos de 1 m de la pared se proyectaba sobre ella, y el producto quedaba detrás del fondo del mueble. Corregido con `surface: "FIXTURE"`.
- **Figuras y discos:** estaban en la misma vertical y E siempre elegía las figuras. Ahora están separados en horizontal.
- **Réplica:** el mostrador le quitaba E. Se acercó la peana y se reordenó el mostrador; el motor de proximidad no se tocó.
- **Vista de detalle de los productos 3D:** se cortaban, porque el ancla estaba en la base. El ancla marca ahora el centro visual.

### Validación de la misión 5

| Requisito | Resultado | Evidencia |
|---|---|---|
| Elementos de la referencia en 3D, incluida la dependienta | **PASS** | `SHOP-FIXTURES`; comparaciones con la imagen |
| Productos con sus identificadores, fichas y personalización; 3 nuevos | **PASS** | `SHOP-ROOM` (11), `SHOP-SHEET`, `SHOP-TEXT`, `SHOP-STUDIO` |
| Precios de demostración, sin compra ni datos personales | **PASS** | `SHOP-SHEET` |
| Colisiones y zona del personal | **PASS**: se para a 0,82 m de cada vitrina y a 1,1 m del mostrador | `SHOP-COLLIDE` |
| Selección de cada producto | **PASS**: 11 de 11 | `SHOP-SELECT` |
| Rendimiento | **PASS**: unas 55 llamadas y 9 000 triángulos | `SHOP-COST` |
| Avatar, móvil y otras salas | Ver `npm test` | `AVATAR shop`, `MOBILE-*` |

`SHOP-FIXTURES` y `SHOP-COLLIDE` fallan sobre el código anterior (`eaa54b3`) y pasan ahora.
