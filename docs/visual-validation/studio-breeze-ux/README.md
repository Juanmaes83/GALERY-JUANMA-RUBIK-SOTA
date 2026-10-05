# Studio más usable y panel de Breeze oculto en la visita: evidencias

Rama `fix/studio-layout-breeze-visibility`, creada desde `mision-visual-limpia` @ `827a6d9`. «Antes» es `827a6d9` y «después» es esta rama. Las dos se capturaron con el mismo script, el mismo viewport y el mismo recorte.

**Entorno.** Chromium headless con Playwright. WebGL2 se emula por software con **SwiftShader**. WebGPU también va por SwiftShader, activado con `--enable-unsafe-webgpu`. **No hay GPU real.**

- **Studio.** Las capturas muestran la app renderizada de verdad: el Museo se ve en la vista previa acoplada.
- **Breeze.**
  - En este entorno, la tela de Breeze **no se dibuja**: la escena sale negra, tanto antes como después.
  - Lo que sí se puede verificar es lo que pide la misión: si el panel está en pantalla o no, y si Breeze sigue vivo. Eso queda en las capturas y en `mediciones.json`, donde constan el modo, el `display` del panel, el runtime y `VALIDATE_STATE`.
  - **No se declara validada la escena de Breeze en una GPU real.**

Las capturas no tienen barras de navegador (headless) ni datos personales. Los nombres que aparecen son los del mundo de demostración.

## Studio

| Archivo | Viewport | Modo | Qué demuestra |
|---|---|---|---|
| `studio-escritorio-antes.png` / `-despues.png` | 1440×900 | `?authoring=1`, Construir › Institución | **Antes:** centro de 600 px, inspector de 306 px y una columna «Proyecto» fija de 182 px. **Después:** centro de 569 px (−5 %) e inspector de 475 px (+55 %). «Proyecto» queda en una pestaña de 44 px con su porcentaje. Las etiquetas van encima de los campos y «Nombre de la institución» ya no se corta. |
| `studio-guion-transcripcion-antes.png` / `-despues.png` | recorte 560×844 en (880, 56), igual en ambas | Audioguía de Institución | **Antes:** guion, transcripción, créditos y derechos tenían 165 px de ancho; el texto quedaba cortado, con barra interna en las áreas y créditos y derechos en una sola línea recortada. **Después:** 442 px a ancho completo con la etiqueta encima. Los cuatro se leen enteros y sin barra interna. Créditos y derechos ajustan el texto en varias líneas, pero siguen guardando una sola línea (Intro no inserta saltos). |
| `studio-proyecto-abierto-despues.png` | 1440×900 | «Proyecto» desplegado | El panel se abre como cajón de 300 px sobre el inspector. La vista previa **no se mueve** (x = 352, 569 px antes y después de abrir). Se cierra con el mismo botón o con `Esc`, y el foco vuelve al botón. |
| `studio-1180-antes.png` / `-despues.png` | 1180×800 | Construir › Institución | **Antes:** inspector de 300 px, con el bloque «Proyecto» fijo tapando sus últimos 368 px. **Después:** inspector de 354 px y «Proyecto» reducido a una fila de 49 px que se despliega. |
| `studio-movil-antes.png` / `-despues.png` | 390×844 | pestaña «Editar» | Secciones apiladas con pestañas inferiores. En ambas, el inspector cabe sin desbordamiento horizontal. |
| `studio-movil-proyecto-despues.png` | 390×844 | pestaña «Proyecto» | La pestaña despliega la sección «Proyecto», que está plegada por defecto, y la muestra. |

Mediciones (`mediciones.json › studio`):

- **Desbordamiento horizontal:** 0 px en el documento y en el inspector, a 1440, a 1180 y a 390 px.
- **Campos largos:** a 1440 px, después, ninguno de los cinco campos medidos se recorta (`clipped: false`). Antes se recortaban los cinco.

Comprobado también en el navegador:

- **Separador entre la vista previa y el inspector** (`role="separator"`, enfocable):
  - cuatro pulsaciones de `←` llevan el inspector de 475 a 539 px y la vista previa baja a 505 px;
  - `Inicio` vuelve a 475 px;
  - el límite se calcula para que la vista 3D nunca baje de 360 px;
  - el ancho se recuerda solo durante la sesión, en `sessionStorage` y protegido con try/catch.
