# Museo Fundación Arenas — GALERY JUANMA · RUBIK SOTA

Un museo web en 3D con varias salas. Se recorre en primera persona o, de forma opcional, con un avatar en tercera persona. Esta versión es autónoma: se extrajo del módulo `labs/immersive-worlds` de `escaparates-pro`. El repositorio contiene solo lo necesario para la visita: salas, recorrido, avatar, obras, la escultura 3D **Marble Bust 01**, sus assets, el código, las licencias y las pruebas.

> **Estado real:** prototipo **candidato**, sin aprobación de producto.
> La integración de Marble Bust 01 (PR #85 del origen) **sigue pendiente del veredicto visual humano KEEP o ADJUST**. Esta extracción no la aprueba.
> La Sala Breeze **no está operativa en esta edición** (ver [Limitaciones](#limitaciones-conocidas)).

Todo el contenido es ficticio. La Fundación Arenas, sus obras, sus autores y los textos de sala son inventados.

---

## Requisitos

- **Navegador con WebGL2** (Chrome, Edge, Firefox o Safari recientes). Sin WebGL2 el museo muestra un aviso y remite al contenido en texto (`worlds/museum-v1.world.json`).
- **Node.js ≥ 20**, solo para el servidor local y las pruebas. El museo no tiene paso de build: usa módulos ES nativos, un `importmap` y three.js r0.185.1 incluido en `vendor/`.
- Para servir los archivos hace falta un servidor HTTP. Los módulos ES no funcionan abriendo el archivo con `file://`.

## Instalación y ejecución local

```bash
npm install          # solo instala playwright (dev) para las pruebas
npm start            # http://127.0.0.1:4180/
```

`npm start` ejecuta `node tools/serve.mjs`, un servidor estático sin dependencias. Vale cualquier otro servidor estático que sirva la raíz del repositorio.

### Pruebas

```bash
npm run check        # comprobación estática (sin navegador)
npm test             # check + prueba de humo en Chromium (Playwright)
```

- `tools/check-static.mjs` comprueba:
  - la sintaxis de todos los JS y que todos los JSON parsean;
  - que cada referencia local del grafo de dependencias, desde `index.html`, resuelve a un archivo existente;
  - las rutas de medios del World;
  - el SHA-256 de Marble Bust 01 contra su registro de procedencia.
- `tests/museum-smoke.mjs` comprueba:
  - el arranque y las invariantes arquitectónicas del runtime;
  - el paso por las seis salas a través de los portales;
  - el aviso y la salida de la Sala Breeze;
  - Marble Bust 01 en modo GLB y en fallback forzado;
  - que `?authoring=1` no monta ningún editor.

  Usa SwiftShader (render por software), así que sus tiempos no miden el rendimiento en un dispositivo real.
- Si Chromium no está instalado: `npx playwright install chromium`.

---

## Recorrido

El World (`worlds/museum-v1.world.json`) define 6 salas, 18 entidades, 10 portales y un recorrido comentado:

| Sala | Contenido | Estado en esta edición |
|---|---|---|
| **Vestíbulo** | Bienvenida institucional | Operativa |
| **Galería A — Horizontes** | 4 obras, *Vasija de arenas* y **Marble Bust 01** (GLB, peana, cartela y luz propia) | Operativa · Marble Bust pendiente de veredicto humano |
| **Galería B — Cámara oscura** | 2 obras y la proyección *Cuaderno de luz* | Operativa |
| **Archivo — Sala de escucha** | Pieza sonora y nota de cierre | Operativa |
| **Sala de Exposición Itinerante — Wet Paint** | 5 variantes de obra; incluye Wet Paint Flow, una experiencia anidada | Operativa |
| **Sala Breeze — Viento sobre mármol** | Instalación en Breeze Studio PRO V4.1 | **No incluida:** la sala muestra un aviso y un botón para volver a Galería B |

Conexiones: Vestíbulo ↔ Galería A ↔ Galería B. Desde la Galería A se pasa al Archivo; desde la Galería B, a la Sala Breeze y a la Sala Itinerante.

El **recorrido comentado** (tecla `G`) tiene cuatro capítulos: Vestíbulo, Horizontes, Cámara oscura y Breeze. El último llega a la sala que en esta edición está sustituida por el aviso.

### Avatar (Character 2027)

La visita por defecto es en primera persona (POV). El avatar en tercera persona se activa con parámetros de URL. Cada capa requiere las anteriores:

| URL | Capa |
|---|---|
| `?character=1` | Presencia del avatar en Galería A (fase 3) |
| `?character=1&mobility=1` | Movilidad libre en tercera persona con colisión (fase 4A) |
| `…&continuity=1` | Continuidad entre salas (fase 4B) |
| `…&gatea=1` | Capacidades de fase 6, Gate A |
| `…&continuity=1&gatea=1&tour=1` | Puente con el recorrido comentado |
| `…&continuity=1&gatea=1&cinematic=1` | Cámara cinematográfica del personaje |

El modelo del avatar (`Avatar_1.glb`, 30 MB) **no está en el repositorio**. Se descarga en tiempo de ejecución desde un bucket externo (`pub-0f344e596c324724a0b7300e3bc1d129.r2.dev`) y se verifica con SHA-256 antes de usarlo. Si ese host no responde, el avatar no aparece y el museo muestra el error `CHARACTER GATE ERROR`. El resto de la visita no se ve afectado. Más detalles en [docs/EXTRACTION_AUDIT.md](docs/EXTRACTION_AUDIT.md).

## Controles

| Acción | Teclado / ratón | Móvil |
|---|---|---|
| Moverse | `W A S D` / flechas | Mitad izquierda de la pantalla |
| Mirar | Ratón (o `←` `→`) | Mitad derecha de la pantalla |
| Activar lo cercano (obra, portal) | `E` o `Enter` | — (no verificado en esta extracción) |
| Salir del detalle o del recorrido | `Esc` | — |
| Mapa de salas | `M` | Botón «Mapa» |
| Recorrido comentado | `G` | Botón «Recorrido comentado» |
| En detalle: obra anterior/siguiente | `←` `→` | — |
| En detalle: acercar | Rueda del ratón | — |

Parámetros útiles: `?tier=LOW|MEDIUM|HIGH`, `?reducedMotion=1`, `?state=<estado determinista>` (por ejemplo `museum:marble-bust-detail`), `?glbStone=fallback` (fuerza el respaldo de Marble Bust 01) y `?visualStone=baseline`.

Desde la consola del navegador: `await window.__IW.assertInvariants()`, `window.__IW.report()` y `window.__IW.states`.

---

## Estructura

```text
index.html            Punto de entrada de la visita (importmap de three)
app/                  Shell de la experiencia: HUD, entrada, audio, salas anidadas
engine/               Motor semántico (sin Three.js ni DOM)
render/               Host de Three.js y carga de medios
scene-kits/museum/    Representación museística: arquitectura, obras, GLB y fallback
worlds/               museum-v1.world.json: salas, obras, portales y recorrido
character/            Avatar Character 2027 (capas activadas por URL)
experiences/          Puente de Wet Paint y Wet Paint Flow congelado (MIT)
authoring/            Configuración y capas de visitante. Incluye código de Studio
                      que el runtime importa de forma estática; el Studio no se
                      monta en esta edición
qa/deterministic-states.js  Estados deterministas (los importa el runtime)
assets/               Colección propia, Marble Bust 01 y su procedencia
vendor/three/         three.js r0.185.1 (MIT) y addons
docs/                 Auditoría de extracción y registros de la colección
tools/ · tests/       Servidor local, comprobación estática y prueba de humo
```

## Despliegue

Es un sitio estático. Se publica la raíz del repositorio tal cual: no hay comando de build ni directorio de salida distinto. En Vercel corresponde al framework «Other», sin build command y con output directory `.`. Por ahora no existe ningún proyecto de hosting conectado a este repositorio.

---

## Licencias y procedencia

| Componente | Licencia | Dónde |
|---|---|---|
| **Marble Bust 01**, de Rico Cilliers (Poly Haven) | **CC0 1.0** | `assets/models/sculpture/marble_bust_01_1k.provenance.json` y `docs/MUSEUM_GLB_MARBLE_BUST_PILOT_2026-09-02.md` |
| three.js r0.185.1 | MIT | `vendor/three/LICENSE` y `vendor/three/VENDOR.md` |
| Wet Paint Flow (build congelado de `wet-paint-flow` @ `0b9ba9a`) | MIT, © 2026 Simon and contributors | `experiences/wet-paint-flow/LICENSE`, `THIRD_PARTY_NOTICES.md` y `PRESERVATION.md` |
| Escenas de Van Gogh de Wet Paint Flow | Dominio público (The Met Open Access/CC0, PD-Art) | `experiences/wet-paint-flow/ASSET_PROVENANCE.md` |
| Colección de la Fundación Arenas | Obra propia generada | `assets/collection/RIGHTS.md` |
| Avatar `Avatar_1.glb` (remoto) | **No documentada en el origen** | Ver la auditoría |
| Código propio del museo | **Sin licencia declarada**: decisión pendiente del titular | — |

El resumen completo de terceros está en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Limitaciones conocidas

1. **Sala Breeze no incluida.** La sala ejecuta Breeze Studio PRO V4.1, que es un producto independiente:
   - vive en `escaparates-pro/labs/website-modules-source/breeze-studio-pro/` (44 MB);
   - el código es MIT de Niklas Niehus;
   - incluye assets con licencias mixtas: Sketchfab, Vecteezy, Poly Haven y Khronos;
   - necesita WebGPU.

   No se ha copiado porque el encargo excluye otros productos y porque sus licencias requieren revisión. Esta edición comprueba si está presente y, si no, muestra un aviso con salida a Galería B. Incluirlo requiere autorización expresa.
2. **Defectos heredados del origen**, reproducidos en `escaparates-pro@382e566`:
   - en las salas anidadas, la barra superior del HUD tapa el botón-puente «← Galería B»;
   - el aviso de proximidad de la Sala Breeze dice «Volver a la Galería A»;
   - la tecla `E` no saca de la sala.

   En esta edición, el botón del aviso garantiza la salida.
3. **Avatar dependiente de un host externo** y con licencia no documentada (ver la auditoría). En el entorno de esta extracción, ese host estaba bloqueado por la política de red, así que **el avatar no se pudo validar**.
4. Sin auditoría de accesibilidad independiente ni medición de rendimiento en dispositivos reales.

## Roadmap

Estado heredado del origen (líneas de trabajo de `escaparates-pro`) y pasos propios de este repositorio:

| Línea | Estado |
|---|---|
| Salas Vestíbulo, Galería A, Galería B, Archivo e Itinerante Wet Paint | Integradas (línea PR #61) |
| Character 2027, fases 3, 4A y 4B, Avatar Studio (fase 5) y fase 6 (Gate A, puente con el recorrido, cámara cinematográfica) | Integradas en la línea PR #61 (merges `54d948f`, `6c007f4` y `3581ec4`). La fase 4B consta como cerrada tras aprobación humana; en las fases 5 y 6, esta extracción solo ha verificado el merge |
| Piedra visual *Vasija de arenas* premium (PR #84) | Integrada en la línea PR #61 |
| **Marble Bust 01 (PR #85)** | **Candidata: pendiente de veredicto visual humano KEEP o ADJUST** |
| Recuperación del avatar a través de la vista previa de Studio y elección POV/avatar al entrar (PR #83) | **No incluida:** borrador pendiente de gate humano y basado en un commit anterior |
| Traspaso del Character al mundo exterior completo (`…phase6-exterior-full-world-v1`) | No incluido: sin fusionar en la línea canónica |
| Sala Breeze en este repositorio | Pendiente de autorización (alcance y licencias) |
| Alojar el avatar en un origen controlado y documentar su licencia | Pendiente |
| Licencia del código propio | Pendiente del titular |
| Preview público | Pendiente: no hay proyecto de hosting conectado |
