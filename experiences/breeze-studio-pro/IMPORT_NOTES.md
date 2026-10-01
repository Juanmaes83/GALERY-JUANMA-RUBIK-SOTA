# Breeze Studio PRO V4.1: nota de importación

## Procedencia

- **Repositorio:** `Juanmaes83/escaparates-pro`
- **Rama:** `codex/museum-glb-marble-bust-v1`
- **Commit:** `382e566e3125ce3624fd948d0ef64eaa5c1511df`
- **Módulo:** `labs/website-modules-source/breeze-studio-pro/`
- **Destino:** `experiences/breeze-studio-pro/`, rama `import/breeze-studio-pro`

Se han copiado 18 de los 20 archivos del módulo. Todos son copia exacta, salvo `index.html`, que solo cambia en la línea eliminada de la analítica (ver más abajo). Este archivo, `IMPORT_NOTES.md`, es el único añadido.

## Excluido

| Archivo | Motivo |
|---|---|
| `assets/sakuraPetal-uQV6aq54.png` | Textura de pétalo de Vecteezy (acreditada en `CREDITS.md`). Su licencia gratuita no concede de forma clara la redistribución del archivo |
| `assets/mapleleaf--cxqDFQb.png` | Textura de hoja tomada de un modelo de Sketchfab (acreditada en `CREDITS.md`). Su licencia no está confirmada |
| Línea 102 del `index.html` original: `<script defer src="https://s.holtsetio.com/script.js" data-website-id="…">` | Analítica de terceros: rastrearía a los visitantes del museo |

Consecuencias:

- Los dos archivos originales **siguen excluidos**. En su lugar, el commit de integración añade **texturas propias** con el mismo nombre y tamaño, que son los que el bundle referencia (ver la tabla siguiente). Así, los modos «Sakura Petals» y «Autumn Leaves» funcionan sin material de terceros.
- La analítica no aparece en ningún otro archivo del módulo. Se conservan las menciones de **crédito** al autor original:
  - el título y los metadatos `og:` de `index.html`;
  - el panel de créditos del bundle, con el enlace al código fuente `github.com/holtsetio/breeze`.

### Texturas propias de sustitución

| Archivo (nombre que espera el bundle) | Tamaño | SHA-256 | Origen |
|---|---|---|---|
| `assets/sakuraPetal-uQV6aq54.png` | 512×504 RGBA, 74 992 B | `efa6d84fd39c4c58e4fe3d33900007e92ee48dc1d6049e39fa19c98f1c4feff7` | Generada para este repositorio con ImageMagick 6.9: gradiente radial rosa, máscara de pétalo vectorial y venas trazadas. No contiene material de terceros |
| `assets/mapleleaf--cxqDFQb.png` | 512×512 RGBA, 93 121 B | `c12db5589fd78e6d2bb9d3157b318cd1ae3467e9194ff6d3944b0ca826f3fbe2` | Generada para este repositorio con ImageMagick 6.9: gradiente radial ámbar, polígono de hoja de arce y venas trazadas. No contiene material de terceros |

Las imágenes **no** reproducen las fotografías originales. Son representaciones estilizadas con la misma función: textura de partícula con transparencia. Quedan bajo la misma decisión de licencia que el resto del contenido propio del repositorio (pendiente del titular).

## Licencias

Se conservan sin modificar:

- `LICENSE`: MIT, © 2025 Niklas Niehus;
- `CREDITS.md`;
- `README.md`.

Esta nota no declara ninguna licencia que no figure en ellos.

| Asset | Qué dice `CREDITS.md` | Estado |
|---|---|---|
| **Venus de Milo** (`assets/venus_de_milo-Dbz0F30M.glb`) y su colisionador simplificado (`assets/venus_simple2-CmFmRQbP.obj`) | Acredita el modelo de Sketchfab de chiwei y Lanzi Luo, con enlace. **No indica la licencia** | ⚠️ **PENDIENTE.** Hay que confirmar la licencia de redistribución en la página del modelo antes de publicar o fusionar en `main`. Una búsqueda indicó «CC Attribution», pero no se ha podido verificar de primera mano: el dominio estaba bloqueado en el entorno de importación |
| HDRI Qwantani Noon, Piazza Martin Lutero y Ninomaru Teien (Poly Haven) | Acredita a los autores. No indica la licencia | Pendiente de verificación documental |
| Fabric Lace 038 (3dtextures.me) | Acredita la fuente. No indica la licencia | Pendiente de verificación documental |
| Corset, BoomBox y Lantern (Khronos glTF Sample Assets) | Declara **CC0 1.0** | Según `CREDITS.md` |

## Integración en el museo

Hecho en esta rama (commit de integración posterior a la importación):

- **Ruta:** el invitado de la Sala Breeze (`app/nested/breeze/breeze-studio-pro-guest.js`) carga `./experiences/breeze-studio-pro/index.html`.
- **Navegador sin WebGPU:** antes de montar el producto se comprueba que hay un adaptador WebGPU. Si no lo hay, la sala muestra un aviso del museo en español con salida a Galería B, en lugar del error en inglés del producto.
- **Pérdida del dispositivo:** si el producto empieza a lanzar errores en bucle (pérdida del dispositivo WebGPU), la sala muestra «La instalación se ha detenido», con «Reintentar» y «Volver a Galería B».

**Pendiente:** la validación visual de la tela y el viento en un navegador con GPU real. En el entorno de pruebas (WebGPU emulado por CPU con SwiftShader), el dispositivo WebGPU se pierde a los pocos segundos, también con Breeze funcionando solo. **Breeze no está validado.**

## Verificación de identidad con el origen

Desde una copia de cada repositorio:

```bash
cd escaparates-pro/labs/website-modules-source/breeze-studio-pro
for f in $(find . -type f ! -name index.html ! -name 'sakuraPetal-*' ! -name 'mapleleaf-*'); do
  cmp -s "$f" "../../../../GALERY-JUANMA-RUBIK-SOTA/experiences/breeze-studio-pro/$f" || echo "DIFERENTE: $f"
done
diff index.html ../../../../GALERY-JUANMA-RUBIK-SOTA/experiences/breeze-studio-pro/index.html   # solo la línea de analítica
```
