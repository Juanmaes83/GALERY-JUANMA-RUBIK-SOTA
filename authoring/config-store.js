/**
 * Museum — local configuration store.
 *
 * Browser-local on purpose for this slice: the point is to prove that authoring
 * is data that survives a reset, not to choose a cloud yet.
 *
 * REUSE NOTE. `js/customization/project-store-local.js` uses IndexedDB with a
 * normalise-on-write pass. The normalise-on-write discipline is adopted; the
 * storage is `localStorage`, because a config is a few kilobytes of JSON and
 * IndexedDB's ceremony buys nothing at this size. When authored media has to
 * outlive the tab, that trade flips and IndexedDB is the right answer — recorded
 * as a known limitation rather than pretended away.
 */

import { normaliseConfig, exportConfigJSON, importConfigJSON } from './experience-config.js';

const KEY = 'iw.museum.authoring.v1';

export const ConfigStore = {
  save(config) {
    const normalised = normaliseConfig(config);
    localStorage.setItem(KEY, JSON.stringify(normalised));
    return normalised;
  },

  load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try { return importConfigJSON(raw); } catch { return null; }
  },

  clear() { localStorage.removeItem(KEY); },

  toJSON: exportConfigJSON,
  fromJSON: importConfigJSON
};
