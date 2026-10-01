# 03 · Mundo y contenido

## El World

`worlds/museum-v1.world.json` es la **fuente de verdad semántica** del museo. Es solo datos: nada visual vive aquí.

| Colección | Cantidad | Qué es |
|---|---:|---|
| `spaces` | 6 | Salas, con sus referencias a anclajes, entidades, hotspots y portales |
| `anchors` | 59 | Referencias espaciales (DÓNDE): llegadas, muros, peanas, puertas, posiciones de guía |
| `entities` | 18 | Obras, esculturas, proyección, audio, textos e instalaciones (QUÉ) |
| `hotspots` | 25 | Disparadores de proximidad (CUÁNDO) con una Action (`FOCUS_ENTITY`, `ACTIVATE_PORTAL`, `PLAY_MEDIA`, `START_ROUTE`) |
| `portals` | 10 | Conexiones entre salas (por dónde se pasa), con transición, precarga y política de retorno |
| `chapters` | 4 | Capítulos del recorrido |
| `storySteps` | 40 | Beats del recorrido |
| `routes` | 1 | `route.comentado` |

Vocabulario: **ANCHOR = DÓNDE · HOTSPOT = DISPARO · ACTION = QUÉ · PORTAL = CONEXIÓN · STORY STEP = ORQUESTACIÓN.**

El validador (`engine/schema/validate.js`) aplica las invariantes al cargar. Un World inválido no arranca y muestra su error.

## Salas y obras

Toda la Fundación Arenas, sus artistas y sus obras son **ficticios**. Las excepciones son las obras invitadas reales con licencia: Marble Bust 01 (CC0), Viento sobre mármol y las escenas de Van Gogh de Wet Paint (dominio público).

| Sala | Entidades |
|---|---|
| **Vestíbulo** | *Colección permanente*, cartela de bienvenida |
| **Galería A — Horizontes** | *Horizonte interrumpido* y *Campo de ceniza* (Amalia Serrat); *División tercera* y *Estudio de figura, IV* (Bruno Ferrán); escultura *Vasija de arenas* (Teresa Miralles); **Marble Bust 01 — estudio de material** (Rico Cilliers, GLB CC0, *pendiente de veredicto humano*) |
| **Galería B — Cámara oscura** | *Noche de invierno* (Jonás Vilar), *Marea baja* (Teresa Miralles), proyección *Cuaderno de luz* (Jonás Vilar) |
| **Archivo — Sala de escucha** | Pieza sonora *Cinta 14: taller, tarde*, *Nota de cierre* |
| **Sala Itinerante — Wet Paint** | 01 Original · 02 Painterly · 03 Living · 04 Combined · 05 Experimental (ver [06](06-SALAS_ESPECIALES.md)) |
| **Sala Breeze — Viento sobre mármol** | Instalación de tela y viento sobre escultura (Breeze Studio PRO). **No migrada** (ver [06](06-SALAS_ESPECIALES.md)) |

Grafo: Vestíbulo ↔ Galería A ↔ Galería B. Desde la Galería A se pasa al Archivo; desde la Galería B, a la Sala Breeze y a la Itinerante. Todas las salas son alcanzables desde el inicio (`INV-GRAPH-CONNECTED`).

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
