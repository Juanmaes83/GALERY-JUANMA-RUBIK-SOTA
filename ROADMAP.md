# ROADMAP — Museo Fundación Arenas (GALERY JUANMA · RUBIK SOTA)

**Actualizado:** 2026-10-14 · **Repositorio canónico:** este ([GJR-001](docs/08-DECISIONES.md))
**Autoridad:** Juanma (Product Owner, autoridad visual y de merge)

Este roadmap sustituye a los roadmaps dispersos del repositorio madre y los unifica:

- bloques de producto 1–9;
- pases 1–6;
- fases 0–6 del personaje;
- plataforma de personalización.

Las fuentes están en [docs/09-FUENTES.md](docs/09-FUENTES.md).

Leyenda: ✅ hecho · 🟡 en curso · 👁 hecho, pendiente de puerta humana · ⛔ bloqueado · ⏳ pendiente de decisión · ○ por hacer

> **Estado:** MVP visitable avanzado, con siete salas y enlace de revisión. La PR #3 fue aprobada por Juanma y fusionada el 14/10/2026; la PR #4 consolida esa versión en `main`. Las PR #1 y #2 han quedado integradas por ascendencia.
> **Para cerrar un MVP personalizable y publicable:** incorporar la mejora pendiente del Studio, comprobar dispositivos reales y recuperación gráfica, elegir backend y completar medios durables + publicación autenticada. Audioguía: faltan guiones aprobados y grabaciones. Las fases de expansión comercial se mantienen posteriores.
> Estado detallado: [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md). La recuperación del inspector se entrega como candidata independiente; no se presenta como aprobada visualmente.

---

## Punto de partida (heredado del origen)

| Línea | Estado |
|---|---|
| Motor semántico, cámara única, ciclo de vida de salas e invariantes (IW-0 a IW-3) | ✅ |
| Bloque 1: Galería A completa (gramáticas de obra y de escultura, foco, navegación por la colección, retorno exacto) | ✅ aprobado |
| Bloque 2A: lenguaje de transición dentro de la sala (T1–T5) | ✅ KEEP |
| Bloque 2B: cruce entre salas | 👁 implementado; puerta humana pendiente |
| Bloque 3: salas nuevas (Galería B con proyección, Archivo sonoro, Itinerante Wet Paint, Breeze) | 🟡 4 de 5 operativas; Breeze integrada en `import/breeze-studio-pro`, sin validar en GPU real |
| Bloque 6: Studio, fases 1 y 2 (Construir, Contenido, Experiencia, Visitante, Publicar) | 👁 auditoría visual humana de la fase 2 pendiente |
| Personaje: fases 3, 4A y 4B, Avatar Studio (fase 5) y fase 6 (Gate A, puente con el recorrido, cámara cinematográfica) | ✅ fusionado en la línea canónica |
| Marble Bust 01 (GLB CC0) | 👁 KEEP o ADJUST pendiente |

---

## MVP visitable y presentable (definición, 2026-10-02)

**El MVP es esto:** una persona abre el museo desde **un enlace** y entiende cómo empezar. Elige primera persona o avatar, recorre las salas principales, consulta las obras y sale o vuelve sin quedar bloqueada, con teclado y con pantalla táctil.