- **Guardar y aplicar** (`mediciones.json › guardar_aplicar`): mismo resultado antes y después.
  - «Guardado · hh:mm»;
  - la configuración no cambia al guardar;
  - «Vista previa aplicada»;
  - el puente de Breeze queda `READY_UNSAVED` y su guardado devuelve `ok`;
  - 0 errores.

  La comparación `configUnchangedByApply` sale `false` **también en la base**. Aplicar reconstruye la configuración en las dos versiones; este cambio no lo provoca.

## Breeze

El panel ocultado es **`#breezeStudioPanel`**, el panel «Breeze Studio PRO» de 326 px a la derecha de la escena. Contiene escena, fondo, medios sobre la tela, look, objeto, física y «Guardar en Museum». Con él se oculta también su pestaña «Mostrar panel» (`#bsMuseumPanelShow`).

La barra «info» de abajo a la izquierda es el panel original del experimento, con los créditos y la descripción del autor. **No se ha tocado.**

| Archivo | Viewport | Modo | Qué demuestra |
|---|---|---|---|
| `breeze-pov-antes.png` / `-despues.png` | 1440×900 | visita POV (`?tier=LOW`), cámara `EXPLORE` | **Antes:** el panel de autoría tapa la derecha de la sala. **Después:** no aparece. El panel sigue existiendo (`panelExists: true`, `display: none`). Breeze sigue vivo: runtime `true` y `VALIDATE_STATE` `ok` en sus siete comprobaciones. |
| `breeze-avatar-antes.png` / `-despues.png` | 1440×900 | visita con avatar (`?character=1&mobility=1&continuity=1&gatea=1`), cámara `THIRD_PERSON_EXPLORE` | El mismo resultado con avatar. En la sala anidada el avatar se aparca oculto (comportamiento previo), así que estas capturas son **idénticas píxel a píxel** a las de POV. El modo avatar lo acredita la medición de cámara, no la imagen. |
| `breeze-studio-antes.png` / `-despues.png` | 1440×900 | `?authoring=1`, «Viento sobre mármol» seleccionada en el árbol | En el Studio el panel **sigue visible y editable** en la vista previa acoplada (`museoMode: studio`, `display: block`, dock «Guardar en Museum» presente). `VALIDATE_STATE` da `ok` y el inspector muestra la obra de Breeze. |

Paso del Studio a la visita (`mediciones.json › breeze.studio.despues.afterPreview`): al pulsar «Empezar experiencia», el modo pasa a `visita` y el panel a `display: none`. En `827a6d9` el panel seguía en `block` en la vista de visitante.

## Limitaciones, sin maquillar

- **WebGPU no es real.** La escena de Breeze sale negra en este entorno, antes y después. En el Studio, la base y la rama registran los mismos 2 errores del bundle de Breeze (`getArrayBufferAsync … reading 'size'`, lectura de un búfer de GPU). Al pasar a la vista de visitante, las dos acaban en el aviso «La instalación se ha detenido». Es la pérdida de dispositivo ya documentada en `docs/06-SALAS_ESPECIALES.md`.
- **Primera ejecución con avatar (después):** dio 19 errores del mismo tipo y el puente no llegó a `READY`. La segunda ejecución salió limpia: 0 errores, dock presente y `VALIDATE_STATE` `ok`. La base, en una ejecución, también salió limpia.
  - El cambio solo oculta un elemento con CSS y envía un mensaje de modo.
  - En el Studio el panel está visible y aparecen los mismos errores que en la base, así que no hay relación con ocultarlo.
  - Aun así, con una sola ejecución de la base, **no se puede descartar del todo**. Queda pendiente repetirlo en una GPU real.
- **Problemas previos en móvil:** a 390 px, la barra de migas tapa parte del contenido y la vista previa queda cubierta al saltar de pestaña. Ocurre igual en la base y queda fuera de este alcance.
- **Problema previo en el Studio con Breeze:** el aviso del Museo «Volver a la Galería B» se superpone al dock «Guardar en Museum» en la vista previa acoplada. También ocurre en la base. El aviso deja pasar los clics, porque el guest lo pone en `pointer-events: none`.
- **Navegadores probados:** solo Chromium. En los navegadores sin `field-sizing` (Firefox y Safari a fecha de hoy), el autoajuste de altura de las áreas de texto lo hace `studio-layout-ux.js`. No se ha probado en ellos.
