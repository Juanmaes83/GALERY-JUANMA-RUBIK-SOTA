# Recuperación de la interfaz del Studio — 2026-10-14

## Base y procedencia

La versión aprobada se consolidó en main por PR #4 (`201951c8`), tras la aprobación y fusión de PR #3 (`7ee2cbdc`). La rama antigua `fix/studio-layout-breeze-visibility` contenía una mejora de interfaz que no estaba en esa versión. Se recupera en `fix/studio-layout-canonical`.

Se portan solo los dos archivos de presentación `studio-layout-ux.css/js`, su instalación desde index.html y los campos de créditos/derechos del StudioShell. No se portan los cambios antiguos de Breeze: se conservan su modo visitante y su ciclo de vida actuales.

## Resultado

- Inspector de 475,2 px y vista 3D de 568,8 px en un viewport de 1440 × 900.
- Inspector de 354 px y vista 3D de 566 px a 1180 × 800.
- «Proyecto» plegable; cajón que no desplaza el museo en escritorio.
- Separador arrastrable y manejable con teclado; mínimo 360 px para la vista 3D.
- Etiquetas encima de los campos y textos largos completos, sin barra interna; créditos/derechos conservan valores de una sola línea.
- En móvil, barra de contexto y estado de guardado dentro de la cabecera. La captura inicial detectó que la barra antigua se superponía al formulario, y se corrigió antes de la entrega.
- Sin cambios en configuración, medios durables ni publicación compartida.

## Verificación

`npm run check` y `git diff --check`: correctos.

Playwright 1.56.1 / Chromium 141 / SwiftShader, Ubuntu 26.04 con build Chromium de Ubuntu 24.04:
- Primera serie: 28 comprobaciones correctas a 1440 × 900, 1180 × 800 y 390 × 844.
- Tras corregir la barra móvil: 7 comprobaciones correctas a 390 × 844, incluido el límite de la barra dentro de la cabecera.
- Guardar → recargar → aplicar comprobado en los tres tamaños; ajuste por teclado, límite de vista 3D, cajón y lectura de texto largo en escritorio.
- Sin errores de página ni desbordamiento horizontal en esas comprobaciones.
- La prueba `npm run test:studio-layout` se incorpora a la CI de la candidata. El resultado de la suite general y la CI se indica en los checks y en el resumen de la PR; no se declara verde mientras está en curso.

No es una medición de fluidez en teléfono físico ni una validación de Safari/Firefox. El test móvil usa contexto touch y viewport móvil en Chromium; no sustituye una prueba manual en iOS/Android.

## Evidencias

[Capturas y manifiesto de la candidata](https://github.com/Juanmaes83/GALERY-JUANMA-RUBIK-SOTA/tree/fix/studio-layout-canonical/docs/visual-validation/studio-layout-recovery)

- `studio-1440.webp`: vista general, reducida a 1000 px de ancho.
- `studio-texto-completo.webp`: recorte del inspector, con guion largo de prueba.
- `studio-390.webp`: móvil tras corregir la superposición de la barra.

Las capturas se han abierto e inspeccionado. Los textos «QA» y el guion repetido pertenecen a la sesión de prueba; no se han añadido al contenido base del museo. El manifiesto conserva dimensiones, límites, procedencia y hashes del código validado.

La interfaz queda como candidata para revisión humana, en su propia PR contra main. Preview público, sin producción.
