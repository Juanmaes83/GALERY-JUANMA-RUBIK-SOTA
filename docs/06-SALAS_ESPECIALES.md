# 06 · Salas especiales

Las salas especiales demuestran capacidades de experiencia que un visor 3D genérico no tiene. Regla común heredada:

```text
DONANTE = TECNOLOGÍA · MUSEO = EXPERIENCIA
El museo no reconstruye la capacidad probada: la integra.
```

## Sala de Exposición Itinerante — Wet Paint

**Estado:** operativa. Integración con aprobación humana en el origen (`723b9df4`).

**Qué hace:** cada obra de la sala es un cuadro independiente con su propia fuente: imagen subida o colección Van Gogh. Un motor de pintura húmeda la transforma y el resultado se cuelga en la superficie de **esa misma** obra.

| Obra | Papel |
|---|---|
| 01 — Original | Punto de control: el medio original |
| 02 — Painterly | Reconstrucción pictórica: wet paint, impasto, crecimiento y revelado |
| 03 — Living | Superficie para movimiento procedural (flocking, evitación, atractores, respuesta al visitante) |
| 04 — Combined | Síntesis pictórico + procedural |
| 05 — Experimental | Reservada para presets y capacidades futuras |

**Cómo está construida:**

- **Donante:** `experiences/wet-paint-flow/`, build congelado y determinista de `Juanmaes83/wet-paint-flow` @ `0b9ba9a`.
  - Licencia MIT (Simon and contributors).
  - Escenas Van Gogh de dominio público; ver `ASSET_PROVENANCE.md`.
  - Única intervención documentada: un script que fuerza `preserveDrawingBuffer` para poder leer el frame pintado.
- **Adaptador:** `experiences/wet-paint-adapter.js` ejecuta el donante **oculto** en un iframe fuera de pantalla y maneja sus controles reales sin editarlo:
  - entrada `#source-upload`;
  - estado `window.__vangoghFlowState`;
  - captura del canvas tras `RESULT_READY`.
- **Controles:** solo en el Studio (`authoring/studio/wet-paint-studio-controls.js`). El visitante nunca ve la interfaz del donante.
- **Persistencia:** el estado de cada cuadro se guarda en `iw.wetpaint.personalization.v1` (navegador del autor).
- **Actualizar el donante:** se vuelve a ejecutar el build determinista contra un commit nuevo y se refrescan los hashes de `PRESERVATION.md`. No se edita a mano.

## Sala Breeze — Viento sobre mármol

**Estado: no migrada.** La sala existe en el World y en el recorrido (último capítulo). Al entrar muestra el aviso «Sala no disponible en esta edición», con dos salidas: el botón «← Volver a Galería B» y la tecla `E`.

**Qué es:** una instalación en la que una tela simulada en tiempo real (GPU/WebGPU) atraviesa la sala empujada por el viento y choca con una escultura. Funciones del producto Breeze Studio PRO V4.1:

- fondo de imagen o vídeo;
- medio proyectado sobre la tela;
- opacidad y gradación de la tela;
- escala y posición;
- modos Prairie Cloth, Autumn Leaves y Sakura Petals, y presets Museum Cloth, Gallery Wind, Fashion Drapery y Product Reveal;
- Venus de Milo, plantillas generadas y CC0 de Khronos, y subida de GLB, glTF u OBJ con colisionador BVH real;
- exportación a PNG o WebM.

**Integración en el origen:**

- `app/nested/breeze/breeze-studio-pro-guest.js` monta el producto en un iframe como invitado de sala anidada (ver [02](02-ARQUITECTURA.md)).
- `authoring/studio/breeze-persistence-adapter.js` conecta su «Guardar en Museum» con el proyecto Schema 3. Los binarios subidos persisten solo durante la sesión y al reentrar; no persisten tras un F5.
- **Veredicto humano previo:** «KEEP FOR CONTINUATION» (2026-08-16) sobre la sala con física real del donante: 6 561 vértices y 51 040 muelles, Venus, tela, viento, colisión, entrada, salida y reentrada. No se declaró visualmente final; la cámara y el punto de vista quedaron diferidos.
- **Puerta humana pendiente en el origen:** validación visual de los píxeles WebGPU de la tela de la versión Studio PRO V4.1 en un navegador gráfico.

**Por qué no está migrada:**

1. La migración requiere copiar un producto del repositorio privado a este repositorio público. El entorno de ejecución lo bloqueó por política de permisos («Out-of-Place Publication»). Hace falta una autorización explícita en la configuración de permisos.
2. Antes de publicarla hay que resolver sus assets:

| Asset | Licencia | Decisión propuesta |
|---|---|---|
| Venus de Milo (chiwei y Nancy/Lanzi Luo, Sketchfab) | CC Attribution | Mantener con atribución |
| Textura de tela Fabric Lace 038 (3dtextures.me) | CC0 | Mantener |
| HDRI Qwantani Noon, Piazza Martin Lutero y Ninomaru Teien (Poly Haven) | CC0 | Mantener |
| Corset, BoomBox y Lantern (Khronos glTF Sample Assets, 33 MB) | CC0 | Mantener o aligerar (son opcionales) |
| Pétalo de cerezo (Vecteezy) | Licencia gratuita personal; redistribución no clara | **Sustituir** por una textura propia con el mismo nombre y tamaño |
| Hoja de arce (modelo de Sketchfab) | Sin confirmar | **Sustituir** por una textura propia |
| Script de analítica de terceros en `index.html` (`s.holtsetio.com`) | — | **Eliminar**: rastrearía a los visitantes del museo |

3. Necesita WebGPU. Hay que definir una alternativa (aviso o vídeo) para navegadores sin WebGPU.

Cuando se autorice, la ruta del producto pasa a ser relativa dentro del repositorio, en lugar de `/labs/website-modules-source/…`. La comprobación de disponibilidad del invitado ya está preparada: si el producto está servido, se monta tal cual.

## Contrato de sala anidada (resumen)

- Una sala anidada se declara con `space.metadata.nestedRuntime` y `roomOrigin`.
- Solo una presentación es autoritativa. El museo sigue simulando (recorrido, Director y HUD) mientras el invitado presenta.
- El museo decide la cámara y el invitado la renderiza.
- La salida se hace siempre por un portal canónico del WorldGraph: botón-puente abajo a la izquierda, hotspot con `E` o el botón propio del invitado.
