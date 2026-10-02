# 03 · Mundo y contenido

## El World

`worlds/museum-v1.world.json` es la **fuente de verdad semántica** del museo. Es solo datos: nada visual vive aquí.

| Colección | Cantidad | Qué es |
|---|---:|---|
| `spaces` | 7 | Salas, con sus referencias a anclajes, entidades, hotspots y portales |
| `anchors` | 76 | Referencias espaciales (DÓNDE): llegadas, muros, peanas, puertas, posiciones de guía |
| `entities` | 27 | Obras, esculturas, proyección, audio, textos e instalaciones (QUÉ) |
| `hotspots` | 37 | Disparadores de proximidad (CUÁNDO) con una Action (`FOCUS_ENTITY`, `ACTIVATE_PORTAL`, `PLAY_MEDIA`, `START_ROUTE`) |
| `portals` | 12 | Conexiones entre salas (por dónde se pasa), con transición, precarga y política de retorno |
| `chapters` | 4 | Capítulos del recorrido |
| `storySteps` | 40 | Beats del recorrido |
| `routes` | 1 | `route.comentado` |

`metadata.audioguide` guarda los textos base de la audioguía: bienvenida, 7 salas y 16 obras, en español, todos en borrador y sin audio ([11-AUDIOGUIA](11-AUDIOGUIA.md)).

Vocabulario: **ANCHOR = DÓNDE · HOTSPOT = DISPARO · ACTION = QUÉ · PORTAL = CONEXIÓN · STORY STEP = ORQUESTACIÓN.**

El validador (`engine/schema/validate.js`) aplica las invariantes al cargar. Un World inválido no arranca y muestra su error.

## Salas y obras

Toda la Fundación Arenas, sus artistas y sus obras son **ficticios**. Las excepciones con autoría real son:

- Marble Bust 01 (CC0);
- las escenas de Van Gogh de Wet Paint (dominio público);
- la instalación de la Sala Breeze: código MIT de Niklas Niehus, con las licencias de la Venus, los HDRI y la tela **pendientes** (ver `experiences/breeze-studio-pro/IMPORT_NOTES.md`).

