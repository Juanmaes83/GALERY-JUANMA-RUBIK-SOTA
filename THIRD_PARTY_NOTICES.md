# Avisos de terceros

Este repositorio redistribuye los siguientes componentes de terceros. Cada uno conserva su licencia original junto a sus archivos.

## Marble Bust 01: escultura 3D

- Autor: **Rico Cilliers**, publicado en **Poly Haven**: <https://polyhaven.com/a/marble_bust_01>
- Licencia: **CC0 1.0 Universal** (dominio público): <https://polyhaven.com/license>
- Archivo: `assets/models/sculpture/marble_bust_01_1k.glb`
  - 897 296 bytes;
  - SHA-256 `846a99ead6340cffbbe2492328ff030d9a53bd2201385195d6ebd21ab63263a5`.
- Conversión: glTF-Transform 4.5.0 empaquetó los cinco archivos fuente 1K oficiales en un GLB autocontenido, sin reducir la geometría.
- Procedencia verificable: `assets/models/sculpture/marble_bust_01_1k.provenance.json`. Ese registro guarda los MD5 de los archivos fuente.
- CC0 no exige atribución; se mantiene por trazabilidad.

## three.js r0.185.1

- © 2010–2026 three.js authors. Licencia **MIT**.
- Archivos: `vendor/three/` (licencia en `vendor/three/LICENSE`, registro en `vendor/three/VENDOR.md`).
- Los bundles de Wet Paint Flow incluyen su propia copia de three.js 0.185.1, también MIT.

## Wet Paint Flow

- © 2026 Simon and contributors. Licencia **MIT**.
- Fuente: `Juanmaes83/wet-paint-flow` @ `0b9ba9a5be665f3a2a8b2450945ec5006e61e2de`.
- Upstream acreditado en la propia app: `github.com/simonxxooxxoo/wet-paint-flow`.
- Archivos: `experiences/wet-paint-flow/`. Se trata de un build determinista congelado, descrito en `PRESERVATION.md`.
- Licencia y avisos copiados verbatim del commit fijado:
  - `experiences/wet-paint-flow/LICENSE`;
  - `experiences/wet-paint-flow/THIRD_PARTY_NOTICES.md`, que incluye three.js y Fluid Paint de David Li, ambos MIT;
  - `experiences/wet-paint-flow/ASSET_PROVENANCE.md`.
- Escenas (`experiences/wet-paint-flow/scenes/`): reproducciones fieles de pinturas de Vincent van Gogh en dominio público. Proceden de The Met Open Access (CC0), RISD, Saint Louis Art Museum y Minneapolis Institute of Art, y de Wikimedia Commons (PD-Art). El detalle por archivo está en `ASSET_PROVENANCE.md`. Commons advierte de que la reutilización puede estar restringida en algunas jurisdicciones.

## Recurso remoto no redistribuido

- **Avatar `Avatar_1.glb`** (Character 2027).
  - No se incluye en este repositorio: se descarga en tiempo de ejecución desde `pub-0f344e596c324724a0b7300e3bc1d129.r2.dev` y se verifica por SHA-256.
  - **Titular:** Juanma, confirmado el 2026-10-01. Licencia libre según el titular; **falta registrar el nombre exacto de la licencia**.

## Contenido propio

- La colección de la Fundación Arenas (`assets/collection/`) es obra propia generada; ver `assets/collection/RIGHTS.md`.
- El código propio del museo **no declara licencia**. Mientras el titular no decida otra cosa, se reservan todos los derechos.
