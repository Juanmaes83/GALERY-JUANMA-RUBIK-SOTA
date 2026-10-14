/**
 * Immersive Worlds — Deterministic QA states
 *
 * Constitution §23: the runtime must expose named, repeatable states. Not
 * "navigate to roughly the third painting and take a screenshot" — a name, a
 * fixed pose, a fixed world state, reproducible on every run and on every
 * machine.
 *
 * These are the states the Playwright suite captures and compares. They are
 * also useful by hand: append `?state=museum:gallery-a-overview` to the URL.
 *
 * Every state is expressed in *semantic* operations plus one explicit camera
 * pose. Nothing here reaches into the Scene Kit.
 */

/** @typedef {import('../engine/core/runtime.js').Runtime} Runtime */

/**
 * @type {Record<string, {description:string, apply:(runtime:Runtime)=>Promise<void>|void}>}
 */
export const DETERMINISTIC_STATES = {
  'museum:lobby-entry': {
    description: 'Vestíbulo desde el punto de entrada, mirando hacia la puerta de la Galería A.',
    apply(runtime) {
      runtime.explore.setPose({ position: [0, 1.62, 3.1], yaw: Math.PI, pitch: -0.02 });
    }
  },

  'museum:lobby-welcome': {
    description: 'Panel de bienvenida del vestíbulo, con el banco en el encuadre.',
    apply(runtime) {
      runtime.explore.setPose({ position: [-2.2, 1.62, 0.4], yaw: -Math.PI / 2, pitch: -0.03 });
    }
  },

  'museum:gallery-a-overview': {
    description: 'Galería A desde el eje de entrada: la obra protagonista al fondo, las secundarias en los paramentos laterales.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      // On the axis, where a visitor actually arrives. If the composition only
      // works from a chosen diagonal, it is not a composition.
      runtime.explore.setPose({ position: [-0.9, 1.62, -8.6], yaw: Math.PI, pitch: -0.015 });
    }
  },

  'museum:artwork-horizonte-focus': {
    description: 'Modo Focus sobre "Horizonte interrumpido" — encuadre calculado desde el tamaño semántico.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      runtime.explore.setPose({ position: [-4.8, 1.62, -12.4], yaw: Math.PI, pitch: 0 });
      runtime.actions.dispatch(
        { type: 'FOCUS_ENTITY', target: 'entity.artwork.horizonte-interrumpido' },
        { source: 'QA' }
      );
    }
  },

  'museum:sculpture-detail': {
    description: 'Vasija de arenas sobre peana, encuadre de detalle.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      runtime.explore.setPose({ position: [3.6, 1.62, -6.2], yaw: Math.PI, pitch: -0.12 });
      runtime.actions.dispatch(
        { type: 'FOCUS_ENTITY', target: 'entity.sculpture.vasija-de-arenas' },
        { source: 'QA' }
      );
    }
  },

  'museum:marble-bust-detail': {
    description: 'Obra invitada Marble Bust 01: GLB local, pedestal P02 y encuadre de inspección.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      runtime.explore.setPose({ position: [-4.3, 1.62, -5.75], yaw: Math.PI, pitch: -0.09 });
      runtime.actions.dispatch(
        { type: 'FOCUS_ENTITY', target: 'entity.sculpture.marble-bust-study' },
        { source: 'QA' }
      );
    }
  },

  'museum:gallery-a-oblique': {
    description: 'Galería A en diagonal: ritmo lateral, escultura y banco en un mismo encuadre.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      runtime.explore.setPose({ position: [-5.2, 1.62, -6.4], yaw: Math.PI - 0.62, pitch: -0.03 });
    }
  },

  'museum:portal-a-b-before': {
    description: 'Galería A frente al paso abierto hacia la Galería B, antes de cruzar.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      runtime.explore.setPose({ position: [5.2, 1.62, -10], yaw: Math.PI / 2, pitch: -0.02 });
    }
  },

  'museum:portal-a-b-after': {
    description: 'Galería B recién cruzado el paso: sala oscura, perfil visual distinto, mismos contratos.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      await runtime.traversePortal('portal.gallery-a-gallery-b', { source: 'QA' });
      runtime.explore.setPose({ position: [12.4, 1.62, -11.2], yaw: Math.PI - 0.5, pitch: -0.02 });
    }
  },

  'museum:archive-teleport': {
    description: 'Archivo, alcanzado por un portal TELEPORT desde la Galería A. Perfil heritage.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      await runtime.traversePortal('portal.gallery-a-archive', { source: 'QA' });
      runtime.explore.setPose({ position: [-10.2, 1.62, -10], yaw: -Math.PI / 2, pitch: -0.05 });
    }
  },

  'museum:journey-lead-horizonte': {
    description: 'En marcha: la guía camina hacia «Horizonte interrumpido» y la cámara llega detrás de ella.',
    apply: (runtime) => beat(runtime, 'step.03-lleva-horizonte')
  },

  'museum:guide-accompanied': {
    description: 'Parada acompañada: la guía presenta «Horizonte interrumpido» y la cámara mira por encima de su hombro.',
    apply: (runtime) => beat(runtime, 'step.04-horizonte')
  },

  'museum:guide-handoff': {
    description: 'Cesión: la guía se aparta, la cámara entra en el punto de vista del visitante y la obra queda sola.',
    apply: (runtime) => beat(runtime, 'step.04b-horizonte-cesion')
  },

  'museum:journey-lead-division': {
    description: 'Segundo tramo: la guía lleva al visitante por el mismo paramento hasta «División tercera».',
    apply: (runtime) => beat(runtime, 'step.05-lleva-division')
  },

  'museum:journey-division': {
    description: 'Segunda parada acompañada, misma gramática y distinta obra.',
    apply: (runtime) => beat(runtime, 'step.06-division')
  },

  'museum:journey-threshold': {
    description: 'La guía conduce al umbral de la cámara oscura, antes de cruzarlo.',
    apply: (runtime) => beat(runtime, 'step.07-lleva-umbral')
  },

  'museum:journey-crossed': {
    description: 'Ya dentro de la cámara oscura: la guía ha cruzado el umbral y sigue delante.',
    apply: (runtime) => beat(runtime, 'step.09-lleva-noche')
  },

  'museum:journey-noche': {
    description: 'Tercera parada acompañada, en la sala oscura.',
    apply: (runtime) => beat(runtime, 'step.10-noche')
  },

  'museum:journey-proyeccion': {
    description: 'Cuarta parada acompañada: la guía presenta la proyección sobre el muro.',
    apply: (runtime) => beat(runtime, 'step.10d-cuaderno')
  },

  'museum:proyeccion-permanencia': {
    description: 'La parada larga ante la proyección: la guía se aparta y el visitante se queda con la luz.',
    apply: (runtime) => beat(runtime, 'step.10e-cuaderno-permanencia')
  },

  'museum:guide-released': {
    description: 'Después de la cesión: recorrido abandonado, la guía se retira y el visitante queda con la obra.',
    async apply(runtime) {
      await beat(runtime, 'step.10b-noche-cesion');
      runtime.exitRoute();
      await settleGuide(runtime);
    }
  },

  'museum:guide-turnaround': {
    description: 'Vuelta de personaje: el guía aislado en la sala, para comparar diseños bajo la misma luz.',
    async apply(runtime) {
      await runtime.traversePortal('portal.lobby-gallery-a', { source: 'QA' });
      runtime.stageGuide({
        anchorId: 'anchor.gallery-a.guide-horizonte',
        subjectRef: 'entity.artwork.horizonte-interrumpido'
      });
      await settleGuide(runtime);
      // Standing distance, eye height, square to the figure.
      runtime.explore.setPose({ position: [-2.5, 1.5, -10.55], yaw: Math.PI, pitch: -0.04 });
    }
  },

  'museum:guided-step-04': {
    description: 'Recorrido comentado detenido en la parada canónica 04 «La cámara oscura», bajo autoridad DIRECTED.',
    // By canonical tour step, not by counting next() calls. Counting was a
    // fourth ordering that silently retargeted whenever a beat was inserted
    // before it — see TOUR_ORDER_AUDIT_BEFORE.md §5.
    async apply(runtime) {
      await runtime.goToTourStep('step.07-lleva-umbral');
      runtime.experience.pause();
      await settleGuide(runtime);
    }
  },

  'museum:guided-completed': {
    description: 'Recorrido terminado de verdad: se agotan todos los beats, la cámara vuelve al visitante y el mundo conserva lo visitado.',
    // Previously advanced a hardcoded nine times, which stopped at parada 10 of
    // 17 while still calling itself "completed". Now it runs until the Director
    // itself reports the route finished.
    async apply(runtime) {
      runtime.startRoute('route.comentado');
      runtime.experience.pause();
      const total = runtime.experience.steps.length;
      for (let i = 0; i <= total && runtime.experience.transport !== 'IDLE'; i += 1) {
        runtime.experience.next();
        await settleMicrotasks();
      }
    }
  }
};