| Sala | Entidades |
|---|---|
| **Vestíbulo** | *Colección permanente*, cartela de bienvenida |
| **Galería A — Horizontes** | *Horizonte interrumpido* y *Campo de ceniza* (Amalia Serrat); *División tercera* y *Estudio de figura, IV* (Bruno Ferrán); escultura *Vasija de arenas* (Teresa Miralles); **Marble Bust 01 — estudio de material** (Rico Cilliers, GLB CC0, *pendiente de veredicto humano*) |
| **Galería B — Cámara oscura** | *Noche de invierno* (Jonás Vilar), *Marea baja* (Teresa Miralles), proyección *Cuaderno de luz* (Jonás Vilar) |
| **Archivo — Sala de escucha** | Pieza sonora *Cinta 14: taller, tarde*, *Nota de cierre* |
| **Sala Itinerante — Wet Paint** | 01 Original · 02 Painterly · 03 Living · 04 Combined · 05 Experimental (ver [06](06-SALAS_ESPECIALES.md)) |
| **Sala Breeze — Viento sobre mármol** | Instalación de tela y viento sobre escultura (Breeze Studio PRO, WebGPU). Integrada en `import/breeze-studio-pro`; **no validada en GPU real** (ver [06](06-SALAS_ESPECIALES.md)) |
| **Tienda del museo** | 8 productos de demostración: 3 láminas, catálogo, postales, cuaderno, bolsa y una réplica de la *Vasija de arenas* en peana; más el rótulo «Tienda de demostración». Precios ficticios, sin compra (ver [06](06-SALAS_ESPECIALES.md#tienda-del-museo)) |

Grafo: Tienda ↔ Vestíbulo ↔ Galería A ↔ Galería B. Desde la Galería A se pasa al Archivo; desde la Galería B, a la Sala Breeze y a la Itinerante. Todas las salas son alcanzables desde el inicio (`INV-GRAPH-CONNECTED`).

## Orientación y salida

- **Salida:** la visita termina en la puerta de salida del Vestíbulo. Es un hotspot con la acción `END_VISIT`: el motor emite `visit:end-requested` y la aplicación decide qué significa salir (confirmar, despedirse, volver a empezar). El botón «Salir» de la barra superior abre el mismo diálogo desde cualquier sala.
- **Señales verdes de salida** (persona y flecha, «SALIDA»): las coloca el Scene Kit a partir del grafo, no se escriben a mano. En cada sala se señala la puerta que inicia el camino más corto hasta la sala de la salida, con la flecha hacia esa puerta. Si una obra ocupa el sitio, la señal sube sobre el rótulo de la puerta con la flecha hacia arriba. Una sala sin ruta no tiene señal. `npm test` comprueba cada ruta (`EXIT-SIGNS`, `EXIT-ROUTE`). Es orientación dentro de una visita virtual, **no** señalización de seguridad de un edificio.
- **Obra cercana:** la obra que nombra el aviso «E · Observar de cerca…» se resalta: el marco se calienta y aparece un filete fino a su alrededor, o un anillo en el suelo si es una pieza exenta. Solo se resalta una, la que está **delante** del visitante, aunque haya otra en la esquina. Una obra que queda de lado o detrás no se ofrece. Abrir la ficha siempre es una acción intencional (E, Intro o tocar el aviso); acercarse no la abre.
- **Puerta u obra con E:** se mide la distancia en planta (la altura del ancla no cuenta: una puerta se ancla en el suelo y un cuadro a la altura de los ojos) y se pondera por la orientación: lo que está delante cuenta a su distancia, a 90° vale 1,5 veces y detrás 2 veces. Una puerta detrás sigue siendo elegible (se puede salir de espaldas); una obra de lado o detrás, no. Cada puerta de cada sala tiene su hotspot `ACTIVATE_PORTAL` (`SPATIAL-DOOR-HOTSPOTS`).
- **Puertas libres:** ninguna obra de pared puede quedar a menos de 0,5 m del hueco de una puerta en la misma pared (`SPATIAL-DOORWAYS-CLEAR`). *Marea baja* cuelga en la pared este de la Galería B a 2,1 m del paso a Breeze.
- **Cuerdas:** las coloca el Scene Kit delante de la pared con más obra (no se escriben a mano). Se cortan alrededor de cada puerta de esa pared con 0,6 m libres a cada lado, y si entre el extremo de una cuerda y la pared queda un hueco de menos de 1,1 m (por el que se entra pero no se gira), la cuerda llega hasta la pared. Ninguna llegada queda entre la pared y la cuerda (`SPATIAL-ROPES-OPEN`).
- **Sala Itinerante (Wet Paint):** las cinco obras recorren la sala en bucle desde la puerta norte y en su orden: *01 Original* en la pared oeste, *02 Painterly* y *03 Living* en la sur (la que mira a quien entra, protegida por la cuerda), *04 Combined* en la este y *05 Experimental* en la norte, a 2,6 m de la puerta.

## Medios y derechos

```json
"media": {
  "kind": "IMAGE",
  "src": "../assets/collection/horizonte-interrumpido.jpg",
  "aspect": 1.46,
  "credit": "Fundación Arenas — colección ficticia (imagen propia)",
  "rights": "Obra propia. Uso libre dentro del producto."
}
```

- `kind` puede ser `IMAGE`, `VIDEO`, `AUDIO` o `GENERATED`.
- Las rutas son relativas al archivo del World, así que una institución guarda su colección junto a su definición.
- **Sin `rights`, el validador rechaza el medio.** Quien cuelga un archivo debe poder decir de quién es.
- Si un archivo falla, aparece la lámina generada y se emite `ASSET_ERROR`. La sala no se rompe.
- La colección propia está en `assets/collection/`, con su registro de derechos en `RIGHTS.md`.

## El recorrido comentado

Contrato heredado (`MUSEUM_GUIDED_TOUR_CONTRACT.md`):

| Término | Significado | Numerado |
|---|---|---|
| **Beat** | Un `StoryStep`: guiar, cruzar un portal, plano acompañado, ceder el paso | No |
| **Parada (Tour Step)** | Lo que el visitante percibe como *una parada*: uno o varios beats seguidos | **Sí, 01…N** |
| **Estado QA** | Pose determinista para pruebas; no forma parte del recorrido | No |

- **El orden vive en un único sitio:** `routes[0].chapterRefs → chapters[].stepRefs → storySteps`.
- Un beat abre parada si lleva `tourStep: { title }`. No lleva número: el número es su posición. Por eso la numeración es contigua por construcción.
- **Para reordenar el recorrido, se reordena `stepRefs`.** No hay otro sitio que editar.
- Gramática de cada obra en el recorrido: **A** contexto/llegada → **B** atención compartida → **C** contemplación humana → **D** punto de vista puro sobre la obra (con navegación opcional por la colección `← →` y retorno exacto al origen guiado).

## Cómo añadir contenido

### Una obra bidimensional (imagen o vídeo)

1. Copiar el archivo en `assets/collection/` y documentar su derecho en `RIGHTS.md`.
2. Añadir a `anchors` un anclaje de muro con `spaceId`, `position` y `normal`.
3. Añadir la entidad `ARTWORK` con su `content` (título, autor, año, técnica, descripción y `media` con `rights`), su `anchorId`, `accessibility` e `interaction.hotspotRefs`.
4. Añadir el hotspot con `FOCUS_ENTITY`.
5. Registrar los ids en `entityRefs`, `anchorRefs` y `hotspotRefs` de la sala.
6. Ejecutar `npm test`: el validador y las invariantes avisan de cualquier incoherencia.

El Studio puede sustituir el medio y los textos de una obra **existente** sin tocar el JSON (ver [04](04-STUDIO.md)). Crear obras nuevas desde el Studio no está implementado.

### Una escultura GLB

Patrón probado con Marble Bust 01:

- El World nombra un **perfil de presentación**: `representation.profile`.
- `scene-kits/museum/model-assets.js` es la única capa que sabe qué binario lo realiza, con su ruta, licencia y presupuesto.
- `builders.js` construye la peana, la luz, la cartela y el fallback.
- La procedencia va junto al binario (`*.provenance.json`), con su SHA-256.

**Limitación actual:** `museum-scene-kit.js` solo reconoce el perfil `plinth-glb-marble-bust-v1`. Añadir otra escultura GLB exige generalizar esa comprobación a cualquier perfil del registro; está en el roadmap.

Presupuesto de referencia del piloto:

- GLB autocontenido 1K de unos 0,9 MB y 17 456 triángulos;
- 1 material PBR, sin animaciones ni extensiones requeridas.
