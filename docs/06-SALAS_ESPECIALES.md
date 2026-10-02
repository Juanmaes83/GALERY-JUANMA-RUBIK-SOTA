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

- **Exposición:** los productos de pared (`ARTWORK`) se cuelgan enmarcados en los huecos que lista `space.metadata.shop.productSlots`. La réplica (`SCULPTURE`) va en su peana.
- **Cartela y ficha:** muestran el precio con la marca «demostración». La ficha añade «precio de demostración · tienda simulada, sin compra».
- **Imágenes:** son propias (`assets/shop/RIGHTS.md` y `assets/collection/RIGHTS.md`).

**Administración desde el Studio.** Los productos son nodos del árbol, marcados como «Producto». Campos reales:

| Campo | Dónde | Efecto en la visita |
|---|---|---|
| Nombre | Identidad · Título | Cartela, ficha, texto |
| Autoría o marca | Identidad · Autoría | Cartela, ficha |
| Imagen | Medios · Imagen (JPG, PNG, WebP) | Panel en la pared (**solo dura la sesión**; ver [04](04-STUDIO.md)) |
| Categoría | Tienda · Categoría (Reproducciones, Libros, Papelería, Objetos) | Línea bajo el título |
| Precio de demostración | Tienda · Precio (€) | Cartela y ficha, marcado como demostración |
| Orden | Tienda · Orden | Los productos de pared ocupan los huecos por este orden |
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
