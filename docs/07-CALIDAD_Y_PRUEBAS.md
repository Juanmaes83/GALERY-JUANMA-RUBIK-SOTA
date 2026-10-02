# 07 · Calidad y pruebas

## Regla de cierre

Una capacidad está cerrada solo cuando tiene **código, documentación, QA automático y auditoría humana navegable**. Que algo se renderice no basta. La autoría visual es de Juanma: las herramientas automatizan la **observación**, no la aprobación.

## Pruebas automáticas

```bash
npm run check   # sin navegador
npm test        # check + Chromium (Playwright, SwiftShader)
```

### `tools/check-static.mjs`

- Sintaxis de todos los JS (`node --check`) y parseo de todos los JSON.
- **Grafo de referencias** desde `index.html`: imports estáticos y dinámicos, `href`/`src`, `fetch`, `url()` y rutas en strings, resueltos contra el archivo y contra el documento (también dentro del iframe de Wet Paint). Cada referencia local debe existir. Las excepciones se declaran con su motivo en `INERT_REFERENCES`; hoy solo Breeze Studio PRO.
- Cada `content.media.src` del World existe.
- SHA-256, tamaño y licencia de Marble Bust 01 coinciden con su procedencia.

### `tests/proximity.test.mjs`

Sin navegador: qué hotspot elige E cuando hay una puerta y una obra cerca (de frente, de lado, de espaldas, anclas a distinta altura). La geometría es la de la puerta de Breeze cuando la tecla abría la ficha de *Marea baja*.

### `tests/museum-smoke.mjs`

| Grupo | Qué demuestra |
|---|---|
| Arranque | WebGL2, World válido, inicio en el Vestíbulo y botón «Entrar» |
| Invariantes | `window.__IW.assertInvariants()` en verde |
| Recorrido | Las 6 salas a través de los 10 portales canónicos |
| Sala Breeze | Aviso, aviso de proximidad «Volver a la Galería B», salida con `E`, botón-puente alcanzable por el puntero y salida con clic real |
| Accesos y obstáculos | En todas las salas: ninguna obra en el hueco de una puerta, ninguna cuerda cruza una puerta ni atrapa una llegada, cada puerta se cruza con E. Con teclas reales: E entra y sale de Breeze, *Marea baja* abre su ficha, desde la puerta de Wet Paint se camina hacia dentro y cada obra de Wet Paint se resalta y abre su ficha; en móvil, cada una queda encima de su cartela |
| Avatar determinista | Con el bucle parado y `runtime.step(dt)` a mano: la misma distancia a 60, 30, 10 FPS y con fotogramas irregulares; la cámara acompaña sin quedarse quieta ni saltar; arranque y parada suaves; lo cercano se mide desde el avatar; E entra y sale de Breeze con avatar |
| Red | Ninguna petición local rota y ninguna petición externa en la visita base |
| Consola | Sin errores de consola |
| Marble Bust 01 | Modo `GLB` y modo `FALLBACK` forzado, ambos con foco correcto |
| Studio | Monta las 6 áreas, Avatar Studio listo, guardar y recargar conserva la edición, sin errores |
| Avatar | Solo informativo: depende del host remoto |

**Limitaciones:**

- SwiftShader es render por software. No mide el rendimiento de un dispositivo real y no puede validar WebGPU (Breeze).
- No hay pruebas en Safari ni en Firefox.
- No hay auditoría de accesibilidad automatizada (axe o similar).

## Estados deterministas

Están en `qa/deterministic-states.js` y se abren con `?state=<nombre>` o con `await window.__IW.applyState(nombre)`:

```text
museum:lobby-entry · lobby-welcome · gallery-a-overview · artwork-horizonte-focus
sculpture-detail · marble-bust-detail · gallery-a-oblique · portal-a-b-before
portal-a-b-after · archive-teleport · journey-lead-horizonte · guide-accompanied
guide-handoff · journey-lead-division · journey-division · journey-threshold
journey-crossed · journey-noche · journey-proyeccion · proyeccion-permanencia
guide-released · guide-turnaround · guided-completed
```

Sirven para que cualquiera reproduzca el mismo encuadre en una revisión visual o en una regresión.

## Parámetros de diagnóstico

`?tier=LOW|MEDIUM|HIGH` · `?reducedMotion=1` · `?seed=…` · `?glbStone=fallback` · `?visualStone=baseline` · `?portalVariant=A|B|C|D` (D es el canónico).

Desde la consola del navegador:

- `window.__IW.report()`: runtime, medios y modelos;
- `window.__IW.nested.host`: sala anidada;
- `window.__IW_STUDIO`: Studio.

## Método visual heredado

- **Hojas de contacto** como puerta de QA visual, con coherencia vertical (una obra a lo largo de su gramática) y horizontal (todas las obras en la misma fase).
- **La verdad visual** separa la evidencia actual de la histórica.
- Las transiciones se revisan **como secuencia en movimiento**, no solo con capturas de inicio y fin.

## Puertas humanas abiertas

| Puerta | Origen |
|---|---|
| Marble Bust 01: KEEP o ADJUST | PR #85 del origen |
| Studio fase 2: auditoría visual | Registro de capacidades V2 |
| Breeze: píxeles WebGPU en navegador gráfico | Recuperación del 2026-09-01 |
| Avatar: recuperación tras reconstruir Studio y elección POV o avatar | PR #83 del origen |
| Correcciones de este repositorio: salida de Breeze y Studio reactivado | PR #1 de este repositorio |