/** Portal traversal is async; give queued promises a chance to resolve. */
function settleMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Reach one beat of the journey and hold there, guide settled.
 *
 * Every journey state is the same operation with a different step id, so there
 * is one place where "reach a beat" is defined and no state can drift from the
 * others.
 */
async function beat(runtime, stepId) {
  await runToStep(runtime, stepId);
  await settleGuide(runtime);
}

/**
 * Advance the commented route to a named step and hold there.
 *
 * By step id rather than by counting `next()` calls, so inserting a beat into
 * the route does not silently retarget every state that came after it.
 */
async function runToStep(runtime, stepId) {
  runtime.startRoute('route.comentado');
  // Pause immediately. The route is a timeline: left playing, its own clock
  // keeps advancing while this loop steps manually, so the beat you asked for
  // is reached and then walked past before anything can look at it. That is the
  // "checkpoint appears briefly and is overwritten" failure — the state was
  // racing the director rather than driving it.
  runtime.experience.pause();
  for (let i = 0; i < 40; i += 1) {
    if (runtime.experience.currentStep?.id === stepId) break;
    runtime.experience.next();
    // Real time, not a microtask. A portal step has to build and warm a Space
    // before its shot can be framed, and on completion the traversal places the
    // camera at the arrival anchor. Skipping ahead within the same tick lets
    // that arrival land *after* a later step has already framed its shot, and
    // the room you end up looking at is the one you walked into rather than the
    // one the step is about. A visitor waiting out the step durations never
    // races it; a QA state that advances instantly does.
    await settleStep(runtime.experience.currentStep);
  }
  runtime.experience.pause();
}

