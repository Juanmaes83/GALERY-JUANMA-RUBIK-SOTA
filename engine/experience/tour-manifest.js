/**
 * Immersive Worlds — Canonical Tour Manifest
 *
 * ONE authoritative order exists in this system, and it is not here.
 *
 * It is `route.chapterRefs → chapter.stepRefs`, flattened by array position in
 * the world file and read by `WorldStore.routeSteps()`. The Experience Director
 * already consumed exactly that. What was missing was any way for anything
 * *else* — a panel, a next button, a test — to derive from it, so a second
 * hand-written order grew beside it and drifted (see TOUR_ORDER_AUDIT_BEFORE.md).
 *
 * This module adds no order of its own. It groups the one that exists.
 *
 *   BEAT       one authored StoryStep. The Director's unit of execution.
 *   TOUR STEP  one narrative moment the visitor is meant to perceive as
 *              "a stop on the tour". Made of one or more consecutive beats.
 *
 * A beat opens a Tour Step when it carries `tourStep: { title }`. Everything
 * after it belongs to that moment until the next marked beat. Consequences that
 * matter, all of them structural rather than enforced by convention:
 *
 *   - canonical numbering is position in the filtered list, so it is contiguous
 *     from 1..N by construction — a gap is not expressible;
 *   - next/previous are array neighbours, so they cannot disagree;
 *   - every beat belongs to exactly one Tour Step, provided the first beat of
 *     the route is marked — which `TOUR-ONE-START` checks;
 *   - inserting a beat mid-moment changes nothing visible. Inserting a *marked*
 *     beat adds one number and renumbers what follows, in one place.
 *
 * Reordering the tour therefore means reordering `stepRefs`. There is nowhere
 * else to edit, and nothing else to keep in sync.
 *
 * No Three.js. No DOM.
 */

/**
 * @typedef {Object} TourStep
 * @property {number} order            1-based canonical position, contiguous
 * @property {string} id               stable technical identity (the opening beat's id)
 * @property {string} title            visible label; copy may change without changing id
 * @property {string} spaceId          Space the moment opens in
 * @property {string[]} beatIds        every beat in this moment, in authored order
 * @property {number} firstBeatIndex   index of the opening beat within the route
 * @property {number} lastBeatIndex    index of the closing beat within the route
 * @property {string|null} previousId
 * @property {string|null} nextId
 */

/**
 * Group a route's beats into the canonical numbered tour.
 *
 * @param {import('../world/world-store.js').WorldStore} store
 * @param {string} routeId
 * @returns {{routeId:string, steps:TourStep[], beats:object[], beatOwner:Map<string,string>}}
 */
export function buildTourManifest(store, routeId) {
  const beats = store.routeSteps(routeId);
  /** @type {TourStep[]} */
  const steps = [];

  beats.forEach((beat, index) => {
    if (beat.tourStep) {
      steps.push({
        order: steps.length + 1,
        id: beat.id,
        title: beat.tourStep.title,
        spaceId: spaceOf(store, beat),
        beatIds: [beat.id],
        firstBeatIndex: index,
        lastBeatIndex: index,
        previousId: null,
        nextId: null
      });
      return;
    }
    // An unmarked beat continues the moment already open. If none is open the
    // route does not begin with a marked beat, which TOUR-ONE-START reports
    // rather than this quietly inventing a step to hold the orphan.
    const open = steps[steps.length - 1];
    if (!open) return;
    open.beatIds.push(beat.id);
    open.lastBeatIndex = index;
  });

  for (let i = 0; i < steps.length; i += 1) {
    steps[i].previousId = i > 0 ? steps[i - 1].id : null;
    steps[i].nextId = i < steps.length - 1 ? steps[i + 1].id : null;
  }

  const beatOwner = new Map();
  for (const step of steps) {
    for (const beatId of step.beatIds) beatOwner.set(beatId, step.id);
  }

  return { routeId, steps, beats, beatOwner };
}

function spaceOf(store, beat) {
  if (!beat.subjectRef) return null;
  const kind = store.kindOf(beat.subjectRef);
  if (kind === 'SPACE') return beat.subjectRef;
  if (kind === 'ENTITY') return store.require(beat.subjectRef).spaceId;
  return null;
}

/**
 * Everything the closed-tour contract asserts, as data.
 *
 * Returned rather than thrown: QA renders it as checks, the panel ignores it,
 * and an author running the prototype is not stopped by a warning. The names
 * match the QA check ids so a failure is greppable in both directions.
 *
 * @param {ReturnType<typeof buildTourManifest>} manifest
 * @returns {{ok:boolean, checks:{id:string, pass:boolean, detail:string}[]}}
 */
export function validateTourManifest(manifest) {
  const { steps, beats, beatOwner } = manifest;
  const checks = [];
  const add = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail: String(detail) });

  add('TOUR-ONE-START',
    steps.length > 0 && steps[0].firstBeatIndex === 0,
    steps.length ? `abre en el beat ${steps[0].firstBeatIndex} (${steps[0].id})` : 'ningún paso canónico');

  add('TOUR-ONE-END',
    steps.length > 0 && steps[steps.length - 1].lastBeatIndex === beats.length - 1,
    steps.length ? `cierra en el beat ${steps[steps.length - 1].lastBeatIndex} de ${beats.length - 1}` : '');

  const orders = steps.map((s) => s.order);
  add('TOUR-ORDER-UNIQUE', new Set(orders).size === orders.length, `${orders.length} pasos`);
  add('TOUR-ORDER-CONTIGUOUS',
    orders.every((order, i) => order === i + 1),
    orders.join(','));

  const ids = steps.map((s) => s.id);
  add('TOUR-IDS-UNIQUE', new Set(ids).size === ids.length, `${ids.length} identidades`);

  const orphans = beats.filter((beat) => !beatOwner.has(beat.id)).map((beat) => beat.id);
  add('TOUR-NO-ORPHANS', orphans.length === 0, orphans.join(', ') || `${beats.length} beats asignados`);

  const linkErrors = [];
  steps.forEach((step, i) => {
    const expectedPrev = i > 0 ? steps[i - 1].id : null;
    const expectedNext = i < steps.length - 1 ? steps[i + 1].id : null;
    if (step.previousId !== expectedPrev) linkErrors.push(`${step.id}.previous`);
    if (step.nextId !== expectedNext) linkErrors.push(`${step.id}.next`);
    // The mutual half: my next's previous must be me.
    if (step.nextId && steps[i + 1].previousId !== step.id) linkErrors.push(`${step.id}↔${step.nextId}`);
  });
  add('TOUR-NEXT-PREV-CONSISTENT', linkErrors.length === 0, linkErrors.join(', ') || `${steps.length} enlaces`);

  add('TOUR-NO-UNEXPECTED-CYCLES',
    steps.length === 0 || (steps[0].previousId === null && steps[steps.length - 1].nextId === null),
    `inicio.previous=${steps[0]?.previousId ?? '—'}, fin.next=${steps[steps.length - 1]?.nextId ?? '—'}`);

  // Reachability is walked rather than assumed: follow nextId from the first
  // step and require that the walk visits every step exactly once.
  const walked = [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  let cursor = steps[0] || null;
  const guard = new Set();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    walked.push(cursor.id);
    cursor = cursor.nextId ? byId.get(cursor.nextId) : null;
  }
  add('TOUR-ALL-REACHABLE', walked.length === steps.length,
    `${walked.length}/${steps.length} alcanzables desde el inicio`);

  return { ok: checks.every((c) => c.pass), checks };
}
