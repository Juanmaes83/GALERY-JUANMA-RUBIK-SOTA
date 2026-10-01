# 09 · Fuentes en el repositorio madre

Todas las rutas se refieren a `Juanmaes83/escaparates-pro` (privado) @ `382e566e3125ce3624fd948d0ef64eaa5c1511df`, salvo que se indique otra cosa. Abreviaturas:

- `IW/`: `docs/architecture/immersive-worlds/`
- `LAB/`: `labs/immersive-worlds/docs/`

| Documento de este repositorio | Fuentes |
|---|---|
| [01 · Visión y producto](01-VISION_Y_PRODUCTO.md) | `IW/CONSTITUTION.md` §0–4 · `docs/architecture/MUSEUM_PREMIUM_PERSONALIZATION_PLATFORM.md` · `IW/MUSEUM_PRODUCT_ROADMAP_BLOCKS.md` §1–2 · `LAB/MUSEUM_CURRENT_STATE_INTEGRATION_HANDOFF_V2.md` §0 · `IW/MUSEUM_INSTITUTIONAL_EXPERIENCE_QUALITY_BAR.md` |
| [02 · Arquitectura](02-ARQUITECTURA.md) | `IW/CONSTITUTION.md` §5–8 · `IW/DECISION_LOG.md` · `IW/GLOSSARY.md` · cabeceras de `engine/core/runtime.js`, `engine/world/space-lifecycle.js` y `app/nested/nested-room-host.js` · `LAB/MUSEUM_MEDIA_RECOVERY_V2_AND_WET_PAINT_HANDOFF_2026-08-24.md` §1 |
| [03 · Mundo y contenido](03-MUNDO_Y_CONTENIDO.md) | `worlds/museum-v1.world.json` · `IW/MUSEUM_GUIDED_TOUR_CONTRACT.md` · `IW/MUSEUM_PRODUCT_ROADMAP_BLOCKS.md` §2 · `labs/immersive-worlds/README.md` · `LAB/MUSEUM_GLB_MARBLE_BUST_PILOT_2026-09-02.md` |
| [04 · Studio](04-STUDIO.md) | `LAB/MUSEUM_AUTHORING_CAPABILITY_REGISTRY_V2.md` · `LAB/MUSEUM_PHASE2_CAPABILITY_EXPANSION_V1.md` · `LAB/MUSEUM_SPECIAL_ROOMS_STUDIO_RECOVERY_2026-09-01.md` · `IW/MUSEUM_PROJECT_CLOUD_INTEGRATION_DECISION.md` · `authoring/studio/studio-shell.js` |
| [05 · Personaje y avatar](05-PERSONAJE_AVATAR.md) | `LAB/MUSEUM_CHARACTER_AVATAR_2027_SURGERY_ROADMAP.md` · `LAB/MUSEUM_CHARACTER_AVATAR_2027_PROGRESS_TRACKER.md` · `LAB/MUSEUM_CHARACTER_AVATAR_2027_DONOR_PROVENANCE_MANIFEST.md` · `LAB/MUSEUM_CONTROL_RECOVERY_AUDIT_2026-08-27.md` · PR #83 · `character/*.js` |
| [06 · Salas especiales](06-SALAS_ESPECIALES.md) | `experiences/wet-paint-flow/PRESERVATION.md` · `experiences/wet-paint-adapter.js` · `LAB/MUSEUM_BREEZE_INTEGRATION_IMPLEMENTATION_RECORD_V1.md` · `IW/MUSEUM_BREEZE_ROOM_STATUS_AND_GATE.md` · `labs/website-modules-source/breeze-studio-pro/README.md` y `CREDITS.md` · `Juanmaes83/wet-paint-flow@0b9ba9a` (`LICENSE`, `ASSET_PROVENANCE.md`) |
| [07 · Calidad y pruebas](07-CALIDAD_Y_PRUEBAS.md) | `labs/immersive-worlds/qa/run-qa.mjs` · `qa/deterministic-states.js` · `IW/MUSEUM_PRODUCT_ROADMAP_BLOCKS.md` §3 · `LAB/MUSEUM_AUTHORING_CAPABILITY_REGISTRY_V2.md` (regla de cierre) |
| [ROADMAP](../ROADMAP.md) | `IW/MUSEUM_PRODUCT_ROADMAP_BLOCKS.md` (bloques 1–9) · `IW/NEXT_PASSES_MUSEUM_ROADMAP.md` (pases 1–6) · `LAB/MUSEUM_CHARACTER_AVATAR_2027_SURGERY_ROADMAP.md` (fases 0–6) · `LAB/MUSEUM_CURRENT_STATE_INTEGRATION_HANDOFF_V2.md` (lo que no se debe dar por hecho) · `docs/architecture/MUSEUM_PREMIUM_PERSONALIZATION_PLATFORM.md` · ramas `docs/museum-premium-personalization-platform` (`e62087d`) y `docs/museum-owned-capabilities-infinite-worlds` (`8b7f4ed`) |

## Ramas y PR relevantes del origen

| Referencia | SHA | Papel |
|---|---|---|
| PR #61 · `claude/museum-itinerant-living-art-graft-v1` | `eb20782` | Línea de integración del museo |
| PR #85 · `codex/museum-glb-marble-bust-v1` | `382e566` | Base de este repositorio (Marble Bust 01) |
| PR #83 · `codex/museum-avatar-recovery-v1` | `fc153d8` | Avatar en la vista previa de Studio y elección POV o avatar, **pendiente de portar** |
| `chatgpt/museum-character-2027-phase6-exterior-full-world-v1` | `b6bad26` | Traspaso al mundo exterior, sin fusionar |
| Breeze Studio PRO V4.1 · `labs/website-modules-source/breeze-studio-pro/` | donante `c86cd3e2` | Producto de la Sala Breeze, **pendiente de migrar** |
| `Juanmaes83/breeze` | `0ab82342` | Motor de origen de Breeze Studio PRO |
| `Juanmaes83/wet-paint-flow` | `0b9ba9a` | Donante de Wet Paint |
| `Juanmaes83/VECINIA-WORLDS` · `Juanmaes83/CharacterStudio` | `45e454fe` · `f5a93a48` | Donantes de Character 2027 |
