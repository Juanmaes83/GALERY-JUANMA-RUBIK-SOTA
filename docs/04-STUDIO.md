# 04 · Studio: el panel de personalización

## Cómo se abre

```text
http://127.0.0.1:4180/index.html?authoring=1
```

Es el punto de entrada **canónico** del Studio en el origen (`MUSEUM_SPECIAL_ROOMS_STUDIO_RECOVERY_2026-09-01`).

- La vista previa del museo queda acoplada en el centro y el Studio la rodea.
- `?authoring=1&shell=vs01` abre la primera versión del editor (VS01). Se conserva solo como línea base de comparación.
- Los bancos de prueba aislados del origen no se han migrado porque duplican el punto de entrada canónico: `breeze-integration-studio.html`, `media-recovery-studio.html` y `wet-paint-studio.html`.

## Barra superior

| Acción | Qué hace |
|---|---|
| **Guardar** | Persiste la configuración (Schema 3) en `localStorage` |
| **Vista previa** | Aplica la configuración y reconstruye el runtime desde los datos |
| **Validar** | Evalúa la preparación (*readiness*) del proyecto |
| **Empezar experiencia** | Sale del Studio a la visita con la configuración aplicada |
| **Exportar proyecto** | Copia el JSON del proyecto al portapapeles |
| **Abrir «Museo de la Bruma» (ejemplo)** | Carga una segunda institución de demostración (`authoring/museum-b.config.json`) para probar que otra institución no necesita cambios de motor |
| **Restaurar la Fundación Arenas** | Vuelve a la configuración base derivada del World |

La vista previa sigue el contrato `ENTRAR → USAR → SALIR → REANUDAR`. Siempre hay un «← Volver al Studio» persistente que restaura área, entidad seleccionada, secciones abiertas y scroll. El botón Atrás del navegador es secundario.

## Áreas

```text
CONSTRUIR    Institución (identidad, claim, marca, fechas)
             Exposición
             Salas → accesibilidad de la sala (sin escalones, ascensor, aseo, asientos, espacio tranquilo)
             Obras → identidad · medios · medidas físicas · presentación física
                     (marco, montaje, material, acabado, cristal, paspartú, peana, altura)
                     · autor y documentación · accesibilidad
CONTENIDO    Medios y cartelas · Artistas (perfiles reutilizables) · Documentos
             · Idiomas con matriz de completitud
EXPERIENCIA  Luz · proyección · recorridos y ritmo · ruta accesible
             · personalización y recomendaciones
VISITANTE    Planificación y calendario · agenda · orientación y mapa · mi visita
             · accesibilidad · memoria · recursos y QR · idiomas · tienda · apoya al museo
PUBLICAR     Preparación de contenido, accesibilidad, idiomas, visitante y comercio · exportar
AVATAR       Identidad, rig, escala, grounding, motion (Avatar Studio, fase 5)
```

Capacidades de la fase 2 (registro V2 del origen):

| Id | Capacidad | Fuente de verdad | Qué **no** incluye |
|---|---|---|---|
| P2-01 | Perfiles de artista | `config.artists[]` y `entities[id].artistId` | — |
| P2-02 | Presentación física | `config.entities[id].presentation` | — |
| P2-03 | Documentos | `config.documents[]` y referencias de entidad | — |
| P2-04 | Multilingüe | `config.languages` | Gestión de traducciones madura |
| P2-05 | Memoria del visitante (favoritos, guardar visita, vuelta) | `iw.museum.visitor.memory.v1`, fuera del proyecto | Identidad entre dispositivos y recuperación real por email |
| P2-06 | Recursos y QR | URL canónica del recurso | Codificación QR local: hoy usa un servicio externo |
| P2-07 | Accesibilidad de sala y ruta accesible | WorldGraph y `config.rooms[id].accessibility` | — |
| P2-08 | Tienda | Destino externo | Inventario, carrito y pago |
| P2-09 | Membresía y donaciones | Destinos externos | Pagos y CRM |
| P2-10 | Recomendaciones | Memoria del visitante y metadatos | IA o perfiles entre usuarios |
| P2-11 | Preparación y Schema 3 | Proyecto Schema 3 | Publicación real (ver más abajo) |

Las salas especiales tienen controles nativos:

- **Wet Paint:** acordeón propio con fuente de imagen desde la biblioteca, pinceladas, crecimiento, etc. Ver [06](06-SALAS_ESPECIALES.md).
- **Breeze:** su panel propio y «Guardar en Museum», cuando la sala está presente.

## Qué edita y qué no

- **Sí:** textos, metadatos, medios de obras **existentes**, presentación física, accesibilidad, artistas, documentos, idiomas, información del visitante, luz y proyección, ritmo del recorrido, avatar, y los recursos y destinos comerciales.
- **No:** crear o borrar obras o salas, mover anclajes ni cambiar la arquitectura 3D. Eso se hace en el World (ver [03](03-MUNDO_Y_CONTENIDO.md)).

## Persistencia: cómo guarda

| Clave (`localStorage` salvo indicación) | Qué guarda |
|---|---|
| `iw.museum.authoring.v1` | Proyecto Schema 3 (configuración de autoría) |
| `iw.museum.visitor.phase1.v1` | Datos de visitante de la fase 1 (horarios, accesibilidad, medidas) |
| `iw.museum.validation.v1` | Registro de validaciones |
| `iw.museum.avatar-profile.v1` | Perfil del avatar |
| `iw.museum.avatar-studio-ui.v1` (`sessionStorage`) | Estado de la interfaz del Avatar Studio |
| `iw.wetpaint.personalization.v1` | Personalización de Wet Paint |
| `iw.museum.visitor.memory.v1` | Memoria del **visitante**, separada a propósito del proyecto |

Ciclo de vida de un medio subido:

```text
SELECCIONADO → (subiendo) → LISTO en la sesión (authored:<id>, object URL)
            ✗ no sobrevive al cerrar la pestaña: los bytes no se guardan
```

Esa es la **brecha principal del producto**:

1. **Los archivos subidos no persisten.** El destino diseñado en el origen es Project Cloud de escaparates-pro (`project_assets` en R2). Sus referencias son `asset:<uuid>`, y el estado `READY` no equivale a `SAVED`. El adaptador `authoring/project-cloud/asset-client.js` está «solo preparado» y no está conectado. Al ser este repositorio el canónico, hay que decidir el backend (ver [ROADMAP](../ROADMAP.md), fase 3).
2. **No hay publicación.** El visitante lee `ConfigStore.load()` (el `localStorage` de **su** navegador) o la base del World. Lo que un autor guarda solo lo ve él. «Exportar proyecto» copia el JSON, pero no existe todavía ni importación ni un archivo de configuración publicada que lean los visitantes.
3. **No hay autenticación.** Cualquiera puede abrir `?authoring=1`. Hoy no es un riesgo porque solo edita su propio navegador, pero lo será en cuanto el Studio publique.

## Validación en esta versión

`npm test` comprueba:

- que el Studio monta las seis áreas;
- que el Avatar Studio está listo;
- que una edición se guarda y sobrevive a la recarga;
- que no hay errores de consola.

La auditoría visual humana de la fase 2 sigue **pendiente**, como en el origen.
