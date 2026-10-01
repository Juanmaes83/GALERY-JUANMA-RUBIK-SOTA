# 08 · Registro de decisiones (GJR)

Cada decisión indica fecha, contexto, decisión y consecuencias. Las decisiones del origen (IW-DEC-xxx e IW-ADR-xxx) siguen vigentes como antecedente. Se citan en [09-FUENTES](09-FUENTES.md).

---

### GJR-001 · Este repositorio es el canónico del museo
**Fecha:** 2026-10-01 · **Decide:** Juanma

- **Contexto:** el museo vivía en `escaparates-pro/labs/immersive-worlds`, dentro de un monorepo con otros productos, en una línea de integración que nunca se fusionó en `master` (PR #61), con 1539 archivos y 467 MB, de los que 432 MB eran evidencias.
- **Decisión:** el desarrollo del museo continúa aquí.
- **Consecuencias:**
  - Lo que siga llegando al origen (PR #83, #85 o ramas sin fusionar) **se porta aquí** de forma explícita, con su procedencia.
  - Para evitar dos verdades, conviene dejar en el origen una nota que apunte aquí y congelar `labs/immersive-worlds`. Eso requiere autorización para modificar el origen.

### GJR-002 · Importación como snapshot limpio sin historial
**Fecha:** 2026-10-01

- **Decisión:** importar en `escaparates-pro@382e566` (head de la PR #85 sobre el head de la PR #61) solo los archivos del grafo de dependencias de la visita, byte a byte. Sin `git subtree` ni historial.
- **Consecuencias:** la procedencia se conserva en el commit `import:` y en [EXTRACTION_AUDIT](EXTRACTION_AUDIT.md).

### GJR-003 · Studio reactivado en el punto de entrada canónico
**Fecha:** 2026-10-01 · **Decide:** Juanma

- **Contexto:** el encargo inicial excluía editores y el Studio se desactivó (`authoringOn = false`). Con GJR-001 el panel pasa a ser el núcleo del producto.
- **Decisión:** `index.html?authoring=1` vuelve a montar el Studio. Se incorporan, byte a byte, `studio.css`, `museum-b.config.json` y sus assets, y el shell VS01. Los bancos de prueba aislados del origen no se migran.
- **Consecuencias:** cualquiera puede abrir el Studio, pero solo edita su navegador. La autenticación será obligatoria antes de publicar (fase 3 del roadmap).

### GJR-004 · Sala Breeze: degradación explícita mientras no se migra
**Fecha:** 2026-10-01

- **Decisión:** el invitado comprueba con `HEAD` si Breeze Studio PRO está servido. Si no lo está, muestra un aviso con salida. Con el producto presente, el camino original no cambia.
- **Estado de la migración:** autorizada por Juanma. **Bloqueada por la política de permisos del entorno de ejecución** («Out-of-Place Publication»). Requiere autorización explícita en la configuración. Tareas previas de licencias en [06](06-SALAS_ESPECIALES.md).

### GJR-005 · Correcciones de salida de salas anidadas
**Fecha:** 2026-10-01

- **Contexto:** tres defectos reproducidos en el origen:
  1. el botón-puente quedaba tapado por la barra del HUD (contexto de apilamiento de `#iw-stage`);
  2. la Sala Breeze no tenía hotspot de vuelta (`E` no hacía nada);
  3. `ProximitySystem.rebuild()` dejaba en el HUD el aviso de la sala anterior.
- **Decisión:**
  1. botón abajo a la izquierda;
  2. `hotspot.breeze.to-gallery-b` con radio de 3 m sobre el portal canónico;
  3. `rebuild()` emite el cambio de hotspot cercano.
- **Consecuencias:** cubierto por `npm test`.

### GJR-006 · Documentación sintetizada, no copiada
**Fecha:** 2026-10-01

- **Contexto:** el origen es privado y su documentación mezcla contratos de producto con procesos internos y referencias al monorepo.
- **Decisión:** la documentación de este repositorio se redacta de nuevo a partir del código y de los documentos del origen, citando cada fuente con su ruta y commit. Solo se conservan literalmente los registros de piezas de la Galería A.

### GJR-007 · Avatar propiedad del titular
**Fecha:** 2026-10-01 · **Decide:** Juanma

- **Decisión:** `Avatar_1.glb` es de Juanma, con licencia libre.
- **Pendiente:** el nombre exacto de la licencia y si el binario se aloja en este repositorio o en un origen controlado.

### GJR-008 · Pruebas propias en lugar de la suite del origen
**Fecha:** 2026-10-01

- **Contexto:** `qa/run-qa.mjs` depende de la estructura del monorepo, de mundos de demostración y de directorios de evidencias de cientos de MB. En la línea base completó 30/30 comprobaciones y no terminó.
- **Decisión:** `tools/check-static.mjs` y `tests/museum-smoke.mjs` como suite canónica, ligera y ejecutable en CI.
