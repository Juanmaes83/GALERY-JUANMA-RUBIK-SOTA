# Museum visual stone — Vasija premium v1

Fecha: 2026-09-02  
Rama: `codex/museum-visual-stone-vasija-v1`  
Base: `claude/museum-itinerant-living-art-graft-v1` (`b1efb37`)

## Decisión

La primera mejora visual se aplica a una obra que ya existía y funcionaba:
`entity.sculpture.vasija-de-arenas`, en la Galería A. No se crea una segunda
obra, no se cambia su contenido, no se altera su hotspot y no se introduce una
nueva ruta de interacción.

La representación `plinth-vessel-premium-v1` utiliza geometría authorada. Para
esta primera piedra se evita incorporar un GLB externo: así no aparecen una
licencia, peso de red ni dependencia de procedencia antes de validar el lenguaje
visual.

## Capas recuperadas y mejoradas

1. Obra existente: Vasija de arenas, Teresa Miralles, 1986.
2. Soporte con volumen: cuerpo mineral, tapa diferenciada y junta de sombra.
3. Geometría authorada: perfil torneado, boca hueca y anillos cerámicos.
4. Material premium: cerámica física con barniz contenido y detalles metálicos.
5. Luz local dirigida: foco propio más relleno cálido, sin consumir sombras de móvil.
6. Placa museográfica: soporte físico y textura derivada del contenido canónico.
7. Señal de proximidad: fina incrustación en el pedestal, no un elemento flotante.
8. Focus existente: se conserva `FOCUS_ENTITY` y su autoridad de cámara.
9. Inspección existente: el foco modula luz y material sin crear otro modo paralelo.

## Arquitectura

La distancia continúa calculándose en `ProximitySystem`. Cuando el estado
semántico cambia, el sistema notifica el método de presentación ya declarado
por el contrato de Scene Kit. El Museum Scene Kit observa `AVAILABLE`, `NEAR` y
`ACTIVE`; nunca calcula distancias ni despacha acciones.

La comparación visual es reversible mediante query string:

- `visualStone=premium`: presentación nueva (valor predeterminado).
- `visualStone=baseline`: representación anterior del mismo registro.

Este selector sólo cambia la presentación de revisión. No modifica World State,
el hotspot, el recorrido, las cámaras ni el contenido de la colección.

## Verificación realizada

- `git diff --check`: correcto.
- Sintaxis Node de los cuatro módulos modificados: correcta.
- `node labs/immersive-worlds/qa/run-qa.mjs`: 24/24 comprobaciones correctas.
- Esquema: 0 errores, 0 avisos.
- Captura determinista: `museum:sculpture-detail`.

## Veredicto humano solicitado

Revisar la presentación nueva y compararla con la base en el estado determinista
`museum:sculpture-detail`. Responder **KEEP** si se adopta esta dirección o
**ADJUST** indicando el elemento exacto (vasija, pedestal, placa, luz o señal de
proximidad) y el cambio deseado.
