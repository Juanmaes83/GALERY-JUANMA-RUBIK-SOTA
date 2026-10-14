/**
 * Immersive Worlds — World Graph
 *
 * Spaces are nodes, Portals are directed edges. This is *data*, not a minimap:
 * the World Map UI reads this graph, and so does the lifecycle manager when it
 * decides which Space is "next likely" and worth preloading.
 *
 * WORLD GRAPH ≠ WORLD MAP ≠ ROUTE
 *   graph = every connection that exists
 *   map   = a visual representation of the graph
 *   route = one authored path through part of it
 *
 * Pattern reference: IW-REF-006 (space graph / connectivity). Concepts only.
 * No Three.js. No DOM.
 */

import { RECORD } from '../schema/types.js';

export class WorldGraph {
  /** @param {import('./world-store.js').WorldStore} store */
  constructor(store) {
    this.store = store;
    /** @type {Map<string, {portalId:string, to:string}[]>} */
    this._out = new Map();
    /** @type {Map<string, {portalId:string, from:string}[]>} */
    this._in = new Map();

    for (const space of store.spaces) {
      this._out.set(space.id, []);
      this._in.set(space.id, []);
    }
    for (const portal of store.portals) {
      this._out.get(portal.fromSpaceId).push({ portalId: portal.id, to: portal.toSpaceId });
      this._in.get(portal.toSpaceId).push({ portalId: portal.id, from: portal.fromSpaceId });
    }
  }

  get nodes() {
    return this.store.spaces.map((space) => ({
      id: space.id,
      title: space.title,
      type: space.type
    }));
  }

  get edges() {
    return this.store.portals.map((portal) => ({
      id: portal.id,
      from: portal.fromSpaceId,
      to: portal.toSpaceId,
      behaviour: portal.transitionBehaviour
    }));
  }

  /** Portals leaving a space. */
  exits(spaceId) {
    return (this._out.get(spaceId) || []).map((edge) => this.store.require(edge.portalId, RECORD.PORTAL));
  }

  /** Portals arriving at a space. */
  entrances(spaceId) {
    return (this._in.get(spaceId) || []).map((edge) => this.store.require(edge.portalId, RECORD.PORTAL));
  }

  /** Spaces one portal away — the preload candidate set. */
  neighbours(spaceId) {
    return [...new Set((this._out.get(spaceId) || []).map((edge) => edge.to))];
  }

  /** Breadth-first shortest path of space IDs, or null when unreachable. */
  path(fromSpaceId, toSpaceId) {
    if (fromSpaceId === toSpaceId) return [fromSpaceId];
    const previous = new Map([[fromSpaceId, null]]);
    const queue = [fromSpaceId];
    while (queue.length) {
      const current = queue.shift();
      for (const next of this.neighbours(current)) {
        if (previous.has(next)) continue;
        previous.set(next, current);
        if (next === toSpaceId) {
          const path = [next];
          let step = current;
          while (step !== null) {
            path.unshift(step);
            step = previous.get(step);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return null;
  }

  /** Spaces unreachable from the world's start — an authoring mistake worth surfacing. */
  unreachableFrom(startSpaceId) {
    const seen = new Set([startSpaceId]);
    const queue = [startSpaceId];
    while (queue.length) {
      for (const next of this.neighbours(queue.shift())) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return this.store.spaces.map((s) => s.id).filter((id) => !seen.has(id));
  }
}
