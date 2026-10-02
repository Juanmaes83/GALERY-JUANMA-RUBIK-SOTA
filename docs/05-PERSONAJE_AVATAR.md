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

En la entrada, el visitante elige **«POV · primera persona»** o **«Con mi avatar»** (PR #83 del origen, portada). Con avatar, el botón de entrada espera hasta que el personaje está montado y, si no carga, ofrece seguir en POV. Internamente se activa con estas capas de URL; cada una exige las anteriores y, si falta alguna, se muestra `CHARACTER GATE ERROR`:

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

### Continuidad en todas las salas

Antes, la continuidad solo existía entre Galería A ↔ B: cualquier otro cruce devolvía la cámara a primera persona y dejaba el avatar congelado. Ahora todos los portales del WorldGraph mantienen el mismo avatar, el mismo motion y el mismo controlador de cámara.

- Al llegar a una sala, el avatar avanza lo justo para que la cámara tenga unos 3,3 m libres detrás, y la cámara se recoloca al instante (`reacquire()`).
- En la Sala Breeze (anidada) el avatar se aparca oculto y reaparece al volver a Galería B.
- `npm test` recorre las seis salas con avatar.
- **Pendiente:** validación visual humana.

### Movimiento y cámara

- **Velocidad independiente de los FPS:** la locomoción avanza en subpasos de 0,05 s hasta el `maxDelta` del reloj (0,5 s). A 60, 30 o 10 FPS, o con fotogramas irregulares, el avatar recorre lo mismo (`AVATAR-DT-INDEPENDENT`).
- **Arranque, parada y giro suaves:** la velocidad y el giro se acercan a lo que pide la entrada con la misma constante que la primera persona (≈95 % en un cuarto de segundo). Al soltar, el avatar se detiene en unos 8 cm (`AVATAR-EASE`).
- **Colisión deslizante:** si un paso choca, el avatar conserva la parte libre del movimiento (primero el paso entero, luego cada eje). Contra una esquina se queda quieto en vez de oscilar.
- **Orden del fotograma:** el avatar se mueve antes de que la cámara lo encuadre (`runtime.preCamera`).
- **Cámara:** sigue su desplazamiento respecto al avatar, no un punto de la sala. Caminar la arrastra 1:1; solo se suavizan los cambios de encuadre (giros, obstáculos). La zona muerta es gradual. La línea de visión solo se comprueba contra paredes, techo y obstáculos. Antes también se le exigía la altura mínima de la cámara, y en horizontal todos los candidatos fallaban: la cámara se quedaba quieta y daba saltos de 0,25–0,3 m (`AVATAR-CAMERA-FOLLOW`).
- **Proximidad desde el cuerpo:** con avatar, lo cercano se mide desde el avatar (`runtime.proximitySource`), no desde la cámara que va 3 m detrás (`AVATAR-PROXIMITY-BODY`).
- **Pendiente:** la medición es funcional (posición, velocidad y cámara por fotograma, en SwiftShader). Falta la revisión visual humana en una GPU real.

Los paneles de QA de las fases («PHASE 3/4A/4B · HUMAN GATE») solo se muestran con `?debug=1`.

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
| Alojamiento | **En el repositorio:** `assets/models/character/Avatar_1.glb`, copia idéntica de la que se servía desde r2.dev |
| Requisitos de rig | Humanoide con hips, spine, chest, neck, head, brazos, manos, piernas y pies |
| Escala | Normalizada a 1,66 m |

Canal de carga (`character/approved-avatar-asset-loader.js`):

```text
DESCARGA → BYTES → SHA256 → PARSE (GLTFLoader de three r185) → OBJECT3D
```

Si el SHA-256 no coincide, el avatar se rechaza: no se usa un modelo distinto del aprobado.

**Riesgos actuales:**

- Son 30 MB por visita, y varias rutas de carga usan `cache: 'no-store'`. Conviene optimizarlo (Draco o meshopt y texturas KTX2, objetivo ≤ 5 MB) y permitir la caché del navegador, ya que el SHA-256 garantiza la integridad.

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

- Validación visual humana del avatar en las seis salas, también en móvil.
- Exterior Pilot y Full World C2: hay una rama sin fusionar en el origen (`…phase6-exterior-full-world-v1`).
- Integración del personaje con Wet Paint y Breeze (fase 4D del tracker original).
- Asset local y optimizado, y licencia registrada.