| Prioridad | Qué | Problema que resuelve | Impacto para el visitante | Esfuerzo | Dependencia | Estado |
|---|---|---|---|---|---|---|
| **Necesario** | Preview pública por enlace (Vercel, sin build, salida `.`) | Hoy solo se ve en local | Sin enlace no hay MVP que enseñar | Bajo | — | ✅ proyecto solo de preview (0.9) |
| **Necesario** | Validar en un **navegador con GPU real**: avatar en las 7 salas, Breeze y móvil | SwiftShader no prueba WebGPU ni el rendimiento real | Breeze y avatar no se pueden presentar como validados sin esto | Bajo (una sesión) | Preview | ⏳ |
| **Necesario** | Salida de la visita, señales hacia ella y resaltado de la obra cercana | El visitante no sabía cómo terminar ni qué obra abría E | Orientación y control | — | — | ✅ (A-39 a A-42) |
| **Necesario** | Puertas táctiles y avatar con el pulgar | En móvil no se podía cruzar ni mover el avatar | Móvil usable | — | — | ✅ (A-20 a A-27) |
| **Necesario** | Puertas que se cruzan con E, obras fuera de los huecos, cuerdas que no cierran pasos y avatar sin tirones | En la revisión del preview, E abría una ficha en vez de entrar en Breeze, Wet Paint era una pared de cuadros, una cuerda atrapaba al visitante y la cámara del avatar daba saltos | Recorrido sin bloqueos | — | — | ✅ (A-45 a A-51) · 👁 fluidez del avatar en GPU real |
| **Necesario** | Licencias de Venus, Poly Haven y Fabric Lace | No verificables desde este entorno | Bloquea publicar Breeze | Bajo | Consulta en navegador | ⛔ pendiente |
| Recomendado | Audioguía: bienvenida, salas y obras, editable en el Studio | La visita no tenía relato sonoro | Visita acompañada, con transcripción siempre visible | — | — | ✅ sistema (A-52 a A-55, [11](docs/11-AUDIOGUIA.md)) · ⏳ **grabaciones y revisión editorial** · 👁 reproducción en GPU real |
| Recomendado | Avatar ≤ 5 MB (hoy 30 MB y sin caché) | Entrada lenta con avatar | Tiempo de espera | Medio | Herramienta glTF | ○ |
| Recomendado | Wet Paint bajo demanda (A-14) | 660 KB y un contexto WebGL para todos | Arranque y memoria en móvil | Medio | — | ○ |
| Recomendado | Panel de Breeze en español (A-17) | Mezcla de idiomas | Coherencia | Bajo | Producto donante | ○ |
| Recomendado | Galería B más legible al llegar desde Breeze | Se llega mirando a la zona más oscura | Orientación | Bajo | Validación visual | ○ |
| Posterior | Publicación real y medios durables (fase 2) | Lo personalizado solo vive en el navegador del autor | Clave para vender el Studio | Alto | **Decisión de backend** (2.1) | ⏳ |
| Recomendado | Tienda fiel a la referencia: mostrador con caja, datáfono, teléfono y llaveros, vitrinas de arce y vidrio, dependienta, cuadros y cordón; llaveros, figuras y discos como productos | Parecía una galería | Credibilidad de la sala comercial | — | — | ✅ misión 5 (A-57, A-58), en rama propia · 👁 revisión visual |
| Posterior | Carrito **simulado** en la tienda | Demostrar un flujo comercial | Bajo para la visita | Medio | Diseño | ○ |
| Posterior | Crear o borrar obras y productos desde el Studio (2.8) | Hoy se añaden en el World | Autonomía del cliente | Alto | Plantillas de sala | ○ |
| Bloqueado | Veredictos humanos (Marble Bust 01, Studio fase 2, bloque 2B) | — | — | — | Juanma | ⏳ |

**¿La tienda en el MVP?** Sí, como **sala simulada**, porque ya funciona con el Studio y no altera el recorrido principal. Quedan para después de la publicación real el carrito simulado y la edición durable de imágenes de producto.

## Fase 0 — Repositorio canónico operativo · *ahora*

| # | Tarea | Estado |
|---|---|---|
| 0.1 | Extracción limpia, inventario justificado y licencias | ✅ |
| 0.2 | Studio reactivado en `index.html?authoring=1` | ✅ |
| 0.3 | Salida de la Sala Breeze con ratón y teclado; aviso de proximidad correcto | ✅ |
| 0.4 | Suite propia: `npm run check` y `npm test` | ✅ |
| 0.5 | Documentación vigente en `docs/` y este roadmap | ✅ actualización 14/10/2026; historial anterior identificado como histórico |
| 0.6 | CI en GitHub Actions con pruebas en cada PR | ✅ versión aprobada `4ce5856` verde (run 38381967222); la candidata Studio añade comprobación específica |
| 0.7 | Consolidar la versión aprobada en `main` y ponerla como rama por defecto | ✅ integración mediante PR #4; PR #1/#2 integradas. ⏳ cambio de rama por defecto (permiso de administración) |
| 0.8 | Licencia del código propio | ⏳ Juanma |
| 0.9 | Preview en Vercel (sin build, salida `.`), abierto sin iniciar sesión | ✅ proyecto solo de preview, sin Git ni producción; recorrido Studio → visita comprobado en el propio preview (Chromium headless, SwiftShader) |
| 0.10 | Nota en `escaparates-pro/labs/immersive-worlds` que apunte aquí y congelación del lab | ⏳ autorización para tocar el origen |

## Fase 1 — Cerrar lo heredado