/**
 * Long enough for a portal step to finish arriving.
 *
 * A fixed wait rather than a lifecycle poll: the thing being waited on is the
 * tail of a promise chain that ends in a camera placement, and the Space being
 * READY is not the same event. Polling the lifecycle returned before the
 * arrival landed and the state captured the wrong room.
 */
function settleStep(step) {
  // A portal step builds and warms a Space before its shot can be framed, and
  // on completion the traversal places the camera at the arrival anchor. Under
  // software rendering that is seconds, not milliseconds.
  const isPortal = step?.shotIntent === 'PORTAL';
  return new Promise((resolve) => setTimeout(resolve, isPortal ? 2500 : 320));
}

/**
 * Let the guide reach its staging.
 *
 * It approaches its target exponentially, so it is always strictly *near* the
 * pose and never exactly on it. A capture taken mid-approach would be evidence
 * of the wrong thing, so the state drives the same update the frame loop drives
 * until the remaining distance stops mattering.
 */
function settleGuide(runtime) {
  return new Promise((resolve) => {
    // She walks at about a metre a second, so a room's width is several seconds
    // of simulated time. Driving the same update the frame loop drives, rather
    // than waiting in real time, keeps the state fast and exactly repeatable.
    for (let i = 0; i < 900; i += 1) runtime.sceneKit.update?.(1 / 60, i / 60);
    setTimeout(resolve, 0);
  });
}

export const STATE_NAMES = Object.keys(DETERMINISTIC_STATES);
