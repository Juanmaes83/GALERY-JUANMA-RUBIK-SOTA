# Museo Fundación Arenas — GALERY JUANMA · RUBIK SOTA

Un museo web en 3D de varias salas que se recorre en primera persona o con avatar. Incluye un **Studio** para personalizarlo sin código. Este es el **repositorio canónico** del museo ([GJR-001](docs/08-DECISIONES.md)). Procede de `escaparates-pro/labs/immersive-worlds` @ `382e566`.

> **Estado real:** prototipo avanzado, no terminado. Ver [ROADMAP.md](ROADMAP.md).
> - Cinco salas operativas y Studio funcionando, cubiertos por pruebas.
> - **Avatar**: alojado en el repositorio y navegable en las seis salas según las pruebas automáticas. **Pendiente de validación visual humana.**
> - **Marble Bust 01** pendiente del veredicto visual humano KEEP o ADJUST.
> - **Sala Breeze** integrada (Breeze Studio PRO V4.1, requiere WebGPU). **No validada**: falta la prueba en una GPU real. Licencias de la Venus, Poly Haven y Fabric Lace **pendientes**.
> - Lo que se personaliza en el Studio **solo se guarda en el navegador del autor**; todavía no hay publicación.

Todo el contenido de la Fundación Arenas es ficticio.

---

## Empezar

```bash
npm install          # solo playwright (dev), para las pruebas
npm start            # http://127.0.0.1:4180/
```

| Superficie | URL |
|---|---|
| Visita | `http://127.0.0.1:4180/` |
| **Studio** (panel de personalización) | `http://127.0.0.1:4180/index.html?authoring=1` |
| Visita con avatar | Elegir «Con mi avatar» en la entrada, o `…/index.html?character=1&mobility=1&continuity=1&gatea=1` |
| Encuadre de Marble Bust 01 | `…/index.html?state=museum:marble-bust-detail` |

Requisitos:

- navegador con **WebGL2**;
- Node.js ≥ 20 solo para servir y probar;
- no hay paso de build: módulos ES nativos y three.js r0.185.1 incluido en `vendor/`;
- hay que servirlo por HTTP; con `file://` no funciona.

```bash
npm run check        # comprobación estática: sintaxis, JSON, referencias, medios y hash del GLB
npm test             # check + prueba en Chromium: salas, Breeze, Marble Bust, Studio y consola
```

CI: `.github/workflows/test.yml` ejecuta `npm test` en cada PR.

## Controles

| Acción | Teclado / ratón | Móvil |
|---|---|---|
| Moverse | `W A S D` / flechas | Mitad izquierda de la pantalla |
| Mirar | Ratón (o `←` `→`) | Mitad derecha de la pantalla |
| Activar lo cercano (obra o puerta) | `E` o `Enter` | — |
| Salir del detalle o del recorrido | `Esc` | — |
| Mapa | `M` | Botón «Mapa» |
| Recorrido comentado | `G` | Botón «Recorrido comentado» |
| En detalle: obra anterior o siguiente / acercar | `←` `→` / rueda | — |

## Salas

| Sala | Estado |
|---|---|
| Vestíbulo · Galería A (4 obras, *Vasija de arenas*, **Marble Bust 01**) · Galería B (2 obras y proyección) · Archivo (sala de escucha) · Itinerante **Wet Paint** | Operativas |
| **Breeze**: tela y viento sobre escultura, con Breeze Studio PRO y WebGPU | Integrada, **no validada en GPU real**. Sin WebGPU, o si la GPU detiene la simulación, la sala lo explica y ofrece salida ([06](docs/06-SALAS_ESPECIALES.md)) |

## Documentación

Todo el proyecto está documentado en [docs/](docs/README.md):

1. [Visión y producto](docs/01-VISION_Y_PRODUCTO.md)
2. [Arquitectura](docs/02-ARQUITECTURA.md)
3. [Mundo y contenido](docs/03-MUNDO_Y_CONTENIDO.md)
4. [Studio](docs/04-STUDIO.md)
5. [Personaje y avatar](docs/05-PERSONAJE_AVATAR.md)
6. [Salas especiales](docs/06-SALAS_ESPECIALES.md)
7. [Calidad y pruebas](docs/07-CALIDAD_Y_PRUEBAS.md)
8. [Decisiones](docs/08-DECISIONES.md)
9. [Fuentes](docs/09-FUENTES.md)

También están la [auditoría de extracción](docs/EXTRACTION_AUDIT.md) y el [ROADMAP](ROADMAP.md).

## Estructura

```text
index.html             entrada de la visita y del Studio (?authoring=1)
app/                   shell: HUD, entrada, audio y salas anidadas
engine/                motor semántico, sin Three.js ni DOM
render/                host de Three.js y medios
scene-kits/museum/     representación museística, GLB y fallback
worlds/                museum-v1.world.json: salas, obras, portales y recorrido
authoring/             configuración Schema 3, MediaVault y Studio
character/             avatar Character 2027
experiences/           Wet Paint: puente y app congelada (MIT)
qa/                    estados deterministas
assets/ · vendor/      colección, Marble Bust 01 y three.js
docs/ · tools/ · tests/
```

## Despliegue

Es un sitio estático: se publica la raíz tal cual. En Vercel corresponde al framework «Other», sin build command y con output `.`. Todavía no hay ningún proyecto de hosting conectado (roadmap 0.9).

## Licencias

| Componente | Licencia |
|---|---|
| **Marble Bust 01**, de Rico Cilliers (Poly Haven) | **CC0 1.0** |
| three.js r0.185.1 | MIT |
| Wet Paint Flow | MIT, © Simon and contributors; escenas de Van Gogh en dominio público |
| Colección de la Fundación Arenas | Obra propia generada |
| Avatar `assets/models/character/Avatar_1.glb` | Propiedad de Juanma; licencia libre, **pendiente de nombrar** |
| Breeze Studio PRO V4.1 (`experiences/breeze-studio-pro/`) | Código MIT, © 2025 Niklas Niehus. Assets: Venus (Sketchfab), HDRI de Poly Haven y Fabric Lace **pendientes de verificación**; Khronos CC0 según `CREDITS.md`; texturas de pétalo y hoja propias. Ver `IMPORT_NOTES.md` |
| Código propio del museo | **Sin licencia declarada**: decisión pendiente del titular |

El detalle está en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
