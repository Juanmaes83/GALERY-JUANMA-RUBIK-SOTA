# 11 · Audioguía

Una audioguía narrada en tres niveles: **bienvenida**, **introducción de sala** y **cápsula de obra**. El visitante la abre desde la barra superior o desde la ficha de una obra. El autor la redacta y adjunta los audios en el Studio.

**Estado (2026-10-02):** el sistema funciona de extremo a extremo (Studio → visitante), con pruebas automáticas. **El museo no incluye todavía ninguna grabación.** Las 24 pistas tienen un borrador de texto compuesto a partir de las cartelas y fichas, marcado como borrador. Hasta que alguien grabe y publique los audios, el visitante lee la transcripción y ve «Pendiente de audio».

## Inventario

| Nivel | Cuántas | Referencia | Qué cubre |
|---|---|---|---|
| Bienvenida | 1 | `welcome` | El museo y la visita |
| Introducción de sala | 7 | `room:<spaceId>` | Una por sala, también Tienda, Archivo, Itinerante y Breeze |
| Cápsula de obra | 16 | `work:<entityId>` | Cada entidad con ficha (`interaction.focusable`), **menos los productos de la tienda** |

Total: **24 pistas** por idioma. La pieza sonora del Archivo (*Cinta 14*, `entity.audio.sala-de-escucha`) tiene su cápsula narrada **y**, aparte, una sección «Sonido propio de la obra». Así no se confunde la obra con su explicación. Su sonido propio no se reproduce en esta versión, y el panel lo dice.

## Modelo de contenido

Código: `app/audioguide/audioguide-model.js` (sin DOM; lo usan el Studio, el visitante y las pruebas de Node).

Cada pista, por idioma:

| Campo | Qué es |
|---|---|
| `title` | Título de la pista |
| `script` | El guion que se graba. Complementa la cartela, no la lee |
| `transcript` | Lo que el visitante lee. Siempre visible, haya audio o no |
| `credits`, `rights` | Voz, guion, grabación; licencia o permiso |
| `editorial` | `DRAFT` (Borrador) o `REVIEW` (Lista para revisión) |
| `durationMs` | Duración. Si hay archivo, la mide el navegador al subirlo |
| `audio` | `{ src, assetId, name, mimeType, bytes, durationMs }`, o `null` |

Las salas tienen además `order` (posición entre las introducciones).

**Dónde vive:**

- El World (`worlds/museum-v1.world.json` → `metadata.audioguide`) guarda los textos base del museo.
- El proyecto del Studio (`config.audioguide`, en `iw.museum.authoring.v1`) guarda lo que el autor cambia, campo a campo. Un campo vacío **hereda** el texto base, igual que el título de una obra.
- `applyConfigToWorld()` llama a `audioguideForWorld()`, que fusiona ambos y escribe en `world.metadata.audioguide` lo que lee el visitante. Cada pista sale con su estado calculado y con la URL reproducible, o sin audio.

**Idiomas:** cada idioma es una pista distinta. Nunca se toma prestado el guion, la transcripción ni el audio de otro idioma. El visitante solo ve el selector si hay más de un idioma con texto o audio. Un título suelto no basta para ofrecerlo.

**Estado** (calculado, nunca declarado a mano):

| Clave | Lo que lee el visitante y el autor | Cuándo |
|---|---|---|
| `AVAILABLE` | Disponible | Audio con URL permanente (aún no existe en este museo) |
| `AVAILABLE_SESSION` | Disponible en este navegador (solo esta sesión) | Audio subido en esta sesión del Studio |
| `STALE_AUDIO` | Audio no disponible: el archivo era de otra sesión | La referencia se guardó, el archivo no |
| `REVIEW` | Lista para revisión · pendiente de audio | Texto revisado, sin archivo |
| `PENDING_AUDIO` | Pendiente de audio | Texto, sin archivo |
| `DRAFT` | Borrador · sin guion | Ni guion ni transcripción |

## En el Studio

1. **Construir** → elige la institución (bienvenida), una sala o una obra. Al final del editor está el grupo **Audioguía**.
2. Elige el **idioma**. Escribe título, guion, transcripción, créditos y derechos. Marca el estado editorial.
3. **Audio de la pista:** MP3, M4A (AAC), Ogg o WAV. El navegador lo abre y mide su duración. Si no puede reproducirlo, lo dice y recomienda MP3 o M4A. Se puede escuchar antes de guardar y quitarlo.
4. **Visitante** → al final aparece el **inventario**: las 24 pistas con su estado y duración. Pulsar una abre su editor.
5. **Vista previa** o **Empezar experiencia** para escucharla como visitante.

