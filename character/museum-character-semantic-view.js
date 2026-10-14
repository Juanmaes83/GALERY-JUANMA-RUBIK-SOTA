function tail(id = '') {
  return String(id).split('.').pop() || String(id);
}

function labelOf(record) {
  return record?.accessibility?.label || record?.title || record?.label || record?.name || record?.id || 'Destino';
}

function entityAnchor(store, entity) {
  const id = entity?.anchorId;
  return id && store.has(id) ? store.get(id) : null;
}

function visitorKey(anchorId = '') {
  const marker = '.visitor-';
  const at = String(anchorId).indexOf(marker);
  return at >= 0 ? String(anchorId).slice(at + marker.length) : '';
}

function matchesEntity(anchor, entity) {
  const key = visitorKey(anchor?.id);
  const entityTail = tail(entity?.id);
  if (!key || !entityTail) return false;
  return entityTail === key || entityTail.startsWith(`${key}-`) || key.startsWith(`${entityTail}-`);
}

function lookPoint(store, entity, visitorAnchor) {
  const subjectAnchor = entityAnchor(store, entity);
  if (Array.isArray(subjectAnchor?.position)) return [...subjectAnchor.position];
  if (Array.isArray(entity?.position)) return [...entity.position];
  const p = visitorAnchor?.position;
  const n = visitorAnchor?.normal;
  if (Array.isArray(p) && Array.isArray(n)) return [p[0] + n[0] * 2.2, p[1] + 1.25 + n[1] * 2.2, p[2] + n[2] * 2.2];
  return Array.isArray(p) ? [p[0], p[1] + 1.25, p[2] - 2] : null;
}

export function createMuseumCharacterSemanticView(runtime) {
  if (!runtime?.store) throw new Error('Gate A semantic view requires canonical runtime.store');
  const store = runtime.store;

  function build(spaceId = runtime.state?.activeSpaceId) {
    if (!spaceId || !store.has(spaceId)) return { spaceId, destinations:[], classifications:[], source:'CANONICAL_WORLDSTORE_DERIVED_VIEW' };
    const entities = store.entitiesOf(spaceId) || [];
    const anchors = store.anchorsOf(spaceId) || [];
    const hotspots = store.hotspotsOf(spaceId) || [];
    const visitorAnchors = anchors.filter((a) => String(a.id).includes('.visitor-'));
    const destinations = [];
    const classifications = [];

    for (const entity of entities) {
      const anchor = visitorAnchors.find((candidate) => matchesEntity(candidate, entity));
      if (!anchor || !Array.isArray(anchor.position)) {
        classifications.push({ id:entity.id, state:'CONTEXT_REQUIRED', reason:'No authored visitor viewpoint in active Museum space' });
        continue;
      }
      const lookAt = lookPoint(store, entity, anchor);
      if (!lookAt) {
        classifications.push({ id:entity.id, state:'CONTEXT_REQUIRED', reason:'No resolvable subject look target' });
        continue;
      }
      destinations.push({
        id:`view:${entity.id}`,
        label:labelOf(entity),
        role:'PREFERRED_VIEWPOINT',
        subjectRef:entity.id,
        anchorId:anchor.id,
        position:[...anchor.position],
        lookAt,
        spaceId,
        provenance:{ entity:entity.id, visitorAnchor:anchor.id, source:'WORLDSTORE' }
      });
      classifications.push({ id:entity.id, state:'READY', anchorId:anchor.id });
    }

    return {
      spaceId,
      destinations,
      classifications,
      source:'CANONICAL_WORLDSTORE_DERIVED_VIEW',
      counts:{ entities:entities.length, anchors:anchors.length, hotspots:hotspots.length, viewpoints:destinations.length },
      canonicalIdentity:store.auditCanonicalIdentity?.() || null
    };
  }

  return Object.freeze({
    build,
    resolve(id, spaceId = runtime.state?.activeSpaceId) {
      const view = build(spaceId);
      const destination = view.destinations.find((item) => item.id === id);
      return destination ? { ok:true, destination, view } : { ok:false, reason:'UNKNOWN_OR_UNAVAILABLE_SEMANTIC_DESTINATION', id, view };
    },
    audit() { return build(runtime.state?.activeSpaceId); }
  });
}
