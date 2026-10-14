# 06 · Salas especiales

Las salas especiales demuestran capacidades de experiencia que un visor 3D genérico no tiene. Regla común heredada:

```text
DONANTE = TECNOLOGÍA · MUSEO = EXPERIENCIA
El museo no reconstruye la capacidad probada: la integra.
```

## Sala de Exposición Itinerante — Wet Paint

**Estado:** operativa. Integración con aprobación humana en el origen (`723b9df4`).

**Qué hace:** cada obra de la sala es un cuadro independiente con su propia fuente: imagen subida o colección Van Gogh. Un motor de pintura húmeda la transforma y el resultado se cuelga en la superficie de **esa misma** obra.

| Obra | Papel |
|---|---|
| 01 — Original | Punto de control: el medio original |
| 02 — Painterly | Reconstrucción pictórica: wet paint, impasto, crecimiento y revelado |
| 03 — Living | Superficie para movimiento procedural (flocking, evitación, atractores, respuesta al visitante) |
| 04 — Combined | Síntesis pictórico + procedural |
| 05 — Experimental | Reservada para presets y capacidades futuras |

**Cómo está construida:**

- **Donante:** `experiences/wet-paint-flow/`, build congelado y determinista de `Juanmaes83/wet-paint-flow` @ `0b9ba9a`.
  - Licencia MIT (Simon and contributors).
  - Escenas Van Gogh de dominio público; ver `ASSET_PROVENANCE.md`.
  - Única intervención documentada: un script que fuerza `preserveDrawingBuffer` para poder leer el frame pintado.
- **Adaptador:** `experiences/wet-paint-adapter.js` ejecuta el donante **oculto** en un iframe fuera de pantalla y maneja sus controles reales sin editarlo:
  - entrada `#source-upload`;
  - estado `window.__vangoghFlowState`;
  - captura del canvas tras `RESULT_READY`.
- **Controles:** solo en el Studio (`authoring/studio/wet-paint-studio-controls.js`). El visitante nunca ve la interfaz del donante.
- **Persistencia:** el estado de cada cuadro se guarda en `iw.wetpaint.personalization.v1` (navegador del autor).
- **Actualizar el donante:** se vuelve a ejecutar el build determinista contra un commit nuevo y se refrescan los hashes de `PRESERVATION.md`. No se edita a mano.

## Sala Breeze — Viento sobre mármol

**Estado: integrada, no validada.**

- Breeze Studio PRO V4.1 está en `experiences/breeze-studio-pro/`. Se importó de `escaparates-pro@382e566` en la rama `import/breeze-studio-pro` (@ `9ff10b3`):
  - sin el script de analítica de terceros;
  - sin las texturas originales de pétalo y hoja, sustituidas por texturas propias.
- El invitado de la sala carga `./experiences/breeze-studio-pro/index.html`.

**Qué es:** una instalación en la que una tela simulada en tiempo real (WebGPU) atraviesa la sala empujada por el viento y choca con una escultura. Funciones:

- fondo de imagen o vídeo;
- medio proyectado sobre la tela;
- opacidad y gradación de la tela;
- escala y posición;
- modos Prairie Cloth, Autumn Leaves y Sakura Petals, y presets Museum Cloth, Gallery Wind, Fashion Drapery y Product Reveal;
- Venus de Milo, plantillas generadas y CC0 de Khronos, y subida de GLB, glTF u OBJ;
- exportación a PNG o WebM;
- «Guardar en Museum», que persiste durante la sesión y al reentrar, pero no tras un F5.

**Robustez añadida en el museo:**

| Situación | Qué ve el visitante |
|---|---|
| Navegador sin WebGPU | «Esta sala necesita WebGPU», con salida a Galería B |
| La GPU detiene la simulación (pérdida del dispositivo) | «La instalación se ha detenido», con «Reintentar» y «Volver a Galería B» |
| Producto no servido en el despliegue | «Sala no disponible en esta edición», con salida |

Salidas siempre disponibles: botón-puente abajo a la izquierda (elevado para no tapar la barra «info» de Breeze), hotspot con `E` y botones del aviso.

**Pendiente:**

- 👁 **Validación visual** de la tela y el viento en un navegador con GPU real. En el entorno de pruebas (WebGPU emulado por CPU) el dispositivo se pierde a los pocos segundos, también con Breeze funcionando solo.
- **Licencias sin verificar:** Venus de Milo (Sketchfab, chiwei y Lanzi Luo), HDRI de Poly Haven y Fabric Lace 038 (3dtextures.me). No se publica en `main` hasta confirmarlas.
- El panel del producto mezcla inglés y español.
- Veredicto humano previo de la sala con la física real del donante: «KEEP FOR CONTINUATION» (2026-08-16), no visualmente final.

## Tienda del museo

**Decisión** ([GJR-009](08-DECISIONES.md)): la tienda es **una sala más del World**, no una página aparte ni una copia de código.

- **Construcción:** `space.shop`, de tipo `SHOP`, situada al oeste del Vestíbulo. El Scene Kit la construye como cualquier sala (hueco de puerta, rótulo, luz) a partir de sus límites y portales.
- **Integración automática:** aparece en el mapa, en «Contenido en texto», en el árbol del Studio y en la continuidad del avatar sin código específico.
- **Recorrido:** no forma parte del recorrido comentado, para no alterar el recorrido principal.

**Productos.** Son entidades del World con `subtype: "product"` y un bloque `content.product`:

```json
{ "category": "Reproducciones", "price": 35, "currency": "EUR", "visible": true, "order": 1, "demo": true }
```