| # | Tarea | Estado |
|---|---|---|
| 1.1 | Veredicto de Marble Bust 01 (KEEP o ADJUST) | ⏳ Juanma |
| 1.2 | Auditoría visual humana del Studio, fase 2 | ⏳ Juanma (requiere preview) |
| 1.3 | Portar la PR #83: elección «POV» o «Con mi avatar» al entrar y reinstalación del avatar y de Wet Paint tras reconstruir Studio | ✅ incorporado a `main` |
| 1.4 | **Migrar Breeze Studio PRO**: analítica eliminada, texturas propias, ruta relativa, aviso sin WebGPU y vigilancia de pérdida del dispositivo | ✅ incorporado a `main`. Licencias de Venus, Poly Haven y Fabric Lace **pendientes** |
| 1.5 | Puerta visual WebGPU de Breeze en navegador gráfico | ○ tras 1.4 |
| 1.6 | Avatar: alojado en el repositorio ✅; continuidad en las 7 salas ✅ (pruebas automáticas, 👁 validación humana pendiente); en móvil, control con el pulgar y encuadre vertical ✅ (A-20, A-27); registrar el nombre exacto de la licencia ⏳; optimizarlo (≤ 5 MB) ○ |
| 1.7 | Bloque 2B: puerta humana del cruce entre salas | ⏳ Juanma |
| 1.8 | **Auditoría E2E en escritorio y móvil** ([docs/10](docs/10-AUDITORIA.md)): 38 hallazgos, cada uno con su causa y su corrección, verificados con pruebas (`npm test`: 59 comprobaciones). El móvil se ha recorrido con gestos táctiles reales. La personalización completa desde el Studio (12 medios y 5 cuadros Wet Paint) destapó que el visitante nunca veía Wet Paint (A-34), ya corregido | 🟡 👁 falta la prueba en un teléfono y una GPU reales (Breeze y avatar **no validados**) |

## Fase 2 — Producto vendible: del Studio a la publicación

Es la fase con más impacto de negocio. Hoy lo que se personaliza **solo vive en el navegador del autor** (ver [docs/04-STUDIO.md](docs/04-STUDIO.md)).

| # | Tarea | Estado |
|---|---|---|
| 2.1 | **Decidir el backend**: <br>(a) Project Cloud de escaparates-pro (`project_assets` en R2; adaptador ya preparado); <br>(b) un backend propio de este repositorio, por ejemplo Supabase (Postgres con RLS y almacenamiento) | ⏳ Juanma |
| 2.2 | Medios durables: referencias `asset:<uuid>`, estados `READY ≠ SAVED`, reemplazar sin borrar antes | ○ |
| 2.3 | **Configuración publicada**: el visitante carga la configuración publicada de la institución, no el `localStorage` | ○ |
| 2.4 | Importar proyecto (hoy solo existe exportar al portapapeles) | ○ |
| 2.5 | Autenticación de autores y separación visita/Studio (por ejemplo `studio.html` con `noindex`) | ○ |
| 2.6 | Multi-institución: un World y una configuración por cliente, con ruta propia por institución | ○ |
| 2.7 | QR codificado en local (eliminar el servicio externo) | ○ |
| 2.8 | Crear y borrar obras y salas desde el Studio, con plantillas curadas de muro, peana y proyección | ○ |
| 2.9 | Perfiles GLB genéricos (hoy solo existe el de Marble Bust) y subida de GLB con validación de presupuesto y licencia | ○ |

## Fase 3 — Experiencia (bloques del origen)

| # | Tarea | Origen |
|---|---|---|
| 3.1 | Más esculturas GLB del catálogo Rubik Sota (tras 2.9) | Bloque 1B y piloto RS-GLB |
| 3.2 | Personaje: Exterior Pilot y Full World C2 (rama sin fusionar), e integración con Wet Paint y Breeze | Fase 6 y 4D del personaje |
| 3.3 | Medios flexibles: banderolas | Bloque 4 |
| 3.4 | Puntos de experiencia (escucha, pausa sugerida, umbral, vista de destino) | Bloque 5 |
| 3.5 | Lenguajes de experiencia: white cube, patrimonio, editorial, exposición oscura, ADN de marca | Bloque 7 |
| 3.6 | Sonido, orientación, mapa y progreso: visitado, sin ver y siguiente | Bloque 8 y pase 3 |
| 3.8 | Audioguía: ✅ sistema y 24 borradores de texto. Falta grabar y revisar los guiones, publicar los audios (requiere 2.1), otros idiomas y el sonido propio de *Cinta 14* | Misión 4 · [11-AUDIOGUIA](docs/11-AUDIOGUIA.md) |
| 3.7 | Credibilidad institucional: mobiliario y señalética del museo | Pase 4 |

## Fase 4 — Valor comercial

