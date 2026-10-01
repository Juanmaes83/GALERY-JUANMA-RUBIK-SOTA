# 01 · Visión y producto

## Qué es

El museo de la Fundación Arenas es la primera prueba canónica de **Immersive Worlds**: un sistema para construir, explorar, conectar, dirigir, narrar y publicar mundos interactivos en la web.

No es una web en 3D de un solo uso. El objetivo es una **plataforma premium, reutilizable y muy configurable** de experiencias inmersivas para:

- museos, galerías y fundaciones;
- exposiciones, ferias e instituciones culturales;
- campañas y presentaciones premium.

Un segundo museo debe crearse, sobre todo, con **configuración y contenido**, sin reconstruir el motor.

```text
IMMERSIVE WORLDS ENGINE        motor semántico reutilizable
        ↓
MUSEUM / GALLERY SCENE KIT     representación museística
        ↓
STUDIO (autoría)               personalización sin código
        ↓
EXPERIENCE PACKAGE             todo lo que define a un cliente
        ↓
EXPERIENCIA PUBLICADA          lo que recorre el visitante
```

## Principio de experiencia

> El visitante no debe sentir que usa una aplicación 3D. Debe sentir que ha entrado en una exposición.

El sistema existe para desaparecer detrás de la exposición.

## Principios que no se negocian

```text
PERSONALIZABLE ≠ GENÉRICO
TODA EXPERIENCIA PUEDE PERSONALIZARSE. EL NIVEL DE CALIDAD NO ES CONFIGURABLE.
LA AUTORÍA AMPLÍA LA EXPRESIÓN; NO EXPONE LA COMPLEJIDAD DEL MOTOR.
MISMA GRAMÁTICA + INSTANCIA ESPACIAL CORRECTA Y ÚNICA → EQUIVALENTES, NO CLONES.
```

Consecuencias prácticas:

- El cliente elige entre políticas curadas (transiciones, encuadres, iluminación en rangos seguros). No toca matemáticas de cámara.
- El medio subido se valida (formato, aspecto, resolución y derechos) antes de colgarlo.
- La accesibilidad y el movimiento reducido son de primera clase.
- La autoría no puede romper en silencio la experiencia publicada.

## Reglas de trabajo heredadas

```text
RECUPERAR ANTES QUE INVENTAR
EXTENDER ANTES QUE DUPLICAR
INTEGRAR LA CAPACIDAD PROBADA, NO RECONSTRUIRLA
UNA VERDAD SEMÁNTICA → VARIAS REPRESENTACIONES
AUTOMATIZAR LA OBSERVACIÓN, NO LA AUTORIDAD DE JUANMA
```

## Qué **no** es

- Un motor de videojuegos genérico ni un sustituto de Unity.
- Un editor 3D universal.
- Una colección de demos de Three.js sin relación entre sí.

## Experience Package (destino)

A medio plazo, una institución se describe como un paquete de datos y no como código a medida:

```text
01 IDENTIDAD      06 MEDIOS DE OBRA        11 RECORRIDOS          16 COMERCIO
02 INSTITUCIÓN    07 CARTELAS / INTERPR.   12 GUÍA IA             17 ACCESIBILIDAD
03 EXPOSICIÓN     08 ILUMINACIÓN           13 PROGRAMACIÓN        18 IDIOMAS
04 SALAS          09 PROYECCIÓN            14 INFO DEL VISITANTE  19 ANALÍTICA
05 COLECCIÓN      10 ESCULTURA / INSTAL.   15 RESERVAS / CTA      20 SOCIAL / COMPARTIR
```

Hoy el Studio cubre, al menos en parte, 01–11 y 13–18, con estas limitaciones:

- **06** (medios de obra): los archivos subidos solo duran la sesión.
- **15** y **16** (reservas y comercio): solo como destinos externos.
- **18** (idiomas): es una base, no una gestión de traducciones madura.

Faltan **12** (guía IA), **19** (analítica) y **20** (compartir). Ver [04-STUDIO](04-STUDIO.md).

## Modelo de negocio (lectura para RUBIK SOTA)

- **Unidad vendible:** una experiencia publicada por institución o exposición, montada desde el Studio con su contenido.
- **Diferencial:** calidad cinematográfica y museográfica constante y semántica reutilizable (un motor y muchos mundos). Además, salas especiales que no se pueden replicar con un visor 3D genérico (Wet Paint, Breeze, avatar).
- **Lo que falta para vender sin intervención técnica:**
  - persistencia en la nube;
  - publicación por cliente;
  - autenticación de autores;
  - hosting.

  Ver la fase 3 del [ROADMAP](../ROADMAP.md).
