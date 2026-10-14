/**
 * Immersive Worlds — Action dispatch
 *
 * One semantic vocabulary for "something should happen" (IW-DEC-022).
 *
 * A Hotspot activation and a Guided story beat both arrive here as the same
 * kind of message — `{type: 'FOCUS_ENTITY', target: 'artwork.horizonte'}` — so a
 * Scene Kit never invents its own callback for an interaction the product
 * already has a name for, and Explore and Guided drive the world through the
 * identical path.
 *
 * IW-OPEN-009 keeps the taxonomy deliberately small. This is a dispatcher with
 * a closed vocabulary, not a general-purpose scripting engine.
 *
 * No Three.js. No DOM.
 */

import { ACTION } from '../schema/types.js';

export class ActionDispatch {
  /** @param {{bus:import('../core/event-bus.js').EventBus}} deps */
  constructor({ bus }) {
    this.bus = bus;
    /** @type {Map<string, (action:{type:string,target?:string,params?:object}, context:object)=>any>} */
    this._handlers = new Map();
    /** Audit trail — QA reads this to prove Explore and Guided used the same actions. */
    this.log = [];
  }

  /**
   * @param {keyof ACTION} type
   * @param {(action:object, context:object)=>any} handler
   */
  register(type, handler) {
    if (!ACTION[type]) {
      throw new Error(
        `[IW] "${type}" is not a declared Action. Add it to ACTION in engine/schema/types.js ` +
          'if the product genuinely needs a new semantic action.'
      );
    }
    this._handlers.set(type, handler);
    return this;
  }

  /**
   * @param {{type:keyof ACTION, target?:string, params?:object}} action
   * @param {{source:'HOTSPOT'|'EXPERIENCE'|'AUTHOR'|'QA', sourceId?:string}} context
   */
  dispatch(action, context = { source: 'QA' }) {
    if (!action || !ACTION[action.type]) {
      throw new Error(`[IW] cannot dispatch unknown action "${action?.type}"`);
    }
    const handler = this._handlers.get(action.type);
    if (!handler) {
      throw new Error(`[IW] no handler registered for action "${action.type}"`);
    }
    this.log.push({
      type: action.type,
      target: action.target ?? null,
      source: context.source,
      sourceId: context.sourceId ?? null
    });
    if (this.log.length > 200) this.log.shift();
    return handler(action, context);
  }

  /** Which actions have been used, and from where — evidence for the shared-path claim. */
  summary() {
    const bySource = {};
    for (const entry of this.log) {
      bySource[entry.source] = bySource[entry.source] || {};
      bySource[entry.source][entry.type] = (bySource[entry.source][entry.type] || 0) + 1;
    }
    return { total: this.log.length, bySource, recent: this.log.slice(-12) };
  }
}
