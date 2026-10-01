# 05 · Personaje y avatar (Character 2027)

## Qué es

Un visitante en tercera persona que recorre el museo con un avatar humanoide. Comparte World, cámara y recorrido con la visita en primera persona (POV): no hay un segundo motor, una segunda autoridad de cámara ni una segunda raíz de personaje.

Modelo de éxito del roadmap heredado:

```text
PRESENTE → RIG / ESCALA / APOYO CORRECTOS → MOVIMIENTO LIBRE → COLISIÓN REAL
→ UNA AUTORIDAD DE CÁMARA → PERFIL DE AVATAR → AVATAR STUDIO
→ ACCIONES SEMÁNTICAS → RECORRIDOS / COMPORTAMIENTO CINEMATOGRÁFICO → MUNDO COMPLETO
```

## Cómo se activa

Hoy se activa solo por URL. Cada capa exige las anteriores (`index.html` lo comprueba y, si falta alguna, muestra `CHARACTER GATE ERROR`).

| Parámetros | Capa | Módulo | Estado en el origen |
|---|---|---|---|
| `?character=1` | Presencia e IDLE en Galería A | `character/museum-character-phase3.js` | Puerta humana superada (2026-08-26) |
| `+ &mobility=1` | Tercera persona libre con colisión | `museum-character-phase4a.js` | Aprobada (2026-08-26) |
| `+ &continuity=1` | Continuidad entre salas | `museum-character-phase4b.js` | Cerrada tras aprobación humana |
| `+ &gatea=1` | Capacidades sociales y semánticas de la fase 6 | `museum-character-phase6-gatea.js` | Fusionada en la línea canónica |
| `+ &tour=1` | Puente con el recorrido comentado | `museum-character-tour-bridge.js` | Fusionada en la línea canónica |
| `+ &cinematic=1` | Cámara cinematográfica del personaje | `museum-character-cinematic-camera.js` | Fusionada en la línea canónica |

Ejemplo completo:

```text
index.html?character=1&mobility=1&continuity=1&gatea=1&tour=1&cinematic=1
```

**Pendiente:** la elección **«POV» o «Con mi avatar» al entrar**, sin parámetros, estaba en la PR #83 del origen (borrador, gate humano pendiente). Hay que portarla (ver [ROADMAP](../ROADMAP.md)).

## Acciones

- **Base (Motion Foundation V2):** IDLE, WALK, STOP, TURN L/R, JUMP.
- **Fase 6, Gate A:** WAVE, GOODBYE, NOD, WELCOME, IR, MIRAR, APUNTAR, AFTER YOU.

Las acciones que dependen del contexto (sentarse, abrir una puerta, subir escaleras…) no se simulan donde no existe el objeto o superficie correspondiente. Quedan como `CONTEXT_REQUIRED`.

## Asset del avatar

| Campo | Valor |
|---|---|
| Archivo | `Avatar_1.glb` (asset `character-primary-v1`) |
| Titular | **Juanma** (confirmado el 2026-10-01) |
| Licencia | **Libre**, según el titular. **Falta el nombre exacto** (por ejemplo CC0 o CC BY 4.0) para registrarlo |
| Tamaño y huella | 30 306 028 bytes · SHA-256 `103f0fdbc556566b12412d09f758e13fa171fcec90cb285b8f824adac2c7b0e3` |
| Alojamiento | Remoto: `pub-0f344e596c324724a0b7300e3bc1d129.r2.dev/Avatar%201/Avatar_1.glb` |
| Requisitos de rig | Humanoide con hips, spine, chest, neck, head, brazos, manos, piernas y pies |
| Escala | Normalizada a 1,66 m |

Canal de carga (`character/approved-avatar-asset-loader.js`):

```text
DESCARGA → BYTES → SHA256 → PARSE (GLTFLoader de three r185) → OBJECT3D
```

Si el SHA-256 no coincide, el avatar se rechaza: no se usa un modelo distinto del aprobado.

**Riesgos actuales:**

- Sin el host remoto no hay avatar. En el entorno de la extracción estaba bloqueado, así que el avatar no está validado en este repositorio.
- Son 30 MB por visita. Conviene optimizarlo (Draco o meshopt y texturas KTX2) y alojarlo en un origen controlado, en este repositorio con Git LFS o en el hosting del proyecto.

## Avatar Studio (fase 5)

Es el área **Avatar** del Studio (`?authoring=1`):

- identidad, subir o seleccionar avatar, vista previa, rig, escala, apoyo en el suelo (*grounding*), motion, IK/look-at, acciones y validación;
- el perfil se guarda en `iw.museum.avatar-profile.v1`;
- la continuidad de visibilidad sobrevive a reconstrucciones del Studio;
- **regla:** el runtime del visitante nunca se convierte en el laboratorio de movimiento. El Studio decide la experiencia final.

## Procedencia del código

El código de `character/` es la adaptación del museo de dos donantes del propio titular, congelados en el origen con verificación por hash de blob:

- `Juanmaes83/VECINIA-WORLDS` @ `45e454fe`;
- `Juanmaes83/CharacterStudio` @ `f5a93a48`.

Los donantes congelados (`donors-frozen/`) no se migraron, porque el runtime no los importa. La licencia de CharacterStudio no consta en el origen: hay que confirmarla.

## Lo que falta del roadmap del personaje

- Selector POV o avatar al entrar (PR #83 del origen).
- Exterior Pilot y Full World C2: hay una rama sin fusionar en el origen (`…phase6-exterior-full-world-v1`).
- Integración del personaje con Wet Paint y Breeze (fase 4D del tracker original).
- Asset local y optimizado, y licencia registrada.
