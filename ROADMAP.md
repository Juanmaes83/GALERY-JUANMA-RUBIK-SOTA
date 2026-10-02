# ROADMAP — Museo Fundación Arenas (GALERY JUANMA · RUBIK SOTA)

**Vigente desde:** 2026-10-01 · **Repositorio canónico:** este ([GJR-001](docs/08-DECISIONES.md))
**Autoridad:** Juanma (Product Owner, autoridad visual y de merge)

Este roadmap sustituye a los roadmaps dispersos del repositorio madre y los unifica:

- bloques de producto 1–9;
- pases 1–6;
- fases 0–6 del personaje;
- plataforma de personalización.

Las fuentes están en [docs/09-FUENTES.md](docs/09-FUENTES.md).

Leyenda: ✅ hecho · 🟡 en curso · 👁 hecho, pendiente de puerta humana · ⛔ bloqueado · ⏳ pendiente de decisión · ○ por hacer

> **Respuesta corta a «¿está terminado?»: no.** El museo es un prototipo avanzado. Su núcleo (motor, cinco salas operativas, Studio y avatar) funciona y está probado. Para ser un producto vendible le falta, sobre todo:
> - persistencia y publicación reales;
> - validar la Sala Breeze en una GPU real (ya está integrada en `import/breeze-studio-pro`);
> - optimizar el avatar (ya está alojado en el repositorio, pero pesa 30 MB);
> - cerrar las puertas humanas heredadas.

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
| **Necesario** | Preview pública por enlace (Vercel, sin build, salida `.`) | Hoy solo se ve en local | Sin enlace no hay MVP que enseñar | Bajo | Crear o conectar el proyecto en Vercel | ⏳ autorización |
| **Necesario** | Validar en un **navegador con GPU real**: avatar en las 7 salas, Breeze y móvil | SwiftShader no prueba WebGPU ni el rendimiento real | Breeze y avatar no se pueden presentar como validados sin esto | Bajo (una sesión) | Preview | ⏳ |
| **Necesario** | Salida de la visita, señales hacia ella y resaltado de la obra cercana | El visitante no sabía cómo terminar ni qué obra abría E | Orientación y control | — | — | ✅ (A-39 a A-42) |
| **Necesario** | Puertas táctiles y avatar con el pulgar | En móvil no se podía cruzar ni mover el avatar | Móvil usable | — | — | ✅ (A-20 a A-27) |
| **Necesario** | Licencias de Venus, Poly Haven y Fabric Lace | No verificables desde este entorno | Bloquea publicar Breeze | Bajo | Consulta en navegador | ⛔ pendiente |
| Recomendado | Avatar ≤ 5 MB (hoy 30 MB y sin caché) | Entrada lenta con avatar | Tiempo de espera | Medio | Herramienta glTF | ○ |
| Recomendado | Wet Paint bajo demanda (A-14) | 660 KB y un contexto WebGL para todos | Arranque y memoria en móvil | Medio | — | ○ |
| Recomendado | Panel de Breeze en español (A-17) | Mezcla de idiomas | Coherencia | Bajo | Producto donante | ○ |
| Recomendado | Galería B más legible al llegar desde Breeze | Se llega mirando a la zona más oscura | Orientación | Bajo | Validación visual | ○ |
| Posterior | Publicación real y medios durables (fase 2) | Lo personalizado solo vive en el navegador del autor | Clave para vender el Studio | Alto | **Decisión de backend** (2.1) | ⏳ |
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
| 0.5 | Documentación completa en `docs/` y este roadmap | ✅ |
| 0.6 | CI en GitHub Actions con `npm test` en cada PR | ✅ primera ejecución verde en la PR #1 |
| 0.7 | Fusionar la PR #1 y poner `main` como rama por defecto | ⏳ Juanma |
| 0.8 | Licencia del código propio | ⏳ Juanma |
| 0.9 | Preview en Vercel (proyecto conectado al repo, sin build, salida `.`) y comprobar si se abre sin iniciar sesión | ⏳ autorización para crear el proyecto |
| 0.10 | Nota en `escaparates-pro/labs/immersive-worlds` que apunte aquí y congelación del lab | ⏳ autorización para tocar el origen |

## Fase 1 — Cerrar lo heredado

| # | Tarea | Estado |
|---|---|---|
| 1.1 | Veredicto de Marble Bust 01 (KEEP o ADJUST) | ⏳ Juanma |
| 1.2 | Auditoría visual humana del Studio, fase 2 | ⏳ Juanma (requiere preview) |
| 1.3 | Portar la PR #83: elección «POV» o «Con mi avatar» al entrar y reinstalación del avatar y de Wet Paint tras reconstruir Studio | ✅ en `import/breeze-studio-pro` |
| 1.4 | **Migrar Breeze Studio PRO**: analítica eliminada, texturas propias, ruta relativa, aviso sin WebGPU y vigilancia de pérdida del dispositivo | ✅ en `import/breeze-studio-pro`. Licencias de Venus, Poly Haven y Fabric Lace **pendientes** |
| 1.5 | Puerta visual WebGPU de Breeze en navegador gráfico | ○ tras 1.4 |
| 1.6 | Avatar: alojado en el repositorio ✅; continuidad en las 6 salas ✅ (pruebas automáticas, 👁 validación humana pendiente); en móvil, control con el pulgar y encuadre vertical ✅ (A-20, A-27); registrar el nombre exacto de la licencia ⏳; optimizarlo (≤ 5 MB) ○ |
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

## Transversal — deuda técnica y calidad

| # | Tarea |
|---|---|
| T.1 | Consolidar los ocho parches de `StudioShell.prototype` (y tres de `ExperienceHUD.prototype`) en extensiones declaradas del Studio. **Antes** de la fase 2 |
| T.2 | Que la visita no cargue código del Studio |
| T.3 | Pruebas en Firefox y WebKit, y auditoría de accesibilidad automatizada |
| T.4 | Pruebas de regresión visual con los estados deterministas |

---

## Siguiente sprint propuesto (en orden)

1. Fusionar la PR #1 y poner `main` por defecto (0.7), con CI en verde (0.6).
2. Preview en Vercel (0.9), para que Juanma haga 1.1, 1.2 y 1.7 en una sola sesión de revisión.
3. Portar la PR #83 (1.3).
4. Desbloquear y ejecutar Breeze (1.4).
5. Decidir el backend (2.1) y empezar T.1, luego 2.2 y 2.3.