**Qué se guarda y qué no (dicho en el propio editor):**

- Se guardan en **este navegador** el título, el guion, la transcripción, los créditos, los derechos, el estado, la duración y el orden.
- El **archivo de audio solo dura la sesión del Studio**, como cualquier subida (A-31, A-35). Al recargar, la pista pasa a «Audio no disponible: el archivo era de otra sesión». No se ofrece un botón de reproducir para un archivo que ya no existe.
- **No hay publicación compartida:** otros dispositivos no ven estos cambios. Para publicar audios hace falta un almacenamiento (decisión de backend, ROADMAP 2.1).

## Para el visitante

Código: `app/audioguide/audioguide-ui.js` y `audioguide.css`, instalados por arranque (`index.html`). La limpieza los retira entera, así que una reconstrucción del Studio nunca deja un segundo reproductor.

- Botón **Audioguía** en la barra superior: bienvenida, sala actual y la obra abierta.
- En la ficha de una obra: **Escuchar cápsula**, o **Cápsula (texto)** si no tiene audio.
- Controles: reproducir, pausar, reanudar, ±10 s, detener (vuelve al principio) y volumen. Muestra el tiempo, la duración, el idioma, el estado, la transcripción y los créditos.

Reglas:

- **Nada suena sin pulsar.** El elemento `<audio>` no existe hasta el primer «Reproducir» (`preload="none"`), y no se descarga ningún audio al entrar.
- **Una sola voz.** Hay un único reproductor: una pista nueva detiene la anterior. Al sonar, se calla la voz sintética del recorrido comentado (`speechSynthesis`) y el ambiente baja al 25 % (`AudioDirector.duck`). Si el recorrido habla, la audioguía se pausa. La audioguía no se mezcla con Breeze ni con Wet Paint, que no tienen sonido propio.
- **Pausas predecibles, siempre con aviso:**
  - cambiar de sala pausa cualquier pista;
  - cerrar la ficha pausa la cápsula de esa obra;
  - cambiar de idioma detiene la pista.
- **Teclado:** todo es un botón o un control nativo con etiqueta. Enter o Espacio en un control de la audioguía no llega al atajo «E/Enter» del museo, así que no se activa a la vez lo que esté cerca. Al redibujar, el foco se queda en el mismo control.
- **Móvil:** el panel se coloca bajo la barra, con márgenes de 16 px, una altura máxima del 50 % y botones de 44 px.

## Pruebas

- `tests/audioguide.test.mjs` (Node, 19 comprobaciones) cubre:
  - el inventario de 24 pistas y que no haya cápsulas de productos;
  - los textos base, y que no se declare ningún audio que no exista;
  - la herencia, el aislamiento entre idiomas y entre obras, y la persistencia (ida y vuelta en JSON);
  - los estados, y lo que recibe el visitante.
- `tests/museum-smoke.mjs`, sección 3b (`AUDIOGUIDE-*`, 18 comprobaciones) cubre:
  - sin reproducción automática, el panel, el teclado y la pieza sonora;
  - en el Studio: la subida con duración medida, el idioma y el inventario;
  - en el visitante: reproducir, la tecla Enter, avanzar, el volumen, detener, el cierre de la ficha, una sola pista y el cambio de sala;
  - tras recargar: la persistencia del texto y el audio caducado;
  - el móvil y la consola.
- Los audios de las pruebas son tonos WAV generados por la propia prueba. **No son contenido.**

**Límite del entorno:** con SwiftShader (sin GPU), dibujar cada fotograma satura el hilo principal y el `<audio>` no pasa de `readyState 0`. Con el bucle parado, la misma pista carga y suena. La prueba mantiene el bucle (eventos y cambios de sala reales) y solo deja de dibujar mientras comprueba el audio. **La reproducción en un navegador con GPU real no está verificada por una persona.**

## Pendiente

- **Grabaciones reales:** guion revisado, voz, derechos. Hoy no hay ninguna.
- **Publicar audios** para todos los visitantes: requiere almacenamiento y la decisión de backend (2.1).
- Revisión editorial de los 24 borradores (hoy son composiciones automáticas de cartela y ficha).
- Otros idiomas: el sistema los admite, pero no hay contenido.
- El sonido propio de *Cinta 14*.
- Revisión humana en dispositivos reales: escritorio con GPU, iOS Safari y Android Chrome.