| # | Tarea |
|---|---|
| 4.1 | Reservas y CTA medibles; tienda, membresía y donaciones con pago real (hoy son destinos externos) |
| 4.2 | Analítica respetuosa con la privacidad: visitas, permanencia por obra, recorridos completados, abandonos y CTA |
| 4.3 | **Guía IA institucional** con procedencia y límites: no inventa datos del museo; modos comisario, educador y familiar; respuestas de 30 segundos o en profundidad |
| 4.4 | Multilingüe maduro (traducción y revisión) e identidad del visitante entre dispositivos |
| 4.5 | Accesibilidad auditada (WCAG 2.2 AA) y presupuestos de rendimiento por tier en dispositivos reales (Constitución §20, sin fijar) |

## Fase 5 — Salida

| # | Tarea | Origen |
|---|---|---|
| 5.1 | Grabar el recorrido guiado como vídeo o presentación sin contaminar el World State | Pase 6 y bloque 9 |
| 5.2 | Compartir y enlazar a una obra o parada concreta | Bloque 9 |
| 5.3 | Exportar como paquete de experiencia | Bloque 9 |

## Misión visual — seis salas · *PR #3 aprobada y fusionada; integrada en main*

Detalle, mediciones, pruebas y capturas en [`docs/MISION-VISUAL.md`](docs/MISION-VISUAL.md). Los datos V.1–V.12 describen la misión visual original de octubre de 2026. Las mejoras móviles y Breeze de esta sección están integradas en `main` mediante las PR #3 y #4. Juanma aprobó la PR #3 el 14/10/2026. Esa aprobación no aporta por sí sola mediciones de rendimiento en teléfonos físicos.

| # | Tarea | Estado |
|---|---|---|
| V.1 | Suelos con acabado propio por sala (canvas 2D: color + relieve) | Hecho · visible en capturas SwiftShader |
| V.2 | Jerarquía de luz en Galería A y Wet Paint (sin luces nuevas) | Hecho · visible en capturas |
| V.3 | Oclusión en juntas y sombras de contacto (decal), marcos perfilados, cartelas con grosor | Hecho |
| V.4 | Zócalos (Vestíbulo, Archivo), vigas (Archivo), retícula (Galería B) | Hecho; Archivo ya a la par de la base (antes +42 %) |
| V.5 | Rendimiento: 5 iteraciones. Serie oficial 5+5 HIGH: arranque **−28,5 %**, cruces iguales o más rápidos; **Galería A, Galería B y Wet Paint +5…+9 % repetible** | **No validado** (fluidez); causa sin identificar |
| V.6 | Serie móvil sobre la versión actual | **Pendiente** |
| V.7 | GPU real y móvil real | **Pendiente** |
| V.8 | Preview de la rama y revisión de Juanma | ✅ PR #3 aprobada por Juanma y fusionada el 14/10/2026; preview de referencia `p1w6khed0` |
| V.9 | `SHOP-STUDIO`: falla en la suite completa en base y candidata con el mismo detalle; aislado pasa 4/4 en ambas | Causa (2026-10-13): `press()` repetía por el DOM un clic que Playwright ya había enviado; la casilla «Visible en la tienda» volvía a marcarse. Ahora se inspecciona el estado antes de repetir (§14) |
| V.10 | Incidencias intermitentes en capturas (§8 del informe) | **Pendiente** |
| V.11 | `MOBILE-DOOR-TAP`: causa (5 programas de shader más en el primer fotograma del cruce, tier LOW sin precompilación) corregida en `176f7f7`; la suite completa ya solo falla en `SHOP-COLLIDE` y `SHOP-STUDIO`, como la base. Aislada, la prueba falla también en la base en este entorno (base 0/4, misión 1/4) | Corregido; prueba dependiente de SwiftShader |
| V.12 | Móvil LOW, serie 5+5 (`176f7f7`): arranque **+9,5 %**, Galería A +5,5 %, Galería B +9 %, Archivo +12 % parado (SwiftShader) | Dato histórico de otra versión; la PR #3 ya está aprobada e integrada. Rendimiento de la versión actual en teléfono físico pendiente |
| V.13 | Breeze visible en la primera llegada a Galería B | Corregida la oclusión causada por la carcasa anidada adyacente; la segunda llegada encuentra las mismas salas que la primera. Rayos libres hasta el hueco en ambas (§14) |
| V.14 | Acceso legible en Galería B oscura y en el resto de puertas | Señales comunes en todas las puertas (`door-cues.js`): marco de bronce, luz cálida en el suelo que responde al aviso y resplandor al fondo donde la sala de destino no se ve (Breeze, Archivo). Sin luces ni cambios de colisión (§14) |
| V.15 | Panel Breeze separado entre Studio y visita | Oculto y sin reapertura en POV/Avatar; disponible y editable en Studio, incluso al alternar con vista de visitante. Un marco ilegible se trata como visita; el visitante restaura la personalización guardada (§14) |
| V.16 | Ciclo de vida de las salas | Corregido (§14): la sala recién dejada ya no se reconstruye (dejaba copias en la escena) y una sala liberada a medio preparar ya no queda `READY` vacía (entrar en Breeze lanzaba `TypeError`). Prueba unitaria `tests/space-lifecycle.test.mjs` |
| V.17 | Velo de entrada sobre la guía del teléfono | Corregido (§14): al pulsar «Entrar», el velo que se desvanece ya no intercepta los toques; «Empezar la visita» responde aunque el teléfono siga compilando la primera sala. Comprobación `MOBILE-ENTRY-VEIL` |
| V.19 | Aviso de Breeze sin tarjeta gráfica | Corregido (§14): con WebGPU presente pero sin adaptador (aceleración desactivada o GPU apagada por Chrome), el aviso pide reiniciar el navegador en vez de decir que no ofrece WebGPU. Comprobación `BREEZE-NOTICE-REASON` |
| V.18 | Recuperación tras un reinicio del proceso GPU | **Pendiente** (previo). Una pérdida de contexto WebGL corriente se recupera entera. Tras un reinicio del proceso GPU (fallo del controlador, falta de memoria), en cambio, los lienzos de textura vuelven vacíos y la sala se ve oscurecida hasta reconstruirse. `5b40747` lo disimulaba en B→A→B al reconstruir la sala, por la fuga que corrige §14. Propuesta: regenerar las texturas de lienzo al restaurarse el contexto (16 puntos en 7 archivos del Scene Kit) y comprobarlo con `Browser.crashGpuProcess` |