- **Disposición** (misión 5, según `docs/referencias/mision5-tienda-referencia.jpg`):
  - al entrar, una línea frontal con el mostrador en el centro y dos vitrinas a cada lado;
  - detrás del mostrador, la zona de la dependienta, con la peana de la réplica tras un cordón, el rótulo «Tienda de la Fundación» entre dos cuadros y un cuadro nocturno en la pared derecha;
  - junto a la entrada, una vitrina en cada pared lateral;
  - la sala mide 7,5 × 9 m, con 3,1 m de pared bajo la cubierta con lucernarios.
- **Mobiliario** (`scene-kits/museum/shop-fixtures.js`, declarado en `space.metadata.shop.fixtures`):
  - **6 vitrinas** de arce claro (veta procedural) con base de dos cajones, cuatro baldas de vidrio con canto verde y fondo mentolado. Cada una va surtida por tema, como en la referencia:
    - láminas enmarcadas y catálogos;
    - cerámica y láminas;
    - libros;
    - figuras y discos;
    - papelería;
    - objetos.
  - **Mostrador** con marco de arce y frente claro: caja registradora con visor, datáfono, teléfono, bandeja de postales y posavasos, y una pila de libros y catálogos.
  - **Dependienta** detrás del mostrador: polo beige con logotipo, pelo castaño con flequillo, una mano abierta hacia el mostrador. Es decorado: no se mueve, no habla y no tiene aviso ni ficha.
  - **Cuadros, cordón y sombras de contacto** bajo cada mueble.
  - Es **decorado**: lo único a la venta son las entidades con `content.product`.
- **Exposición de productos:**
  - los planos (`ARTWORK`) ocupan los huecos de `space.metadata.shop.productSlots`. Cada hueco es una caja de 0,40 × 0,32 m en una balda: el producto se apoya en ella y el precio cuelga del canto como etiqueta, así que cualquier producto cabe en cualquier hueco al reordenarlos en el Studio;
  - los 3D (`OBJECT_3D` con `representation.profile: "shop-display"`) los construye el Scene Kit: el tablero de llaveros sobre el mostrador, las figuras y el soporte de discos. Su ancla marca el centro visual, que es lo que encuadra la vista de detalle;
  - las existencias de cada vitrina dejan libre el sitio de sus productos. Si un producto se oculta, su hueco se rellena.
- **Productos (11):**
  - 3 láminas, catálogo, postales, cuaderno, bolsa y réplica;
  - y, desde la misión 5, **llaveros**, **figuras de madera** y **vinilo «Sala de escucha»** (categoría nueva, «Música»).
  - Todos son de demostración, con ficha, precio ficticio, hotspot y edición en el Studio.
  - La réplica está tras el cordón: se elige mirándola desde la mitad derecha del mostrador (radio de 3,4 m).
- **Recorrido y colisiones:**
  - el visitante se detiene en el borde de cada vitrina y del mostrador (`SHOP-COLLIDE`);
  - no pasa detrás del mostrador;
  - cada producto se elige con E desde donde puede estar (`SHOP-SELECT`);
  - unas 55 llamadas de dibujo y 9 000 triángulos (`SHOP-COST`).
- **Anclas montadas en mueble:** las de los huecos llevan `"surface": "FIXTURE"`. El Scene Kit no las proyecta sobre la pared como al resto de anclas `WALL`; si lo hiciera, el producto quedaría detrás del fondo del mueble.
- **Cartela y ficha:** muestran el precio con la marca «demostración». La ficha añade «precio de demostración · tienda simulada, sin compra».
- **Imágenes:** son propias (`assets/shop/RIGHTS.md` y `assets/collection/RIGHTS.md`).

**Administración desde el Studio.** Los productos son nodos del árbol, marcados como «Producto». Campos reales:

| Campo | Dónde | Efecto en la visita |
|---|---|---|
| Nombre | Identidad · Título | Cartela, ficha, texto |
| Autoría o marca | Identidad · Autoría | Cartela, ficha |
| Imagen | Medios · Imagen (JPG, PNG, WebP) | Panel del expositor (**solo dura la sesión**; ver [04](04-STUDIO.md)) |
| Categoría | Tienda · Categoría (Reproducciones, Libros, Papelería, Objetos) | Línea bajo el título |
| Precio de demostración | Tienda · Precio (€) | Cartela y ficha, marcado como demostración |
| Orden | Tienda · Orden | Los productos de pared ocupan los expositores por este orden: norte (3), sur (3) y este (2) |
| Visibilidad | Tienda · Visible en la tienda | Un producto oculto sale del World: pared, ficha, hotspot y texto |
| Descripción | Personalizar más · Texto curatorial | Ficha |

**Flujo verificado** (`SHOP-STUDIO`): editar en el Studio → Guardar → Vista previa o Empezar → el producto aparece en la sala con su precio y su orden → su ficha lo muestra. Tras recargar como visitante, el cambio sigue ahí en ese mismo navegador.

**Fuera de alcance, deliberadamente:**

- pagos, carrito, envío, inventario o datos personales;
- **carrito simulado:** se propone para una fase posterior. No hace falta para entender la tienda y añadiría estado y una interfaz que distrae de la visita;
- crear productos nuevos desde el Studio. Igual que con las obras, hoy se añaden en el World; añadir y borrar piezas es la tarea 2.8 del ROADMAP;
- publicar para todos los visitantes. Como el resto del Studio, depende del backend (ROADMAP fase 2).

## Contrato de sala anidada (resumen)

- Una sala anidada se declara con `space.metadata.nestedRuntime` y `roomOrigin`.
- Solo una presentación es autoritativa. El museo sigue simulando (recorrido, Director y HUD) mientras el invitado presenta.
- El museo decide la cámara y el invitado la renderiza.
- La salida se hace siempre por un portal canónico del WorldGraph: botón-puente abajo a la izquierda, hotspot con `E` o el botón propio del invitado.
