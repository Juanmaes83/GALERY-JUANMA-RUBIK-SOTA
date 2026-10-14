# Estado canónico del museo — 2026-10-14

## Versión aprobada e integración

- Repositorio: Juanmaes83/GALERY-JUANMA-RUBIK-SOTA.
- PR #3 aprobada por Juanma y fusionada en `mision5/tienda-del-museo`: `7ee2cbdc16693f1a074d13864354b3507f729520`.
- PR #4 consolida la misma versión en `main`: `201951c8d972dc8617b54c941615808dba9b59e3`.
- Las PR #1 y #2 están integradas por ascendencia, confirmado en GitHub.
- La rama por defecto sigue siendo `claude/extract-museo-grande-repo-cs0gwm`. Cambiarla a main requiere administración; el conector disponible no ofrece esa operación.
- No se ha realizado despliegue de producción.

Preview de la versión aprobada: https://galery-juanma-rubik-sota-preview-p1w6khed0.vercel.app/

## Lo que funciona y lo que no está terminado

Siete salas: Vestíbulo, Galería A, Galería B, Archivo, Breeze, Wet Paint y Tienda. Visita POV/Avatar; guía móvil y controles táctiles; obras y fichas; tienda simulada; edición local en Studio. Breeze requiere WebGPU y tiene salida alternativa si la API/adaptador no está disponible.

El Studio no publica para terceros: configuración en localStorage, medios de sesión. No hay autenticación de autores ni backend de medios. La audioguía tiene 24 pistas editables y texto, pero no grabaciones del contenido.

La aprobación de la PR #3 cierra esa revisión humana. Sigue pendiente registrar mediciones y compatibilidad en teléfonos físicos; no se deducen de Chromium/SwiftShader.

## Recuperación del Studio

La rama antigua `fix/studio-layout-breeze-visibility` divergía de la versión actual: un commit propio y 17 commits por detrás en la comparación. Se portan solo `studio-layout-ux.css`, `studio-layout-ux.js`, los campos de texto correspondientes y su instalación desde index.html. Se mantienen las correcciones actuales del modo visitante de Breeze.

Candidata nueva: `fix/studio-layout-canonical`. Su preview y resultados finales se enlazan desde la PR de recuperación. Esta nueva interfaz necesita su propia revisión visual.

## Pendientes ordenados

Ver [ROADMAP](../ROADMAP.md), sección Cierre del MVP: base canónica, Studio, dispositivo físico/recuperación gráfica, carga, persistencia/publicación, audioguía, licencias y lanzamiento.

Los borradores previos de persistencia y revisión editorial no están en la rama integrada ni en una rama remota `mision-visual-presentacion`. Recuperar el trabajo local/bundle antes de continuar esa fase. No se declara implementada por informes anteriores.

## Evidencia

La versión aprobada `4ce5856` superó la CI (run 38381967222). Los nuevos resultados del Studio se documentan en [STUDIO-LAYOUT-RECOVERY](STUDIO-LAYOUT-RECOVERY.md). Las secciones antiguas de MISION-VISUAL son historial y no sustituyen este estado actual.