## Transversal — deuda técnica y calidad

| # | Tarea |
|---|---|
| T.1 | Consolidar los parches de `StudioShell.prototype` y `ExperienceHUD.prototype` en extensiones declaradas del Studio. **Antes** de la fase 2 |
| T.2 | Que la visita no cargue código del Studio |
| T.3 | Pruebas en Firefox y WebKit, y auditoría de accesibilidad automatizada |
| T.4 | Pruebas de regresión visual con los estados deterministas |

---

## Cierre del MVP — orden de ejecución vigente (2026-10-14)

| Orden | Tarea | Estado / criterio de cierre |
|---|---|---|
| C.1 | Una base canónica actual en main | ✅ PR #4; queda cambiar la rama por defecto en ajustes de GitHub |
| C.2 | Recuperar el inspector ancho del Studio | Candidata `fix/studio-layout-canonical`; portar solo UI de la rama antigua, validar guardar/aplicar, revisión visual nueva |
| C.3 | Calidad física y estabilidad | Safari/iPhone y Chrome/Android, POV/Avatar, puertas y vuelta; V.18 pendiente. No confundir emulación con rendimiento real |
| C.4 | Optimizar carga | Avatar ≤5 MB como objetivo con comparación visual; Wet Paint bajo demanda; no degradar controles ni aspecto |
| C.5 | Preparar Studio para publicación | T.1 antes de backend; decisión 2.1; medios durables 2.2, versión publicada 2.3 y autores autenticados 2.5 |
| C.6 | Audioguía de contenido | Aprobación editorial, voz/derechos, 24 audios reproducibles para otros visitantes; sonido propio de Cinta 14 por separado |
| C.7 | Procedencia y licencias | Venus/HDRI/Fabric Lace; decisión de licencia propia/avatar |
| C.8 | Lanzamiento MVP | Enlace estable, visita anónima, comprobación entre navegadores/dispositivos y guía de uso vigente |

**Trabajo anterior no incorporado:** la rama local `mision-visual-presentacion` con los borradores de persistencia y revisión editorial no existe en el remoto consultado el 14/10/2026. `docs/12-PERSISTENCIA.md` y `docs/13-AUDIOGUIA-REVISION.md` no están en la versión integrada. Recuperar esos archivos/bundle antes de contarlos como implementados; no hay backend activo.

**Fuera del cierre del MVP:** pagos reales, carrito, donaciones/membresías, guía IA, multi-institución, nuevos idiomas y edición libre de la arquitectura/salas. La tienda actual sigue simulada.
