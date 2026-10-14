# Breeze Studio PRO V4.1

Independent Escaparates Pro module built additively from the preserved Breeze engine.

Source engine:
- Juanmaes83/breeze
- pinned commit 0ab82342f9169f20e32b0e90babcc4707e694906

V4.1 authoring model:
- explicit SUBIR -> CARGADO -> START -> APPLIED state;
- image/video background with transform controls;
- image/video mapped to simulated cloth;
- cloth opacity, brightness, contrast and saturation;
- dual-video hardening: cloth grading canvas updates only on decoded video frames, never on every WebGPU render tick;
- requestVideoFrameCallback scheduling with capped CPU grading uploads and legacy timer fallback;
- grading working surface capped at 1024 px to reduce CPU/GPU bandwidth;
- cleanup cancels video-frame callback/timer before disposing old media;
- Scale / Position X / Position Y;
- original Experience modes preserved: Prairie Cloth, Autumn Leaves, Sakura Petals;
- additive Experience presets: Museum Cloth, Gallery Wind, Fashion Drapery, Product Reveal;
- original Venus de Milo preserved;
- generated templates preserved: Torus Knot, Abstract Orbit, Museum Plinth;
- real local CC0 templates from Khronos glTF Sample Assets: Corset mannequin, Lantern, BoomBox;
- uploaded GLB/GLTF/OBJ object support;
- replacement geometry rebuilds the real BVH cloth collider;
- PNG, WebM and clean preview.

V4.1 QA includes a real Chrome dual-video stress test using the renderer's available browser backend: one looping video as background plus another looping video on the cloth for multiple loops, asserting both media streams continue advancing and the browser render heartbeat remains responsive.

Banderolas Dinamicas remains untouched and is not a runtime dependency.
Its proven media-state pattern plus Infinite Worlds V1.3.1 direct video-resource pattern informed V4.1.
