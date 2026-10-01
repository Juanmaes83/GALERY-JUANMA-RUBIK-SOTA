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

- Los modos de experiencia «Sakura Petals» y «Autumn Leaves» se quedan sin su textura hasta que se sustituyan por texturas propias con el mismo nombre y tamaño. El resto de modos y funciones no dependen de ellas.
- La analítica no aparece en ningún otro archivo del módulo. Se conservan las menciones de **crédito** al autor original:
  - el título y los metadatos `og:` de `index.html`;
  - el panel de créditos del bundle, con el enlace al código fuente `github.com/holtsetio/breeze`.

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

## Integración pendiente (fuera de esta rama)

- El invitado de la Sala Breeze (`app/nested/breeze/breeze-studio-pro-guest.js`) sigue apuntando a `/labs/website-modules-source/breeze-studio-pro/index.html`. Al integrar hay que apuntarlo a `./experiences/breeze-studio-pro/index.html`.
- Sustituir las dos texturas excluidas por texturas propias.
- El producto requiere WebGPU. Falta una alternativa para navegadores sin WebGPU.

## Verificación de identidad con el origen

Desde una copia de cada repositorio:

```bash
cd escaparates-pro/labs/website-modules-source/breeze-studio-pro
for f in $(find . -type f ! -name index.html ! -name 'sakuraPetal-*' ! -name 'mapleleaf-*'); do
  cmp -s "$f" "../../../../GALERY-JUANMA-RUBIK-SOTA/experiences/breeze-studio-pro/$f" || echo "DIFERENTE: $f"
done
diff index.html ../../../../GALERY-JUANMA-RUBIK-SOTA/experiences/breeze-studio-pro/index.html   # solo la línea de analítica
```
