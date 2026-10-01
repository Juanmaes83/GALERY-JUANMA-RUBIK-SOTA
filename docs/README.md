# Documentación del museo

Este repositorio es el **canónico** del museo de la Fundación Arenas desde el 2026-10-01 (ver [08-DECISIONES](08-DECISIONES.md), GJR-001). La documentación se ha redactado de nuevo a partir de la del repositorio madre (`Juanmaes83/escaparates-pro`, privado) y del código real. No se ha copiado: cada afirmación procede del código de este repositorio o de un documento del origen citado en [09-FUENTES](09-FUENTES.md).

| Documento | Para qué sirve |
|---|---|
| [01 · Visión y producto](01-VISION_Y_PRODUCTO.md) | Qué es el museo, para quién es y qué principios no se negocian |
| [02 · Arquitectura](02-ARQUITECTURA.md) | Capas, invariantes, ciclo de frame, ciclo de vida de salas, cámara, salas anidadas y mapa de archivos |
| [03 · Mundo y contenido](03-MUNDO_Y_CONTENIDO.md) | Esquema del World, salas y obras, recorrido comentado, derechos de medios y cómo añadir obras o esculturas GLB |
| [04 · Studio](04-STUDIO.md) | El panel de personalización: cómo se abre, qué edita, cómo guarda y qué límites tiene |
| [05 · Personaje y avatar](05-PERSONAJE_AVATAR.md) | Character 2027: capas, parámetros, asset, Avatar Studio y acciones |
| [06 · Salas especiales](06-SALAS_ESPECIALES.md) | Wet Paint (itinerante) y Breeze (instalación), y el contrato de sala anidada |
| [07 · Calidad y pruebas](07-CALIDAD_Y_PRUEBAS.md) | Pruebas automáticas, estados deterministas, invariantes y puertas humanas |
| [08 · Decisiones](08-DECISIONES.md) | Registro de decisiones de este repositorio |
| [09 · Fuentes](09-FUENTES.md) | Trazabilidad con la documentación y los commits del repositorio madre |
| [EXTRACTION_AUDIT](EXTRACTION_AUDIT.md) | Auditoría de la extracción inicial e inventario justificado |
| [../ROADMAP.md](../ROADMAP.md) | El roadmap vigente |

Registros de piezas concretas, conservados del origen:

- [MUSEUM_GLB_MARBLE_BUST_PILOT_2026-09-02.md](MUSEUM_GLB_MARBLE_BUST_PILOT_2026-09-02.md): piloto de Marble Bust 01.
- [MUSEUM_VISUAL_STONE_VASIJA_PREMIUM_V1_2026-09-02.md](MUSEUM_VISUAL_STONE_VASIJA_PREMIUM_V1_2026-09-02.md): *Vasija de arenas*.

## Autoridad

Juanma es Product Owner, autoridad visual y autoridad de merge. Una capacidad **no está cerrada** solo porque se renderice. Necesita estas cuatro cosas:

```text
CÓDIGO + DOCUMENTACIÓN + QA AUTOMÁTICO + AUDITORÍA HUMANA NAVEGABLE
```

Las puertas humanas pendientes aparecen como tales en todos los documentos. Ninguna se da por aprobada.
